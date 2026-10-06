// ── FLUX DE CONVERSATION ──────────────────────────────────────────────────
// Architecture : UI (chat.js) -> état (chatFlow, ci-dessous) -> réseau (api.js)
// -> backend. Ce module gère tout ce qui touche au CYCLE D'UN ENVOI :
//   • les états du bouton  idle -> ready -> sending -> streaming -> completed | error
//   • le streaming progressif de la réponse (lecture du texte partiel côté serveur)
//   • les erreurs expliquées, avec « Réessayer » (le message n'est jamais perdu)
//   • l'annulation, la régénération, la copie, la modification
//   • le défilement qui suit le bas seulement si l'utilisateur y est déjà

// ═══ Constantes et état ═══════════════════════════════════════════════════
const CHAT_MAX_WAIT_MS=4*60*1000;
const SEND_LABELS={
  idle:'Envoyer',
  ready:'Envoyer le message',
  sending:'Envoi en cours…',
  streaming:'Arrêter la génération',
  completed:'Réponse terminée',
  error:'Échec — réessayer',
};
const chatFlow={
  state:'idle',        // idle | ready | sending | streaming | completed | error
  ctx:null,            // envoi en cours : {jobId,startedAt,stopped,payload,opts}
  lastRegenPayload:null,
  regen:null,          // régénération en cours : {row,oldAssistant}
  regenRow:null,
  editBtn:null,
  resetTimer:null,
};
let pendingChatJobId=null,pendingChatOriginalMsg='';

const ICONS={
  copy:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  speak:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
  regen:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></svg>',
  edit:'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
};

function aiActionsHtml(){
  return '<div class="msg-actions" role="toolbar" aria-label="Actions sur la réponse">'+
    '<button type="button" class="msg-act" data-act="copy" aria-label="Copier la réponse" title="Copier">'+ICONS.copy+'<span>Copier</span></button>'+
    '<button type="button" class="msg-act" data-act="speak" aria-label="Écouter la réponse" title="Écouter">'+ICONS.speak+'</button>'+
    '<button type="button" class="msg-act" data-act="regen" aria-label="Régénérer la réponse" title="Régénérer" hidden>'+ICONS.regen+'<span>Régénérer</span></button>'+
    '</div>';
}

// ═══ Défilement ═══════════════════════════════════════════════════════════
// L'élément qui défile est #tab-chat (le panneau), pas #chatbox : faire défiler
// #chatbox ne produisait rien — le chat ne descendait jamais vers les nouveaux
// messages.
let chatPinned=true;
function _chatScroller(){return document.getElementById('tab-chat');}

function scrollChatToBottom(force){
  const sc=_chatScroller();
  if(!sc)return;
  if(force||chatPinned){
    chatPinned=true;
    sc.scrollTop=sc.scrollHeight;
    // 2e passe : avec content-visibility, la hauteur réelle des derniers messages
    // n'est connue qu'une fois rendus.
    requestAnimationFrame(()=>{if(chatPinned)sc.scrollTop=sc.scrollHeight;updateScrollButton();});
  }
  updateScrollButton(!force&&!chatPinned);
}

function updateScrollButton(hasNew){
  const b=document.getElementById('scroll-bottom-btn');
  const sc=_chatScroller();
  if(!b||!sc)return;
  const away=sc.scrollHeight-sc.scrollTop-sc.clientHeight>120;
  b.hidden=!away;
  b.classList.toggle('has-new',!!hasNew&&away);
}

function initChatScroll(){
  const sc=_chatScroller();
  if(!sc||sc._chatInit)return;
  sc._chatInit=true;
  sc.addEventListener('scroll',()=>{
    chatPinned=sc.scrollHeight-sc.scrollTop-sc.clientHeight<80;
    updateScrollButton();
  },{passive:true});
  // Zone sticky de hauteur nulle : le bouton reste ancré au bas du panneau visible.
  const wrap=document.createElement('div');
  wrap.className='scroll-bottom-wrap';
  const b=document.createElement('button');
  b.id='scroll-bottom-btn';b.type='button';b.hidden=true;
  b.setAttribute('aria-label','Aller au dernier message');
  b.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="m6 13 6 6 6-6"/></svg>';
  b.onclick=()=>{chatPinned=true;sc.scrollTo({top:sc.scrollHeight,behavior:'smooth'});};
  wrap.appendChild(b);
  sc.appendChild(wrap);
  const cb=document.getElementById('chatbox');
  if(cb){
    cb.addEventListener('click',onChatboxClick);
    cb.setAttribute('role','log');
    cb.setAttribute('aria-live','polite');
    cb.setAttribute('aria-relevant','additions');
    cb.setAttribute('aria-label','Conversation avec Sutur');
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initChatScroll);
else initChatScroll();

// ═══ Bouton d'envoi : machine à états ═════════════════════════════════════
function setSendState(state){
  chatFlow.state=state;
  const b=document.getElementById('send-btn');
  if(!b)return;
  b.dataset.state=state;
  b.setAttribute('aria-label',SEND_LABELS[state]||'Envoyer');
  b.title=SEND_LABELS[state]||'Envoyer';
  b.setAttribute('aria-busy',state==='sending'||state==='streaming'?'true':'false');
  b.setAttribute('aria-disabled',state==='idle'||state==='sending'?'true':'false');
}

function syncSendButton(){
  if(['sending','streaming','completed','error'].includes(chatFlow.state))return;
  const inp=document.getElementById('cinp');
  const has=!!((inp&&inp.value.trim())||(typeof currentPhotoB64!=='undefined'&&currentPhotoB64));
  setSendState(has?'ready':'idle');
}

function onSendClick(){
  if(chatFlow.state==='streaming'){
    // Un double-clic sur « Envoyer » ne doit jamais annuler sa propre génération : le bouton
    // devient « Arrêter » dès que le serveur accepte la demande (quelques dizaines de ms),
    // donc le 2e clic d'un double-clic tomberait dessus. Courte période de protection.
    if(chatFlow.ctx&&Date.now()-chatFlow.ctx.startedAt<800)return;
    cancelGeneration();return;
  }
  if(chatFlow.state==='sending')return;
  const inp=document.getElementById('cinp');
  if(!inp.value.trim()&&!(typeof currentPhotoB64!=='undefined'&&currentPhotoB64)){inp.focus();return;}
  sendMsg();
}

let _lastBusyHint=0;
function hintBusy(){
  const now=Date.now();
  if(now-_lastBusyHint<3000)return;
  _lastBusyHint=now;
  showToast('Sutur répond encore — attends la fin ou appuie sur Arrêter.',{duration:2200});
}

function _afterChat(finalState){
  busy=false;
  setStatus('En ligne','idle');
  setSendState(finalState);
  clearTimeout(chatFlow.resetTimer);
  if(finalState==='idle'){syncSendButton();}
  else{
    chatFlow.resetTimer=setTimeout(()=>{
      if(chatFlow.state===finalState){chatFlow.state='idle';syncSendButton();}
    },finalState==='error'?2200:900);
  }
  refreshMessageActions();
}

function _clearPendingJob(){
  pendingChatJobId=null;
  try{localStorage.removeItem('sutur_pending_job');}catch(_){}
}

// ═══ Streaming progressif ═════════════════════════════════════════════════
// Le serveur publie le texte partiel au fil de la génération ; il arrive par
// paquets à chaque interrogation. Le rendu lisse ces paquets (apparition fluide,
// sans à-coups) et reste correct à chaque instant (Markdown incomplet toléré).
const liveStream={row:null,mt:null,target:'',shown:0,raf:0};

function _resetLive(){
  if(liveStream.raf)cancelAnimationFrame(liveStream.raf);
  liveStream.row=null;liveStream.mt=null;liveStream.target='';liveStream.shown=0;liveStream.raf=0;
}

function startLiveMessage(){
  rmTyping();
  const cb=document.getElementById('chatbox');
  const row=buildMsgElement('ai','');
  row.classList.add('is-live');
  row.setAttribute('aria-busy','true');
  const lbl=row.querySelector('.lbl');if(lbl)lbl.remove();
  cb.appendChild(row);
  liveStream.row=row;
  liveStream.mt=row.querySelector('.mt');
  scrollChatToBottom(false);
}

function pushPartial(text){
  if(!text||isTerminal())return; // le thème terminal garde son indicateur « TRAITEMENT_ »
  if(!liveStream.row)startLiveMessage();
  liveStream.target=text;
  if(!liveStream.raf)liveStream.raf=requestAnimationFrame(_liveTick);
}

function _liveTick(){
  const L=liveStream;
  L.raf=0;
  if(!L.row)return;
  if(L.shown<L.target.length){
    const gap=L.target.length-L.shown;
    L.shown=Math.min(L.target.length,L.shown+Math.max(2,Math.ceil(gap/10)));
    const c=L.target.charCodeAt(L.shown-1);
    if(c>=0xD800&&c<=0xDBFF&&L.shown<L.target.length)L.shown++; // ne jamais couper un emoji en deux
    L.mt.innerHTML=renderMarkdown(L.target.slice(0,L.shown))+'<span class="stream-caret" aria-hidden="true"></span>';
    scrollChatToBottom(false);
  }
  if(L.shown<L.target.length)L.raf=requestAnimationFrame(_liveTick);
}

function _setRowLabel(row,text){
  currentAvatarCtx=detectAvatarContext(text);
  const label=AVATAR_CONTEXTS[currentAvatarCtx]?.label||'';
  let lbl=row.querySelector('.lbl');
  if(label){
    if(!lbl){lbl=document.createElement('div');lbl.className='lbl';row.querySelector('.msg-bubble').insertBefore(lbl,row.querySelector('.mt'));}
    lbl.textContent=label;
  }else if(lbl){lbl.remove();}
}

// Remplace la bulle en cours de génération par la réponse définitive, EN PLACE
// (aucun clignotement : c'est le même élément qui devient la bulle finale).
function finalizeLiveMessage(reply,data){
  const row=liveStream.row;
  if(!row)return null;
  row.classList.remove('is-live');
  row.removeAttribute('aria-busy');
  row._src=reply;
  row.querySelector('.mt').innerHTML=renderMarkdown(reply);
  _setRowLabel(row,reply);
  if(data&&data.regenerable)row.dataset.regenerable='1';
  _resetLive();
  refreshMessageActions();
  scrollChatToBottom(false);
  return row;
}

function discardLiveMessage(){
  if(liveStream.row)liveStream.row.remove();
  _resetLive();
}

// Utilisé par handleChatResult : réponse finale, avec ou sans bulle déjà en cours.
function commitAiMessage(reply,speak,data){
  let row;
  if(liveStream.row&&!isTerminal()){
    row=finalizeLiveMessage(reply,data);
    const auto=document.getElementById('t-autospeak');
    if(speak&&auto&&auto.classList.contains('on'))setTimeout(()=>speakText(reply),200);
  }else{
    discardLiveMessage();
    row=addMsg('ai',reply,speak);
    if(row&&data&&data.regenerable)row.dataset.regenerable='1';
  }
  refreshMessageActions();
  return row;
}

// ═══ Attente du résultat (interrogation robuste) ══════════════════════════
function sleepOrWake(ms){
  return new Promise(resolve=>{
    const done=()=>{clearTimeout(t);document.removeEventListener('sutur:wake',done);resolve();};
    const t=setTimeout(done,ms);
    document.addEventListener('sutur:wake',done,{once:true});
  });
}

async function waitForChatResult(ctx){
  let failures=0;
  for(;;){
    if(ctx.stopped)return null;
    if(Date.now()-ctx.startedAt>CHAT_MAX_WAIT_MS)throw new ApiError('Délai dépassé.',{kind:'timeout'});
    let delay=700;
    try{
      const data=await apiCall('/chat/result/'+ctx.jobId,'GET',null,{timeout:15000});
      if(ctx.stopped)return null;
      if(failures>0){failures=0;setNetworkBanner('');setStatus('Traitement...','think');}
      if(!data||data.status!=='processing')return data||{};
      if(data.partial)pushPartial(data.partial);
      delay=data.partial?450:900;
    }catch(e){
      if(ctx.stopped)return null;
      if(e.kind==='notfound'||e.kind==='auth'||e.kind==='forbidden')throw e;
      failures++;
      if(failures>=10)throw e;
      if(failures>=2){setNetworkBanner('Reconnexion en cours…');setStatus('Reconnexion...','think');}
      delay=Math.min(1000*Math.pow(2,failures-1),8000); // 1s, 2s, 4s, 8s…
    }
    await sleepOrWake(delay);
  }
}

// ═══ Envoi ════════════════════════════════════════════════════════════════
// payload : {msg,model,location,image_data,image_type,document_data,document_type,
//            document_name,voice_mode,device_type}
// opts    : {userPushed:true si le message est déjà dans history, regenerate:true}
async function submitChat(payload,opts={}){
  const ctx={jobId:null,startedAt:Date.now(),stopped:false,payload,opts};
  chatFlow.ctx=ctx;
  setSendState('sending');
  setStatus('Envoi...','think');
  addTyping();
  if(typeof navigator!=='undefined'&&navigator.onLine===false){
    failChat(new ApiError('Pas de connexion internet.',{kind:'offline'}),ctx);
    return;
  }
  try{
    const body={
      message:payload.msg,
      model:payload.model,
      history:history.slice(-8),
      location:payload.location,
      image_data:payload.image_data||null,
      image_type:payload.image_type||'image/jpeg',
      document_data:payload.document_data||null,
      document_type:payload.document_type||'application/pdf',
      document_name:payload.document_name||null,
      voice_mode:!!payload.voice_mode,
      device_type:payload.device_type,
      thread_id:currentThreadId,
    };
    if(opts.regenerate)body.regenerate=true;
    const sub=await apiCall('/chat','POST',body,{timeout:60000});
    if(ctx.stopped)return;
    if(!sub||!sub.job_id)throw new ApiError('Réponse inattendue du serveur.',{kind:'server'});
    ctx.jobId=sub.job_id;
    pendingChatJobId=sub.job_id;
    pendingChatOriginalMsg=payload.msg;
    try{localStorage.setItem('sutur_pending_job',JSON.stringify({job_id:sub.job_id,thread_id:currentThreadId,original_msg:payload.msg}));}catch(_){}
    // Photo et document pris en charge par le serveur : la zone de saisie est
    // immédiatement prête pour la suite.
    if(typeof clearPhoto==='function')clearPhoto();
    if(typeof clearPdf==='function')clearPdf();
    setSendState('streaming');
    setStatus('Réflexion...','think');
    const data=await waitForChatResult(ctx);
    if(data===null)return; // arrêt demandé : déjà traité par cancelGeneration()
    finishChat(data,ctx);
  }catch(e){
    if(!ctx.stopped)failChat(e,ctx);
  }
}

function _restoreRegen(keepNewAnswer){
  const r=chatFlow.regen;
  if(!r)return;
  chatFlow.regen=null;
  if(keepNewAnswer){ // la nouvelle réponse (même partielle) remplace l'ancienne
    r.row.remove();
    return;
  }
  r.row.classList.remove('is-regenerating');
  r.row.removeAttribute('aria-busy');
  if(r.oldAssistant)history.push(r.oldAssistant);
}

function finishChat(data,ctx){
  _clearPendingJob();
  rmTyping();
  setNetworkBanner('');
  // Demande de régénération refusée par le serveur (action qui ne doit pas être rejouée)
  if(data.regenerate_refused){
    discardLiveMessage();
    _restoreRegen(false);
    showToast(data.reply,{duration:6000});
    _afterChat('idle');
    return;
  }
  // Échec signalé par le serveur : expliqué avec « Réessayer », jamais affiché comme une réponse normale
  if(data.status==='error'||data.model==='error'){
    const partial=liveStream.row?liveStream.target:'';
    if(liveStream.row){partial?finalizeLiveMessage(partial,null):discardLiveMessage();}
    _restoreRegen(false);
    if(ctx.opts.userPushed&&history.length&&history[history.length-1].role==='user')history.pop();
    showChatError({kind:'server',message:data.reply,interrupted:!!data.interrupted},ctx);
    _afterChat('error');
    return;
  }
  _restoreRegen(true);
  chatFlow.lastRegenPayload=data.regenerable?ctx.payload:null;
  handleChatResult(data,ctx.payload.msg);
  _afterChat('completed');
}

function failChat(e,ctx){
  _clearPendingJob();
  rmTyping();
  setNetworkBanner('');
  // Texte déjà reçu : conservé plutôt que jeté
  if(liveStream.row){const t=liveStream.target;t?finalizeLiveMessage(t,null):discardLiveMessage();}
  _restoreRegen(false);
  // Le message de l'utilisateur reste AFFICHÉ ; on le retire seulement de l'historique
  // envoyé au modèle, pour que « Réessayer » ne le duplique pas.
  if(ctx.opts.userPushed&&history.length&&history[history.length-1].role==='user')history.pop();
  if(e.kind==='auth'){
    const inp=document.getElementById('cinp');
    if(inp&&!inp.value)inp.value=ctx.payload.msg; // le message n'est jamais perdu
  }
  showChatError(e,ctx);
  _afterChat('error');
}

// ═══ Erreurs expliquées ═══════════════════════════════════════════════════
const ERROR_COPY={
  offline:['Pas de connexion','Tu sembles hors ligne. Ton message est conservé : réessaie dès que la connexion est revenue.'],
  network:['Sutur est injoignable','Impossible de contacter le serveur. Vérifie ta connexion — ton message est conservé.'],
  timeout:['Réponse trop longue','Sutur met plus de temps que prévu à répondre. Ton message est conservé : tu peux réessayer.'],
  auth:['Session expirée','Ta session n\'est plus valide. Reconnecte-toi, puis renvoie ton message (il a été remis dans la zone de saisie).'],
  ratelimit:['Doucement !',''],
  server:['Problème côté serveur','Sutur n\'a pas pu traiter ton message. Ton message est conservé : réessaie dans un instant.'],
  unknown:['Message non envoyé','Une erreur est survenue. Ton message est conservé : tu peux réessayer.'],
};

function showChatError(e,ctx){
  const cb=document.getElementById('chatbox');
  const kind=ERROR_COPY[e.kind]?e.kind:'unknown';
  let [title,text]=ERROR_COPY[kind];
  if(kind==='ratelimit')text=(e.message?e.message+' ':'')+'Ton message est conservé : réessaie dans un instant.';
  if(e.interrupted){title='Traitement interrompu';text=e.message||text;}
  const row=document.createElement('div');
  row.className='msg-row msg-error-row';
  row.dataset.role='error';
  const bubble=document.createElement('div');
  bubble.className='msg-bubble msg-error';
  bubble.setAttribute('role','alert');
  const t=document.createElement('div');t.className='msg-error-title';t.textContent=title;
  const p=document.createElement('div');p.className='msg-error-text';p.textContent=text;
  const actions=document.createElement('div');actions.className='msg-error-actions';
  const b=document.createElement('button');
  b.type='button';b.className='btn-retry';
  if(kind==='auth'){b.dataset.act='relogin';b.textContent='Se reconnecter';}
  else{b.dataset.act='retry';b.textContent='Réessayer';}
  actions.appendChild(b);
  bubble.append(t,p,actions);
  row.appendChild(bubble);
  row._retry=()=>retryAfterError(row,ctx);
  cb.appendChild(row);
  scrollChatToBottom(true);
  announce(title+'. '+text);
}

function retryAfterError(errorRow,ctx){
  if(busy)return;
  errorRow.remove();
  if(ctx.opts.regenerate){regenerateLast();return;}
  busy=true;gActive=true;
  if(ctx.opts.userPushed)history.push({role:'user',content:ctx.payload.msg});
  submitChat(ctx.payload,{...ctx.opts});
}

// ═══ Annulation ═══════════════════════════════════════════════════════════
function cancelGeneration(){
  const ctx=chatFlow.ctx;
  if(!ctx||chatFlow.state!=='streaming')return;
  ctx.stopped=true;
  if(ctx.jobId)apiCall('/chat/cancel/'+ctx.jobId,'POST',null,{timeout:8000}).catch(()=>{});
  _clearPendingJob();
  rmTyping();
  const partial=liveStream.row?liveStream.target:'';
  if(partial){
    finalizeLiveMessage(partial,null);
    history.push({role:'assistant',content:partial});
    _restoreRegen(true);
  }else{
    discardLiveMessage();
    _restoreRegen(false);
  }
  showToast('Génération arrêtée.',{duration:1800});
  _afterChat('idle');
}

// ═══ Régénérer / Modifier / Copier ════════════════════════════════════════
function _findLastRow(role){
  const cb=document.getElementById('chatbox');
  for(let el=cb.lastElementChild;el;el=el.previousElementSibling){
    if(el.dataset&&el.dataset.role===role&&!el.classList.contains('is-live'))return el;
  }
  return null;
}

function regenerateLast(){
  if(busy)return;
  const row=_findLastRow('ai');
  const p=chatFlow.lastRegenPayload;
  if(!row||row.dataset.regenerable!=='1'||!p)return;
  busy=true;gActive=true;
  row.classList.add('is-regenerating');
  row.setAttribute('aria-busy','true');
  const last=history.length&&history[history.length-1].role==='assistant'?history.pop():null;
  chatFlow.regen={row,oldAssistant:last};
  submitChat({...p},{regenerate:true,userPushed:false});
}

function editLastUserMessage(row){
  const inp=document.getElementById('cinp');
  if(!inp||!row)return;
  inp.value=row._src||'';
  autoResizeChatInput(inp);
  syncSendButton();
  inp.focus();
  inp.setSelectionRange(inp.value.length,inp.value.length);
}

async function copyText(text){
  try{
    if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return true;}
  }catch(_){/* repli ci-dessous */}
  try{
    const ta=document.createElement('textarea');
    ta.value=text;ta.setAttribute('readonly','');
    ta.style.cssText='position:fixed;opacity:0;left:-9999px';
    document.body.appendChild(ta);ta.select();
    const ok=document.execCommand('copy');
    ta.remove();
    return ok;
  }catch(_){return false;}
}

function _flashDone(btn,ok){
  btn.classList.toggle('is-done',ok);
  btn.classList.toggle('is-failed',!ok);
  setTimeout(()=>{btn.classList.remove('is-done','is-failed');},1400);
  announce(ok?'Copié dans le presse-papiers.':'Copie impossible.');
}

function onChatboxClick(e){
  const codeBtn=e.target.closest('[data-md-copy]');
  if(codeBtn){
    const code=codeBtn.closest('.md-code').querySelector('code').textContent;
    copyText(code).then(ok=>_flashDone(codeBtn,ok));
    return;
  }
  const act=e.target.closest('[data-act]');
  if(!act)return;
  const row=act.closest('[data-role]');
  switch(act.dataset.act){
    case 'copy':  copyText(row._src||row.querySelector('.mt').innerText).then(ok=>_flashDone(act,ok));break;
    case 'speak': speakText(row._src||row.querySelector('.mt').innerText);break;
    case 'regen': regenerateLast();break;
    case 'edit':  editLastUserMessage(row);break;
    case 'retry': {const er=act.closest('.msg-error-row');if(er&&er._retry)er._retry();break;}
    case 'relogin': logout();break;
  }
}

// Seul le DERNIER message utilisateur est modifiable ; seule la DERNIÈRE réponse
// (sans effet de bord) est régénérable. Pas de bouton pendant un envoi.
function refreshMessageActions(){
  const cb=document.getElementById('chatbox');
  if(!cb)return;
  let lastUser=null,lastAi=null;
  for(let el=cb.lastElementChild;el&&(!lastUser||!lastAi);el=el.previousElementSibling){
    const r=el.dataset&&el.dataset.role;
    if(!lastUser&&r==='user')lastUser=el;
    if(!lastAi&&r==='ai'&&!el.classList.contains('is-live'))lastAi=el;
  }
  if(chatFlow.editBtn&&(!lastUser||chatFlow.editBtn.parentNode!==lastUser||busy)){
    chatFlow.editBtn.remove();chatFlow.editBtn=null;
  }
  if(lastUser&&!busy&&lastUser.dataset.editable!=='0'&&!chatFlow.editBtn&&lastUser._src){
    const b=document.createElement('button');
    b.type='button';b.className='msg-edit';b.dataset.act='edit';
    b.setAttribute('aria-label','Modifier ce message');b.title='Modifier';
    b.innerHTML=ICONS.edit;
    lastUser.appendChild(b);
    chatFlow.editBtn=b;
  }
  if(chatFlow.regenRow&&chatFlow.regenRow!==lastAi){
    const old=chatFlow.regenRow.querySelector('[data-act="regen"]');
    if(old)old.hidden=true;
  }
  if(lastAi){
    const b=lastAi.querySelector('[data-act="regen"]');
    if(b)b.hidden=!(lastAi.dataset.regenerable==='1'&&!busy&&chatFlow.lastRegenPayload);
    chatFlow.regenRow=lastAi;
  }
}

// ═══ Reprise après rechargement de la page ═══════════════════════════════
// Si l'onglet a été entièrement déchargé pendant qu'une tâche tournait (mise en
// veille prolongée sur mobile), le suivi reprend au lieu de perdre la réponse.
let _resumeTries=0;
function resumePendingChatJobIfAny(){
  let parsed;
  try{
    const saved=localStorage.getItem('sutur_pending_job');
    if(!saved)return;
    parsed=JSON.parse(saved);
    if(!parsed.job_id){_clearPendingJob();return;}
  }catch(e){_clearPendingJob();return;}
  if(!TOKEN){ // pas encore connecté : on réessaie un peu plus tard (au plus ~60 s)
    if(++_resumeTries<40)setTimeout(resumePendingChatJobIfAny,1500);
    return;
  }
  if(busy)return;
  if(parsed.thread_id)currentThreadId=parsed.thread_id;
  busy=true;
  const ctx={jobId:parsed.job_id,startedAt:Date.now(),stopped:false,payload:{msg:parsed.original_msg||''},opts:{}};
  chatFlow.ctx=ctx;
  pendingChatJobId=parsed.job_id;
  setSendState('streaming');
  setStatus('Traitement...','think');
  addTyping();
  waitForChatResult(ctx).then(data=>{
    if(data===null)return;
    finishChat(data,ctx);
  }).catch(e=>{
    if(e.kind==='notfound'){ // tâche disparue : on repart proprement, sans bruit
      _clearPendingJob();rmTyping();discardLiveMessage();_afterChat('idle');
    }else failChat(e,ctx);
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',resumePendingChatJobIfAny);
else resumePendingChatJobIfAny();

// ═══ Brouillon d'email ════════════════════════════════════════════════════
// Carte construite en DOM : l'objet, le destinataire et le corps (qui viennent de
// l'IA ou d'un tiers) ne sont JAMAIS interprétés comme du HTML.
function appendDraftEmailCard(d){
  const cb=document.getElementById('chatbox');
  const card=document.createElement('div');
  card.className='draft-card';
  card.dataset.role='draft';
  const mk=(cls,txt)=>{const e=document.createElement('div');e.className=cls;e.textContent=txt;return e;};
  card.appendChild(mk('draft-title','Brouillon d\'email'));
  card.appendChild(mk('draft-label','À'));
  card.appendChild(mk('draft-value',d.to||'(destinataire à préciser)'));
  card.appendChild(mk('draft-label','Objet'));
  card.appendChild(mk('draft-value',d.subject||''));
  card.appendChild(mk('draft-label','Message'));
  card.appendChild(mk('draft-value draft-body',d.body||''));
  const row=document.createElement('div');row.className='draft-actions';
  const send=document.createElement('button');
  send.type='button';send.className='btn-primary-sm';send.textContent='Envoyer';
  send.onclick=async()=>{
    send.disabled=true;send.textContent='Envoi…';
    try{await sendDraftEmail(d);}finally{card.remove();}
  };
  const cancel=document.createElement('button');
  cancel.type='button';cancel.className='btn-ghost-sm';cancel.textContent='Annuler';
  cancel.onclick=()=>card.remove();
  row.append(send,cancel);
  card.appendChild(row);
  cb.appendChild(card);
  scrollChatToBottom(true);
}
