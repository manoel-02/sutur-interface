// ── CONVERSATIONS ─────────────────────────────────────────────────────────
// Tiroir latéral : liste (cache puis actualisation), recherche, regroupement par
// date, renommage en ligne, suppression annulable, changement de conversation
// instantané avec squelette de chargement, historiques longs découpés en blocs.
// Aucun alert()/confirm()/prompt() : tout est non bloquant.

const THREAD_CHUNK=80;           // messages rendus d'un coup à l'ouverture d'une longue conversation
const UNDO_DELAY_MS=6000;
let threadsCache=null;           // [{id,title,created_at,updated_at}] — null tant que jamais chargé
let threadsFilter='';
let threadsLoadError=false;
const threadMessagesCache={};    // id -> messages (ouverture instantanée au retour)
const pendingDeletes={};         // id -> {thread,wasActive,timer}
let _threadsOpener=null;
let _switchSeq=0;

const THREAD_ICONS={
  trash:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
};

// Les dates du serveur sans fuseau sont en UTC (heure du serveur).
function parseServerDate(s){
  if(!s)return new Date(0);
  const str=String(s);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(str)?str:str+'Z');
}

function threadGroupLabel(d){
  const now=new Date();
  const startOfDay=x=>new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime();
  const diffDays=Math.round((startOfDay(now)-startOfDay(d))/86400000);
  if(diffDays<=0)return 'Aujourd\'hui';
  if(diffDays===1)return 'Hier';
  if(diffDays<8)return '7 derniers jours';
  return 'Plus ancien';
}

function formatThreadDate(s){
  const d=parseServerDate(s);
  const diffDays=Math.round((new Date().setHours(0,0,0,0)-new Date(d).setHours(0,0,0,0))/86400000);
  if(diffDays<=0)return d.toLocaleTimeString('fr',{hour:'2-digit',minute:'2-digit'});
  return d.toLocaleDateString('fr',{day:'numeric',month:'short'});
}

const _norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

// ═══ Tiroir : ouverture / fermeture ═══════════════════════════════════════
function openThreadsPanel(){
  const m=document.getElementById('threads-modal');
  if(!m)return;
  _threadsOpener=document.activeElement;
  m.style.display='flex';
  document.body.classList.add('drawer-open');
  const search=document.getElementById('threads-search');
  if(search){search.value='';threadsFilter='';}
  if(threadsCache)renderThreadsList();   // affichage immédiat depuis le cache…
  else renderThreadsSkeleton();
  loadThreadsList({silent:!!threadsCache}); // …puis actualisation en arrière-plan
  const first=document.getElementById('threads-new-btn');
  if(first)first.focus();
}

function closeThreadsPanel(){
  const m=document.getElementById('threads-modal');
  if(!m||m.style.display==='none')return;
  m.style.display='none';
  document.body.classList.remove('drawer-open');
  if(_threadsOpener&&_threadsOpener.focus&&document.contains(_threadsOpener)){
    try{_threadsOpener.focus();}catch(_){}
  }
  _threadsOpener=null;
}

// Clavier : Échap ferme, Tab reste dans le tiroir, flèches parcourent la liste.
document.addEventListener('keydown',e=>{
  const m=document.getElementById('threads-modal');
  if(!m||m.style.display==='none')return;
  if(e.key==='Escape'){e.preventDefault();closeThreadsPanel();return;}
  if(e.key==='Tab'){
    const f=[...m.querySelectorAll('button:not([disabled]),input,[tabindex="0"]')].filter(x=>x.offsetParent!==null);
    if(!f.length)return;
    const first=f[0],last=f[f.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    return;
  }
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    const items=[...m.querySelectorAll('.thread-main')];
    if(!items.length)return;
    const i=items.indexOf(document.activeElement);
    if(i===-1&&document.activeElement.id!=='threads-search')return;
    e.preventDefault();
    const next=e.key==='ArrowDown'?items[Math.min(items.length-1,i+1)]:items[Math.max(0,i-1)];
    if(next)next.focus();
  }
});

// ═══ Liste ════════════════════════════════════════════════════════════════
function renderThreadsSkeleton(){
  const list=document.getElementById('threads-list');
  if(!list)return;
  list.setAttribute('aria-busy','true');
  list.replaceChildren(...Array.from({length:5},()=>{
    const d=document.createElement('div');d.className='skeleton skeleton-thread';return d;
  }));
}

async function loadThreadsList(opts={}){
  const list=document.getElementById('threads-list');
  try{
    const data=await apiCall('/threads','GET',null,{timeout:20000});
    // Les suppressions en attente d'annulation restent masquées
    threadsCache=(data.threads||[]).filter(t=>!pendingDeletes[t.id]);
    threadsLoadError=false;
    renderThreadsList();
  }catch(e){
    if(threadsCache){ // on garde l'affichage existant, simplement signalé
      if(!opts.silent)showToast('Liste non actualisée : '+describeApiError(e),{type:'error'});
      return;
    }
    threadsLoadError=true;
    if(list)renderThreadsList();
  }
}

function filterThreads(value){
  threadsFilter=value||'';
  renderThreadsList();
}

function renderThreadsList(){
  const list=document.getElementById('threads-list');
  if(!list)return;
  list.removeAttribute('aria-busy');
  if(threadsLoadError&&!threadsCache){
    const box=document.createElement('div');box.className='threads-empty';
    const p=document.createElement('p');p.textContent='Impossible de charger tes conversations.';
    const b=document.createElement('button');b.type='button';b.className='btn-primary-sm';b.textContent='Réessayer';
    b.onclick=()=>{renderThreadsSkeleton();loadThreadsList();};
    box.append(p,b);list.replaceChildren(box);
    return;
  }
  const q=_norm(threadsFilter.trim());
  const items=(threadsCache||[]).filter(t=>!q||_norm(t.title||'Nouvelle conversation').includes(q));
  if(!items.length){
    const box=document.createElement('div');box.className='threads-empty';
    const p=document.createElement('p');
    p.textContent=q?'Aucune conversation ne correspond.':'Aucune conversation pour l\'instant — écris à Sutur pour commencer.';
    box.appendChild(p);list.replaceChildren(box);
    return;
  }
  const frag=document.createDocumentFragment();
  let lastGroup='';
  items.forEach(t=>{
    const g=threadGroupLabel(parseServerDate(t.updated_at));
    if(g!==lastGroup){
      const h=document.createElement('div');h.className='thread-group';h.textContent=g;h.setAttribute('role','presentation');
      frag.appendChild(h);lastGroup=g;
    }
    frag.appendChild(buildThreadItem(t));
  });
  list.replaceChildren(frag);
}

function _iconBtn(cls,label,html,onClick){
  const b=document.createElement('button');
  b.type='button';b.className='thread-act '+cls;
  b.setAttribute('aria-label',label);b.title=label;
  b.innerHTML=html;
  b.onclick=e=>{e.stopPropagation();onClick();};
  return b;
}

function buildThreadItem(t){
  const row=document.createElement('div');
  row.className='thread-item'+(t.id===currentThreadId?' active':'');
  row.setAttribute('role','listitem');
  row.dataset.id=t.id;
  const main=document.createElement('button');
  main.type='button';main.className='thread-main';
  if(t.id===currentThreadId)main.setAttribute('aria-current','true');
  const title=document.createElement('span');title.className='thread-title';title.textContent=t.title||'Nouvelle conversation';
  const meta=document.createElement('span');meta.className='thread-meta';meta.textContent=formatThreadDate(t.updated_at);
  main.append(title,meta);
  main.onclick=()=>switchThread(t.id);
  const acts=document.createElement('div');acts.className='thread-acts';
  acts.append(
    _iconBtn('thread-rename','Renommer la conversation',ICONS.edit,()=>renameThread(t.id)),
    _iconBtn('thread-delete','Supprimer la conversation',THREAD_ICONS.trash,()=>deleteThread(t.id)),
  );
  row.append(main,acts);
  return row;
}

// ═══ Nouvelle conversation : instantanée ══════════════════════════════════
// Aucune attente réseau : l'interface passe tout de suite à une conversation vide.
// Le fil est créé côté serveur au premier message (avec un titre généré ensuite).
function _blockedWhileBusy(){
  if(!busy)return false;
  showToast('Sutur est en train de répondre — attends la fin (ou arrête la réponse) avant de changer de conversation.',{duration:3500});
  return true;
}

function createNewThread(){
  if(_blockedWhileBusy())return;
  _switchSeq++; // annule tout chargement de conversation encore en cours
  currentThreadId=null;
  history=[];
  document.getElementById('chatbox').innerHTML='';
  chatFlow.lastRegenPayload=null;
  closeThreadsPanel();
  addMsg('ai','Nouvelle conversation — je t\'écoute.',false);
  const inp=document.getElementById('cinp');
  if(inp)inp.focus();
}

// ═══ Changer de conversation ══════════════════════════════════════════════
function showChatSkeleton(){
  const cb=document.getElementById('chatbox');
  cb.setAttribute('aria-busy','true');
  const mk=(cls,w)=>{const d=document.createElement('div');d.className='skeleton '+cls;d.style.width=w;return d;};
  cb.replaceChildren(mk('skeleton-msg skeleton-user','55%'),mk('skeleton-msg skeleton-ai','80%'),mk('skeleton-msg skeleton-user','40%'),mk('skeleton-msg skeleton-ai','70%'));
}

function applyThread(id,msgs){
  currentThreadId=id;
  history=msgs.map(m=>({role:m.role==='assistant'?'assistant':'user',content:m.content}));
  chatFlow.lastRegenPayload=null; // pas de régénération sur une conversation rechargée
  const cb=document.getElementById('chatbox');
  cb.removeAttribute('aria-busy');
  renderThreadMessages(msgs);
  chatPinned=true;
  scrollChatToBottom(true);
}

async function switchThread(id){
  if(id===currentThreadId){closeThreadsPanel();return;}
  if(_blockedWhileBusy())return;
  const seq=++_switchSeq;
  const cb=document.getElementById('chatbox');
  const snapshot=[...cb.childNodes]; // pour tout restaurer si le chargement échoue
  const cached=threadMessagesCache[id];
  closeThreadsPanel();
  if(cached)applyThread(id,cached);   // ouverture instantanée…
  else showChatSkeleton();            // …ou état de chargement élégant
  try{
    const data=await apiCall('/threads/'+id+'/messages','GET',null,{timeout:30000});
    if(seq!==_switchSeq)return;       // un autre changement a eu lieu entre-temps
    const msgs=data.messages||[];
    const changed=!cached||cached.length!==msgs.length||(msgs.length&&cached[cached.length-1].content!==msgs[msgs.length-1].content);
    threadMessagesCache[id]=msgs;
    if(changed)applyThread(id,msgs);  // …puis mise à jour seulement si quelque chose a changé (pas de flash)
  }catch(e){
    if(seq!==_switchSeq)return;
    if(!cached){
      cb.removeAttribute('aria-busy');
      cb.replaceChildren(...snapshot);
      scrollChatToBottom(true);
    }
    showToast('Impossible de charger cette conversation : '+describeApiError(e),{type:'error',duration:6000,action:{label:'Réessayer',onClick:()=>switchThread(id)}});
  }
}

// Longues conversations : on ne rend que les derniers messages, le reste est
// chargé à la demande — l'ouverture reste instantanée même avec des centaines de messages.
function renderThreadMessages(messages){
  const cb=document.getElementById('chatbox');
  const total=messages.length;
  const frag=document.createDocumentFragment();
  let start=Math.max(0,total-THREAD_CHUNK);
  const mkMsg=m=>buildMsgElement(m.role==='user'?'user':'ai',m.content);
  if(start>0){
    const btn=document.createElement('button');
    btn.type='button';btn.className='load-earlier';
    const label=()=>'Afficher les '+Math.min(THREAD_CHUNK,start)+' messages précédents ('+start+' non affichés)';
    btn.textContent=label();
    btn.onclick=()=>{
      const sc=_chatScroller();
      // Ancre : le premier message déjà affiché. On mesure sa position AVANT/APRÈS l'insertion
      // (plus fiable que la différence de scrollHeight, faussée par les hauteurs estimées de
      // content-visibility), et on rend les nouveaux messages avec leur vraie hauteur.
      const anchor=btn.nextElementSibling;
      const topBefore=anchor?anchor.getBoundingClientRect().top:0;
      const from=Math.max(0,start-THREAD_CHUNK);
      const chunk=document.createDocumentFragment();
      for(let i=from;i<start;i++){const el=mkMsg(messages[i]);if(el&&el.classList)el.classList.add('cv-visible');chunk.appendChild(el);}
      btn.after(chunk);
      start=from;
      if(start>0)btn.textContent=label();else btn.remove();
      if(anchor)sc.scrollTop+=anchor.getBoundingClientRect().top-topBefore; // la position de lecture ne bouge pas
    };
    frag.appendChild(btn);
  }
  for(let i=start;i<total;i++)frag.appendChild(mkMsg(messages[i]));
  cb.replaceChildren(frag);
  refreshMessageActions();
}

// ═══ Renommer : en ligne, optimiste ═══════════════════════════════════════
function renameThread(id){
  const t=(threadsCache||[]).find(x=>x.id===id);
  const row=document.querySelector('#threads-list .thread-item[data-id="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]');
  if(!t||!row)return;
  const titleEl=row.querySelector('.thread-title');
  if(!titleEl)return;
  const old=t.title||'Nouvelle conversation';
  const input=document.createElement('input');
  input.type='text';input.className='thread-rename-input';input.value=old;input.maxLength=80;
  input.setAttribute('aria-label','Nouveau nom de la conversation');
  titleEl.replaceWith(input);
  input.focus();input.select();
  let done=false;
  const commit=async save=>{
    if(done)return;done=true;
    const v=input.value.trim();
    input.replaceWith(titleEl);
    if(!save||!v||v===old)return;
    t.title=v;titleEl.textContent=v;          // feedback immédiat…
    try{await apiCall('/threads/'+id,'PATCH',{title:v});}
    catch(e){                                  // …annulé proprement si le serveur refuse
      t.title=old;titleEl.textContent=old;
      showToast('Renommage impossible : '+describeApiError(e),{type:'error'});
    }
  };
  input.onkeydown=e=>{
    if(e.key==='Enter'){e.preventDefault();commit(true);}
    else if(e.key==='Escape'){e.stopPropagation();e.preventDefault();commit(false);}
  };
  input.onblur=()=>commit(true);
}

// ═══ Supprimer : immédiat à l'écran, annulable ════════════════════════════
function deleteThread(id){
  if(pendingDeletes[id]||!threadsCache)return;
  const t=threadsCache.find(x=>x.id===id);
  if(!t)return;
  const wasActive=id===currentThreadId;
  if(wasActive&&_blockedWhileBusy())return;
  threadsCache=threadsCache.filter(x=>x.id!==id);
  renderThreadsList();
  if(wasActive){
    _switchSeq++;
    currentThreadId=null;history=[];
    document.getElementById('chatbox').innerHTML='';
  }
  pendingDeletes[id]={thread:t,wasActive,timer:setTimeout(()=>commitDelete(id),UNDO_DELAY_MS)};
  showToast('Conversation supprimée.',{duration:UNDO_DELAY_MS,action:{label:'Annuler',onClick:()=>undoDelete(id)}});
}

function _sortThreads(){
  threadsCache.sort((a,b)=>parseServerDate(b.updated_at)-parseServerDate(a.updated_at));
}

function undoDelete(id){
  const e=pendingDeletes[id];
  if(!e)return;
  clearTimeout(e.timer);
  delete pendingDeletes[id];
  threadsCache=threadsCache||[];
  threadsCache.push(e.thread);
  _sortThreads();
  renderThreadsList();
  if(e.wasActive)switchThread(id);
}

async function commitDelete(id){
  const e=pendingDeletes[id];
  if(!e)return;
  delete pendingDeletes[id];
  try{
    await apiCall('/threads/'+id,'DELETE');
    delete threadMessagesCache[id];
  }catch(err){
    threadsCache=threadsCache||[];
    threadsCache.push(e.thread);_sortThreads();renderThreadsList();
    showToast('Suppression impossible — la conversation a été restaurée.',{type:'error'});
  }
}

// Fermeture de l'onglet pendant le délai d'annulation : la suppression demandée
// est tout de même envoyée (keepalive survit au déchargement de la page).
window.addEventListener('pagehide',()=>{
  Object.keys(pendingDeletes).forEach(id=>{
    clearTimeout(pendingDeletes[id].timer);
    try{fetch(API_URL+'/threads/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+TOKEN},keepalive:true});}catch(_){}
    delete pendingDeletes[id];
  });
});

// Après la première réponse d'une nouvelle conversation, le titre intelligent est
// généré en arrière-plan : on actualise la liste deux fois, discrètement.
function refreshThreadsSoon(){
  setTimeout(()=>loadThreadsList({silent:true}),3500);
  setTimeout(()=>loadThreadsList({silent:true}),9000);
}
