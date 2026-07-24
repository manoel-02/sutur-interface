// ── REMOTE DESKTOP ──────────────────────────────────────────────────────
// Contrôle du PC à distance : stream écran, clics clavier/souris, terminal,
// gestion de fichiers, Computer Use.

function rdTab(name){
  ['terminal','ai','files'].forEach(t=>{
    const panel = document.getElementById('rdpanel-'+t);
    if(panel) panel.style.display = t===name ? 'flex' : 'none';
    const btn = document.getElementById('rdtab-'+t);
    if(btn) btn.className = 'rdtab' + (t===name ? ' rdtab-active' : '');
  });
  if(name==='files') rdRefreshFiles();
}

async function checkRemoteStatus(){
  if(!TOKEN||!API_URL) return;
  try{
    const data = await apiCall('/remote/status','GET');
    rdConnected = data.connected;
    const bar = document.getElementById('remote-status-bar');
    const dot = document.getElementById('rd-dot');
    const lbl = document.getElementById('rd-status-lbl');
    if(data.connected){
      if(bar) bar.innerHTML=`<span style="color:#4ade80">✅ PC connecté</span> <span style="color:var(--text-muted);font-size:10px">depuis ${new Date(data.connected_at).toLocaleTimeString('fr')}</span>`;
      if(dot){dot.style.background='#4ade80';dot.style.boxShadow='0 0 8px #4ade80';}
      if(lbl){lbl.textContent='CONNECTÉ';lbl.style.color='rgba(74,222,128,.7)';}
    }else{
      if(bar) bar.textContent="PC non connecté — lance l\'agent sur ton PC Linux";
      if(dot){dot.style.background='#f87171';dot.style.boxShadow='none';}
      if(lbl){lbl.textContent='DÉCONNECTÉ';lbl.style.color='rgba(248,113,113,.5)';}
    }
  }catch(e){}
}

function openRemoteDesktop(){
  const modal = document.getElementById('remote-modal');
  if(modal) modal.style.display='flex';
  checkRemoteStatus().then(()=>{ if(rdConnected) rdStartStream(); });
}

function closeRemoteDesktop(){
  const modal = document.getElementById('remote-modal');
  if(modal) modal.style.display='none';
  rdStopStream();
}

async function rdScreenshot(){
  if(!TOKEN||!API_URL) return;
  try{
    const data = await apiCall('/remote/screenshot','GET');
    if(data.screenshot){
      rdUpdateScreen(data.screenshot);
      rdConsecutiveFailures = 0;
      const noScreen = document.getElementById('rd-no-screen');
      if(noScreen) noScreen.style.display = 'none';
    }
  }catch(e){
    rdConsecutiveFailures++;
    if(rdConsecutiveFailures >= 3){
      // Après plusieurs échecs d'affilée, on arrête de tenter en silence et on le montre clairement
      rdStopStream();
      const noScreen = document.getElementById('rd-no-screen');
      const img = document.getElementById('rd-screen');
      if(img) img.style.display = 'none';
      if(noScreen){
        noScreen.style.display = 'block';
        noScreen.innerHTML = '<div style="font-size:48px;margin-bottom:16px">📡</div><div style="font-size:12px;letter-spacing:3px;color:rgba(248,113,113,.5)">CONNEXION PERDUE</div><div style="font-size:10px;margin-top:10px;color:rgba(160,151,196,.35);max-width:220px;line-height:1.6">Vérifie que l\'agent tourne toujours sur ton PC, puis relance le stream</div>';
      }
      checkRemoteStatus();
    }
  }
}

function rdUpdateScreen(b64){
  const img = document.getElementById('rd-screen');
  const noScreen = document.getElementById('rd-no-screen');
  if(!img) return;
  img.src = 'data:image/jpeg;base64,' + b64;
  img.style.display = 'block';
  if(noScreen) noScreen.style.display = 'none';
  rdFrameCount++;
  const now = Date.now();
  if(now - rdLastFrameTs > 1000){
    const fps = rdLastFrameTs ? Math.round(rdFrameCount * 1000 / (now - rdLastFrameTs)) : 0;
    const fpsEl = document.getElementById('rd-fps');
    if(fpsEl) fpsEl.textContent = fps + ' fps';
    rdFrameCount = 0; rdLastFrameTs = now;
  }
}

function rdStartStream(){
  rdStreaming = true;
  rdConsecutiveFailures = 0;
  const btn = document.getElementById('rd-stream-btn');
  if(btn) btn.textContent = '⏸ PAUSE';
  if(rdStreamInterval) clearInterval(rdStreamInterval);
  if(rdStatusInterval) clearInterval(rdStatusInterval);
  rdLastFrameTs = Date.now();
  rdStreamInterval = setInterval(rdScreenshot, 600);
  rdStatusInterval = setInterval(checkRemoteStatus, 5000); // détecte une déconnexion en direct
  apiCall('/remote/stream/start','POST').catch(()=>{});
}

function rdStopStream(){
  rdStreaming = false;
  if(rdStreamInterval){ clearInterval(rdStreamInterval); rdStreamInterval = null; }
  if(rdStatusInterval){ clearInterval(rdStatusInterval); rdStatusInterval = null; }
  apiCall('/remote/stream/stop','POST').catch(()=>{});
  const btn = document.getElementById('rd-stream-btn');
  if(btn) btn.textContent = '▶ STREAM';
}

function rdToggleStream(){
  if(rdStreaming) rdStopStream(); else rdStartStream();
}

function rdTogglePowerMenu(){
  const menu=document.getElementById('rd-power-menu');
  if(!menu)return;
  const willShow=menu.style.display!=='block';
  menu.style.display=willShow?'block':'none';
  if(willShow){
    setTimeout(()=>{
      const closeOnOutsideClick=(e)=>{
        if(!menu.contains(e.target)&&e.target.id!=='rd-power-btn'){
          menu.style.display='none';
          document.removeEventListener('click',closeOnOutsideClick);
        }
      };
      document.addEventListener('click',closeOnOutsideClick);
    },10);
  }
}

function rdShowUnlockPrompt(action){
  rdCurrentLockAction=action||'unlock';
  const cfg=RD_LOCK_ACTIONS[rdCurrentLockAction];
  const modal=document.getElementById('unlock-modal');
  const input=document.getElementById('unlock-pass-input');
  const status=document.getElementById('unlock-status');
  const iconEl=document.getElementById('unlock-modal-icon');
  const titleEl=document.getElementById('unlock-modal-title');
  if(iconEl)iconEl.textContent=cfg.icon;
  if(titleEl)titleEl.textContent=cfg.title;
  if(status){status.textContent='';status.style.color='';}
  if(input)input.value='';
  if(modal){modal.style.display='flex';setTimeout(()=>input&&input.focus(),100);}
}

function rdCloseUnlockPrompt(){
  const modal=document.getElementById('unlock-modal');
  const input=document.getElementById('unlock-pass-input');
  if(input)input.value=''; // efface immédiatement, ne reste pas en mémoire du champ
  if(modal)modal.style.display='none';
}

async function rdSubmitUnlock(){
  const cfg=RD_LOCK_ACTIONS[rdCurrentLockAction];
  const input=document.getElementById('unlock-pass-input');
  const status=document.getElementById('unlock-status');
  const password=input?input.value:'';
  if(!password){
    if(status){status.textContent='Entre un mot de passe.';status.style.color='#f87171';}
    return;
  }
  if(status){status.textContent=cfg.verb+' en cours...';status.style.color='rgba(224,208,255,.6)';}
  try{
    const data=await apiCall(cfg.endpoint,'POST',{password});
    if(input)input.value=''; // effacé immédiatement après envoi, succès ou non
    if(data.success){
      if(status){status.textContent='✅ '+cfg.doneMsg;status.style.color='#4ade80';}
      setTimeout(()=>rdCloseUnlockPrompt(),1200);
    }else{
      if(status){status.textContent='❌ Mot de passe incorrect ou PC injoignable';status.style.color='#f87171';}
    }
  }catch(e){
    if(input)input.value='';
    if(status){status.textContent='Erreur : '+e.message;status.style.color='#f87171';}
  }
}

function rdGetImgCoords(evt){
  const img = document.getElementById('rd-screen');
  if(!img) return {x:0,y:0};
  const rect = img.getBoundingClientRect();
  return {
    x: Math.round((evt.clientX - rect.left) * img.naturalWidth / rect.width),
    y: Math.round((evt.clientY - rect.top) * img.naturalHeight / rect.height)
  };
}

async function rdHandleClick(evt, button){
  const {x,y} = rdGetImgCoords(evt);
  try{
    await apiCall('/remote/click','POST',{x,y,button,double:false});
    rdOutLog('[click '+button+'] ('+x+','+y+')');
    setTimeout(rdScreenshot, 500);
  }catch(e){ rdOutLog('❌ '+( e.message||'PC non connecté')); }
}

async function rdHandleDoubleClick(evt){
  const {x,y} = rdGetImgCoords(evt);
  try{
    await apiCall('/remote/click','POST',{x,y,button:'left',double:true});
    rdOutLog('[dbl-click] ('+x+','+y+')');
    setTimeout(rdScreenshot, 600);
  }catch(e){}
}

async function rdKey(key){
  try{
    await apiCall('/remote/key','POST',{key});
    rdOutLog('[key] '+key);
    setTimeout(rdScreenshot, 400);
  }catch(e){ rdOutLog('❌ '+e.message); }
}

async function rdScroll(direction){
  try{
    await apiCall('/remote/scroll','POST',{x:640,y:400,direction,amount:3});
    rdOutLog('[scroll '+direction+']');
    setTimeout(rdScreenshot, 400);
  }catch(e){}
}

async function rdExec(){
  const inp = document.getElementById('rd-cmd');
  if(!inp||!inp.value.trim()) return;
  const cmd = inp.value.trim(); inp.value='';
  rdOutLog('$ '+cmd);
  try{
    const data = await apiCall('/remote/exec','POST',{command:cmd,timeout:30});
    rdOutLog(data.result||'(pas de sortie)');
    rdOutLog('[exit '+data.exit_code+']\n');
    setTimeout(rdScreenshot, 800);
  }catch(e){ rdOutLog('❌ '+(e.message||'PC non connecté')); }
}

async function rdType(){
  const inp = document.getElementById('rd-type');
  if(!inp||!inp.value) return;
  const text = inp.value; inp.value='';
  try{
    await apiCall('/remote/type','POST',{text});
    rdOutLog('[type] "'+text.slice(0,30)+'"');
    setTimeout(rdScreenshot, 500);
  }catch(e){ rdOutLog('❌ '+e.message); }
}

function rdOutLog(text){
  const out = document.getElementById('rd-output');
  if(!out) return;
  const ts = new Date().toLocaleTimeString('fr');
  out.textContent += '['+ts+'] '+text+'\n';
  out.scrollTop = out.scrollHeight;
}

async function rdStartComputerUse(){
  const inp = document.getElementById('rd-cu-instruction');
  const btn = document.getElementById('rd-cu-btn');
  const log = document.getElementById('rd-cu-log');
  if(!inp||!inp.value.trim()) return;
  const instruction = inp.value.trim();
  // Garantir que le stream tourne pendant l'exécution — sans ça, la vision "temps réel"
  // ne serait qu'une coïncidence si le stream était déjà actif par ailleurs.
  if(!rdStreaming) rdStartStream();
  if(btn){ btn.disabled=true; btn.textContent='🔄 EN COURS...'; }
  if(log) log.innerHTML = '<div style="color:rgba(201,162,39,.7);margin-bottom:8px">🤖 Instruction: "'+instruction+'"</div>';
  try{
    const data = await apiCall('/remote/computer_use','POST',{instruction,max_steps:15});
    if(log){
      const sc = data.status==='done'?'#4ade80':data.status==='failed'?'#f87171':'#fbbf24';
      log.innerHTML += '<div style="color:'+sc+';font-weight:600;margin-bottom:8px">'+(data.status==='done'?'✅':'❌')+' '+(data.message||data.status)+' ('+data.steps+' étapes)</div>';
      (data.actions||[]).forEach((a,i)=>{
        log.innerHTML += '<div style="margin-bottom:6px;padding:5px 8px;background:rgba(255,255,255,.02);border-radius:6px;border-left:2px solid rgba(139,92,246,.3)"><div style="font-size:9px;color:rgba(139,92,246,.5);margin-bottom:2px">ÉTAPE '+(i+1)+' · '+a.action+'</div><div style="font-size:10px;color:rgba(200,190,230,.6)">'+(a.thinking||'').slice(0,100)+'</div></div>';
        log.scrollTop=log.scrollHeight;
      });
    }
    rdScreenshot();
    if(data.message) speakText(data.message);
  }catch(e){
    if(log) log.innerHTML+='<div style="color:#f87171">❌ '+(e.message||'Erreur')+'</div>';
    speakText('Une erreur est survenue : '+(e.message||'erreur inconnue'));
  }finally{
    if(btn){ btn.disabled=false; btn.textContent='🤖 LANCER COMPUTER USE'; }
    inp.value='';
  }
}

function rdStartVoiceInput(){
  if(!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)){
    const log = document.getElementById('rd-cu-log');
    if(log) log.innerHTML += '<div style="color:#f87171">Micro non supporté sur ce navigateur.</div>';
    return;
  }
  const btn = document.getElementById('rd-voice-btn');
  const inp = document.getElementById('rd-cu-instruction');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();
  rec.lang = 'fr-FR';
  rec.continuous = false;
  rec.interimResults = false;
  if(btn){ btn.classList.add('active'); btn.textContent='🎙️ Écoute...'; }
  rec.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    if(inp) inp.value = transcript;
    rdStartComputerUse(); // scope strictement PC — ne passe jamais par le chat général
  };
  rec.onerror = () => {
    if(btn){ btn.classList.remove('active'); btn.textContent='🎙️ PARLER'; }
  };
  rec.onend = () => {
    if(btn){ btn.classList.remove('active'); btn.textContent='🎙️ PARLER'; }
  };
  rec.start();
}

function showAgentInstructions(){
  const runCmd = document.getElementById('agent-run-cmd');
  if(runCmd&&TOKEN) runCmd.innerHTML='python3 sutur_agent.py --token <span style="color:var(--gold)">'+TOKEN+'</span>';
  const modal = document.getElementById('agent-modal');
  if(modal) modal.style.display='flex';
}

async function rdBrowse(){
  const inp = document.getElementById('rd-url-inp');
  if(!inp||!inp.value.trim()) return;
  const val = inp.value.trim();
  const isUrl = val.startsWith('http')||val.startsWith('www.');
  try{
    const data = await apiCall('/remote/browse','POST',{
      url: isUrl ? val : '',
      query: isUrl ? '' : val,
      action: isUrl ? 'open' : 'search'
    });
    rdOutLog('🌐 Navigation → '+(data.url||val));
    if(data.screenshot) rdUpdateScreen(data.screenshot);
    inp.value='';
  }catch(e){ rdOutLog('❌ '+( e.message||'PC non connecté')); }
}

async function rdBrowseQuick(url){
  try{
    const data = await apiCall('/remote/browse','POST',{url,action:'open'});
    rdOutLog('🌐 → '+url);
    if(data.screenshot) rdUpdateScreen(data.screenshot);
  }catch(e){ rdOutLog('❌ '+e.message); }
}

async function rdBrowseFiles(){
  const pathInp = document.getElementById('rd-browse-path');
  const listing = document.getElementById('rd-file-listing');
  const path = pathInp ? pathInp.value.trim()||'~' : '~';
  try{
    const data = await apiCall('/files/pc_browse?path='+encodeURIComponent(path),'GET');
    if(listing) listing.textContent = data.listing||'(vide)';
  }catch(e){ if(listing) listing.textContent='❌ '+(e.message||'PC non connecté'); }
}

async function rdFetchFile(){
  const pathInp = document.getElementById('rd-pc-path');
  if(!pathInp||!pathInp.value.trim()) return;
  const path = pathInp.value.trim();
  pathInp.value='';
  rdOutLog('📥 Récupération: '+path);
  try{
    const data = await apiCall('/files/from_pc','POST',{path});
    rdOutLog('✅ '+data.name+' ('+Math.round(data.size/1024)+'KB) prêt');
    rdRefreshFiles();
  }catch(e){ rdOutLog('❌ '+(e.message||'Erreur')); }
}

async function rdRefreshFiles(){
  const list = document.getElementById('rd-files-list');
  if(!list) return;
  try{
    const data = await apiCall('/files/list','GET');
    const files = data.files||[];
    if(files.length===0){
      list.innerHTML='<div style="font-size:10px;color:rgba(160,151,196,.3)">Aucun fichier disponible</div>';
      return;
    }
    list.innerHTML = files.map(f=>`
      <div style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:7px">
        <span style="font-size:14px">${getFileIcon(f.name)}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;color:rgba(200,190,230,.8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</div>
          <div style="font-size:9px;color:rgba(160,151,196,.4)">${Math.round(f.size/1024)}KB · ${f.source==='pc'?'📺 PC':'📱 Tél'}</div>
        </div>
        <button onclick="rdDownloadFile('${f.id}','${f.name}')" style="background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);border-radius:5px;color:#4ade80;cursor:pointer;font-size:10px;padding:3px 7px;flex-shrink:0">↓</button>
        <button onclick="rdSendFileToPc('${f.id}')" style="background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.2);border-radius:5px;color:#c8aaff;cursor:pointer;font-size:10px;padding:3px 7px;flex-shrink:0" title="Envoyer vers PC">→🖥</button>
      </div>`).join('');
  }catch(e){}
}

function getFileIcon(name){
  const ext=(name.split('.').pop()||'').toLowerCase();
  const icons={pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',ppt:'📑',pptx:'📑',
    png:'🖼',jpg:'🖼',jpeg:'🖼',gif:'🖼',mp4:'🎬',mp3:'🎵',zip:'📦',tar:'📦',
    py:'🐍',js:'📜',html:'🌐',css:'🎨',txt:'📃',json:'⚙️'};
  return icons[ext]||'📁';
}

function rdDownloadFile(fileId, name){
  if(!TOKEN||!API_URL) return;
  const a = document.createElement('a');
  a.href = API_URL+'/files/download/'+fileId;
  a.download = name;
  a.setAttribute('data-token', TOKEN);
  // Téléchargement avec auth
  fetch(API_URL+'/files/download/'+fileId, {
    headers:{'Authorization':'Bearer '+TOKEN}
  }).then(r=>r.blob()).then(blob=>{
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=name;a.click();
    URL.revokeObjectURL(url);
  }).catch(e=>rdOutLog('❌ Téléchargement échoué'));
}

async function rdSendFileToPc(fileId){
  try{
    const data = await apiCall('/files/to_pc','POST',{file_id:fileId});
    rdOutLog('✅ Envoyé vers PC: '+data.dest);
  }catch(e){ rdOutLog('❌ '+(e.message||'PC non connecté')); }
}

async function phoneUploadFile(file){
  const reader=new FileReader();
  reader.onload=async e=>{
    const b64=e.target.result.split(',')[1];
    try{
      const data=await apiCall('/files/upload','POST',{name:file.name,data:b64});
      addMsg('ai','✅ Fichier **'+file.name+'** reçu ('+Math.round(data.size/1024)+'KB). Tu peux maintenant le transférer vers ton PC.',false);
    }catch(err){addMsg('ai','❌ Erreur upload: '+(err.message||''),false);}
  };
  reader.readAsDataURL(file);
}

async function silentRemoteCheck(){ await checkRemoteStatus(); }

async function runDiagnostic(){
  if(!TOKEN||!API_URL){
    document.getElementById('sys-overall').textContent='Configure ton accès dabord.';
    return;
  }
  const overall = document.getElementById('sys-overall');
  const statusDiv = document.getElementById('sys-status');
  overall.innerHTML = '<span style="color:var(--gold)">🔄 Diagnostic en cours...</span>';

  try{
    const data = await apiCall('/health/deep','GET');
    // Score global
    const statusColor = data.overall === 'healthy' ? '#4ade80' : data.overall === 'critical' ? '#f87171' : '#fbbf24';
    const statusEmoji = data.overall === 'healthy' ? '✅' : data.overall === 'critical' ? '🔴' : '⚠️';
    overall.innerHTML = `<span style="color:${statusColor};font-weight:600">${statusEmoji} ${data.overall.toUpperCase()}</span> <span style="color:var(--text-muted);font-size:10px">· ${data.total_ms}ms total</span>`;

    // Composants
    const comps = data.components || {};
    const compLabels = {
      supabase: '🗄️ Base de données',
      claude_api: '🤖 Claude IA',
      elevenlabs: '🎙️ Voix ElevenLabs',
      web_search: '🌐 Recherche web',
      google_oauth: '🔐 Google OAuth',
      google_user: '📧 Google (toi)'
    };

    let html = `<div style="display:flex;flex-direction:column;gap:5px;margin-top:8px">`;
    for(const [key, label] of Object.entries(compLabels)){
      const comp = comps[key] || {};
      const st = comp.status || 'unknown';
      const ico = SYS_ICONS[st] || '❓';
      const color = st === 'ok' || st === 'connected' || st === 'configured' ? '#4ade80' : st === 'error' || st === 'critical' ? '#f87171' : '#fbbf24';
      let extra = '';
      if(comp.latency_ms) extra += ` <span style="color:var(--text-muted);font-size:9px">${comp.latency_ms}ms</span>`;
      if(key === 'elevenlabs' && comp.chars_remaining != null){
        const pct = Math.round((comp.chars_remaining/comp.chars_limit)*100);
        extra += ` <span style="color:var(--text-muted);font-size:9px">${comp.chars_remaining.toLocaleString()} chars restants (${pct}%)</span>`;
      }
      if(comp.error) extra += ` <span style="color:#f87171;font-size:9px">${comp.error.slice(0,40)}</span>`;
      html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(255,255,255,.02);border-radius:8px;border:1px solid rgba(255,255,255,.05)">
        <span style="color:${color};flex-shrink:0">${ico}</span>
        <span style="font-size:11px;color:var(--text-secondary);flex:1">${label}</span>
        ${extra}
      </div>`;
    }
    html += '</div>';
    statusDiv.innerHTML = overall.outerHTML + html;

    // Bugs récents
    const bugs = data.components?.recent_bugs || [];
    const bugsDiv = document.getElementById('sys-bugs');
    const bugsList = document.getElementById('sys-bugs-list');
    if(bugs.length > 0){
      bugsDiv.style.display = 'block';
      bugsList.innerHTML = bugs.map(b=>`
        <div style="padding:5px 8px;background:rgba(248,113,113,.04);border-radius:6px;border:1px solid rgba(248,113,113,.1)">
          <span style="color:rgba(248,113,113,.7)">${b.path}</span>
          <span style="color:rgba(160,151,196,.4);font-size:10px;margin-left:4px">${new Date(b.timestamp).toLocaleTimeString('fr')}</span>
          <div style="color:rgba(248,113,113,.5);font-size:10px;margin-top:2px">${(b.error||'').slice(0,80)}</div>
        </div>`).join('');
    } else {
      bugsDiv.style.display = 'none';
    }

    // Notifier si critique
    if(data.overall === 'critical'){
      addMsg('ai', `⚠️ **Alerte système** — Des composants critiques sont en erreur : ${data.errors.join(', ')}. Vérifie les logs Railway.`, false);
    }
  }catch(e){
    overall.innerHTML = `<span style="color:#f87171">❌ Impossible de contacter le backend : ${e.message||'erreur réseau'}</span>`;
  }
}
