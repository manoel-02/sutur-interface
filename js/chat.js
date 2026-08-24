// ── CHAT PRINCIPAL ──────────────────────────────────────────────────────
// Envoi/affichage des messages, rendu markdown, détection de commandes média.

function detectAvatarContext(msg){
  const m=msg.toLowerCase();
  for(const[ctx,data] of Object.entries(AVATAR_CONTEXTS)){
    if(ctx==='default')continue;
    if(data.keywords&&data.keywords.some(k=>m.includes(k)))return ctx;
  }
  return 'default';
}

function renderMarkdown(text){
  if(!text) return '';
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')  // échapper HTML
    .replace(/\*\*\*(.*?)\*\*\*/g,'<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,'<a href="$2" target="_blank">$1</a>')
    .replace(/^#{3}\s(.+)$/gm,'<strong style="font-size:13px;color:var(--gold)">$1</strong>')
    .replace(/^#{2}\s(.+)$/gm,'<strong style="font-size:14px;color:var(--gold)">$1</strong>')
    .replace(/^#{1}\s(.+)$/gm,'<strong style="font-size:15px;color:var(--gold)">$1</strong>')
    .replace(/^[-•]\s(.+)$/gm,'&nbsp;&nbsp;· $1')
    .replace(/\n/g,'<br>');
}

function cleanForSpeech(text){
  return text
    .replace(/\*\*?(.*?)\*\*?/g,'$1')
    .replace(/#{1,6}\s/g,'')
    .replace(/`[^`]+`/g,'')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g,'$1')
    .replace(/---+/g,'.')
    .replace(/[🎙📬🏎⚽📊💼🤖🏠👤📅✅❌🔴🟡🟢⚡🏆🔍📖•·]/g,'')
    .replace(/\n{2,}/g,'. ')
    .replace(/\n/g,', ')
    .replace(/\s{2,}/g,' ')
    .replace(/^[-•]\s/gm,'')
    .replace(/\*\*/g,'')
    .trim();
}

function isTerminal(){return document.body.classList.contains('theme-terminal');}

function addMsg(role,text,speak=false){
  const cb=document.getElementById('chatbox');
  const d=document.createElement('div');
  if(isTerminal()){
    // ── MODE TERMINAL : structure ligne de commande ──
    if(role==='ai'){
      currentAvatarCtx=detectAvatarContext(text);
      const ctxLabel=AVATAR_CONTEXTS[currentAvatarCtx]?.label||'ASSISTANT';
      d.style.cssText='display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;animation:fu .2s ease';
      d.innerHTML=`
        <span style="font-size:10px;color:rgba(0,200,255,.6);letter-spacing:1px;font-weight:600;white-space:nowrap;padding-top:2px;min-width:52px;font-family:'Courier New',monospace">SUTUR›</span>
        <div style="flex:1">
          <div style="font-size:9px;color:rgba(0,200,255,.35);letter-spacing:2px;margin-bottom:3px;font-family:'Courier New',monospace">MODE:${ctxLabel.toUpperCase().replace(/ /g,'_')}</div>
          <span class="mt" style="font-size:13px;color:rgba(180,240,255,.85);line-height:1.65;font-family:'Courier New',monospace;word-wrap:break-word;overflow-wrap:anywhere;white-space:pre-wrap">${renderMarkdown(text)}</span>
          <button class="speak-btn" style="margin-left:8px;background:none;border:none;cursor:pointer;font-size:12px;color:rgba(0,200,255,.4)" onclick="speakText(this.previousElementSibling.textContent)">▶</button>
        </div>`;
    }else{
      d.style.cssText='display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;animation:fu .2s ease';
      d.innerHTML=`
        <span style="font-size:10px;color:rgba(255,210,80,.5);letter-spacing:1px;font-weight:600;white-space:nowrap;padding-top:2px;min-width:52px;font-family:'Courier New',monospace">${currentUserName||'USER'}›</span>
        <span style="font-size:13px;color:rgba(255,230,150,.75);line-height:1.65;font-family:'Courier New',monospace">${text}</span>`;
    }
  }else{
    // ── MODE LIQUID GLASS : bulles en verre dépoli, sans image d'avatar ──
    if(role==='ai'){
      currentAvatarCtx=detectAvatarContext(text);
      const ctxLabel=AVATAR_CONTEXTS[currentAvatarCtx]?.label||'Assistant';
      d.className='msg-row';
      d.innerHTML=`<div class="msg-bubble"><div class="lbl">SUTUR <span style="color:var(--gold);font-size:9px;letter-spacing:1px">${ctxLabel}</span> <button class="speak-btn" onclick="speakText(this.closest('.msg-bubble').querySelector('.mt').innerText)">&#128266;</button></div><span class="mt">${renderMarkdown(text)}</span></div>`;
    }else{
      d.className='cmsg user';
      d.textContent=text;
    }
  }
  cb.appendChild(d);cb.scrollTop=cb.scrollHeight;
  if(voiceModeActive){
    const cap=document.getElementById('voice-caption');
    if(cap)cap.textContent=text.slice(0,240);
  }
  if(speak&&role==='ai'&&document.getElementById('t-autospeak').classList.contains('on'))setTimeout(()=>speakText(text),200);
}

function addTyping(){
  const cb=document.getElementById('chatbox');
  const d=document.createElement('div');
  d.id='tymsg';
  if(isTerminal()){
    d.style.cssText='display:flex;gap:10px;align-items:flex-start;margin-bottom:8px';
    d.innerHTML=`
      <span style="font-size:10px;color:rgba(0,200,255,.6);letter-spacing:1px;font-weight:600;white-space:nowrap;padding-top:2px;min-width:52px;font-family:'Courier New',monospace">SUTUR›</span>
      <span style="font-size:13px;color:rgba(0,200,255,.5);font-family:'Courier New',monospace">TRAITEMENT<span id="tcursor">_</span></span>`;
    // Curseur clignotant
    let c=0;const el=setInterval(()=>{const cu=d.querySelector('#tcursor');if(cu)cu.textContent=c++%2?'_':' ';else clearInterval(el)},500);
    d._interval=el;
  }else{
    d.className='msg-row';
    d.innerHTML=`<div class="msg-bubble"><div class="lbl">SUTUR</div><div class="typing"><span></span><span></span><span></span></div></div>`;
  }
  cb.appendChild(d);cb.scrollTop=cb.scrollHeight;
}

function rmTyping(){const t=document.getElementById('tymsg');if(t){if(t._interval)clearInterval(t._interval);t.remove();}}

function setStatus(s,state){document.getElementById('hst').textContent=s;document.getElementById('hdot').style.background=state==='think'?'#ffaa00':state==='talk'?'#00ff88':'#00d4ff';gThink=state==='think';if(!micActive&&!ttsPlaying)setGlobeMode(state==='think'?1:0)}

function detectMediaCmd(msg){
  const m=msg.toLowerCase();
  // Spotify et YouTube ne sont plus interceptés ici — ils passent par le vrai système
  // d'intentions du backend (recherche + lecture réelles), plus par ce raccourci qui se
  // contentait d'ouvrir une page de recherche sans jamais rien lancer.
  if(m.includes('instagram'))return'instagram';
  if(m.includes('tiktok'))return'tiktok';
  if(m.includes(' x ')||m.includes('twitter'))return'x';
  return null;
}

function checkSpecialActions(message, reply){
  const msg = message.toLowerCase();

  // WebTask
  const webtask_kw = ['crée-moi un compte','crée moi un compte','inscris-moi','va sur','ouvre le site',
    'comme si c','à ma place','combien d\'abonné','mes stats','crée-moi une image','crée moi un site'];
  if(webtask_kw.some(k=>msg.includes(k))){
    setTimeout(()=>{
      const cb=document.getElementById('chatbox');
      const d=document.createElement('div');
      d.style.cssText='display:flex;gap:8px;margin:4px 0 8px 44px';
      d.innerHTML=`<button onclick="launchWebTask(${JSON.stringify(message)})" style="padding:7px 14px;border-radius:8px;border:1px solid rgba(74,222,128,.35);background:rgba(74,222,128,.08);color:#4ade80;cursor:pointer;font-size:11px;font-family:var(--font-main)">🌐 Lancer WebTask automatiquement</button>`;
      cb.appendChild(d);cb.scrollTop=cb.scrollHeight;
    },500);
  }

  // OrbixTeam
  const team_kw = ['équipe','startup','business plan','lancer une entreprise','plusieurs agents','projet complet'];
  if(team_kw.some(k=>msg.includes(k))){
    setTimeout(()=>{
      const cb=document.getElementById('chatbox');
      const d=document.createElement('div');
      d.style.cssText='display:flex;gap:8px;margin:4px 0 8px 44px;flex-wrap:wrap';
      d.innerHTML=`
        <button onclick="launchTeamMission(${JSON.stringify(message)},4)" style="padding:7px 14px;border-radius:8px;border:1px solid rgba(139,92,246,.35);background:rgba(139,92,246,.08);color:#c8aaff;cursor:pointer;font-size:11px;font-family:var(--font-main)">🤖 OrbixTeam (4 agents)</button>
        <button onclick="launchTeamMission(${JSON.stringify(message)},6)" style="padding:7px 14px;border-radius:8px;border:1px solid rgba(201,162,39,.35);background:rgba(201,162,39,.06);color:rgba(201,162,39,.8);cursor:pointer;font-size:11px;font-family:var(--font-main)">⚡ OrbixTeam Complet (6 agents)</button>`;
      cb.appendChild(d);cb.scrollTop=cb.scrollHeight;
    },500);
  }

  // Code Generation
  const codeLangs = ['python','javascript','js','html','css','bash','react','flask','django','node'];
  const codeKw = ['code','programme','script','application','app','développe','crée un','fais-moi'];
  if(codeKw.some(k=>msg.includes(k)) && codeLangs.some(l=>msg.includes(l))){
    const lang = codeLangs.find(l=>msg.includes(l)) || 'python';
    setTimeout(()=>{
      const cb=document.getElementById('chatbox');
      const d=document.createElement('div');
      d.style.cssText='display:flex;gap:8px;margin:4px 0 8px 44px;flex-wrap:wrap';
      d.innerHTML=`<button onclick="generateCode(${JSON.stringify(message)},${JSON.stringify(lang)})" style="padding:7px 14px;border-radius:8px;border:1px solid rgba(74,222,128,.35);background:rgba(74,222,128,.08);color:#4ade80;cursor:pointer;font-size:11px;font-family:var(--font-main)">💻 Générer le code ${lang}</button>`;
      cb.appendChild(d);cb.scrollTop=cb.scrollHeight;
    },500);
  }

  // NotebookLM
  const notebookKw = ['analyse ce','résume ce','points clés','synthèse','plan de'];
  if(notebookKw.some(k=>msg.includes(k))){
    setTimeout(()=>{
      const cb=document.getElementById('chatbox');
      const d=document.createElement('div');
      d.style.cssText='display:flex;gap:6px;margin:4px 0 8px 44px;flex-wrap:wrap';
      d.innerHTML=`
        <button onclick="analyzeNotebook(${JSON.stringify(message)},'summarize')" style="padding:6px 12px;border-radius:7px;border:1px solid rgba(139,92,246,.3);background:rgba(139,92,246,.07);color:#c8aaff;cursor:pointer;font-size:10px">📋 Résumé</button>
        <button onclick="analyzeNotebook(${JSON.stringify(message)},'extract_key_points')" style="padding:6px 12px;border-radius:7px;border:1px solid rgba(139,92,246,.3);background:rgba(139,92,246,.07);color:#c8aaff;cursor:pointer;font-size:10px">🎯 Points clés</button>
        <button onclick="analyzeNotebook(${JSON.stringify(message)},'create_outline')" style="padding:6px 12px;border-radius:7px;border:1px solid rgba(139,92,246,.3);background:rgba(139,92,246,.07);color:#c8aaff;cursor:pointer;font-size:10px">📑 Plan</button>`;
      cb.appendChild(d);cb.scrollTop=cb.scrollHeight;
    },500);
  }
}

async function launchWebTask(instruction){
  if(!TOKEN||!API_URL){addMsg('ai','Configure ton accès dabord.');return}

  // Ouvrir le Remote Desktop pour voir en temps réel
  openRemoteDesktop();
  rdTab('ai');

  // Message de démarrage
  const logEl = document.getElementById('rd-cu-log');
  if(logEl) logEl.innerHTML = `<div style="color:rgba(201,162,39,.8);margin-bottom:8px;font-size:12px">🤖 <strong>WebTask activé</strong><br><span style="color:rgba(200,190,230,.6)">${instruction}</span></div>`;

  addMsg('ai', `🌐 **WebTask démarré**\nJ'effectue la tâche sur ton PC. Regarde le Remote Desktop pour voir en temps réel.\n\n*Tâche: ${instruction}*`, false);

  // Démarrer le stream immédiatement
  if(!rdStreaming) rdStartStream();

  try{
    const data = await apiCall('/remote/computer_use','POST',{instruction, max_steps:20});

    // Afficher les étapes dans le log
    if(logEl && data.actions){
      let stepsHtml = data.actions.map((s,i)=>`
        <div style="padding:5px 8px;margin-bottom:4px;background:rgba(255,255,255,.02);border-left:2px solid rgba(139,92,246,.3);border-radius:0 6px 6px 0">
          <div style="font-size:9px;color:rgba(139,92,246,.5)">ÉTAPE ${s.step||i+1} · ${(s.action||'').toUpperCase()}</div>
          <div style="font-size:10px;color:rgba(200,190,230,.6);margin-top:2px">${(s.thinking||'').slice(0,80)}</div>
        </div>`).join('');
      logEl.innerHTML += stepsHtml;
      logEl.scrollTop = logEl.scrollHeight;
    }

    // Rapport dans le chat
    const stepsCount = data.steps || 0;
    if(data.status==='done'){
      addMsg('ai', `✅ **WebTask accompli !**\n\n${data.message||'Tâche effectuée avec succès.'}\n\n*${stepsCount} étapes exécutées.*`, true);
    }else if(data.status==='failed'){
      addMsg('ai', `❌ **WebTask échoué:**\n\n${data.message||'Impossible d\'accomplir la tâche.'}\n\n*${stepsCount} étapes tentées.*`, false);
    }else{
      addMsg('ai', `⏱️ **WebTask terminé** (${stepsCount} étapes)\n\n${data.message||'Tâche partiellement effectuée.'}`, false);
    }
  }catch(e){
    addMsg('ai', `❌ **Erreur WebTask:** ${e.message||'PC non connecté ou timeout.'}\n\nVérifie que l'agent Sutur tourne sur ton PC.`, false);
  }
}

async function launchTeamMission(mission, teamSize=4){
  if(!TOKEN||!API_URL){addMsg('ai','Configure ton accès dabord.');return}
  addMsg('ai',`🤖 **OrbixTeam activé!**\n\nJe constitue une équipe de ${teamSize} agents pour:\n*"${mission}"*\n\n⏳ Les agents travaillent... (30-60 secondes)`,false);
  try{
    const data = await apiCall('/team/start','POST',{mission, team_size:teamSize});
    if(data.status==='done'){
      // Afficher le rapport complet
      const agentsList = Object.values(data.agent_results||{})
        .map(a=>`${a.emoji} **${a.name}** — ${a.task.slice(0,50)}`)
        .join('\n');
      addMsg('ai',`📊 **Rapport OrbixTeam**\n\n**Équipe constituée:**\n${agentsList}\n\n---\n${data.report}`,true);
    }else{
      addMsg('ai',`❌ Erreur mission: ${data.message||'Erreur inconnue'}`,false);
    }
  }catch(e){
    addMsg('ai',`❌ Erreur OrbixTeam: ${e.message||''}`,false);
  }
}

function handleMediaCmd(app,msg){
  const q=msg.replace(/instagram|tiktok|twitter|\bx\b|lance|ouvre|cherche|sur|une/gi,'').trim()||'tendances';
  const urls={instagram:'https://www.instagram.com/explore/tags/',tiktok:'https://www.tiktok.com/search?q=',x:'https://x.com/search?q='};
  addMsg('ai',`J'ouvre ${app} sur "${q}"...`);speakText(`J'ouvre ${app} sur ${q}.`);setTimeout(()=>window.open(urls[app]+encodeURIComponent(q),'_blank'),600);
}

async function sendMsg(){
  const inp=document.getElementById('cinp'),model=document.getElementById('model-sel').value,msg=inp.value.trim();
  // Permettre envoi si photo sélectionnée même sans texte
  if((!msg && !currentPhotoB64)||busy)return;
  if(!TOKEN){addMsg('ai','Configure ton acces dans CONFIG.');return}
  inp.value='';busy=true;gActive=true;
  // Afficher le message utilisateur avec la photo si présente
  if(currentPhotoB64){
    const thumbHtml=`<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
      <img src="${currentPhotoB64}" style="max-width:200px;max-height:150px;border-radius:10px;border:1px solid var(--violet-glow);object-fit:cover"/>
      ${msg?`<span style="text-align:right">${msg}</span>`:''}
    </div>`;
    const cb=document.getElementById('chatbox');
    const d=document.createElement('div');
    d.className='cmsg user';d.innerHTML=thumbHtml;
    cb.appendChild(d);cb.scrollTop=cb.scrollHeight;
  }else{
    addMsg('user',msg);
  }

  // ── ONBOARDING ──────────────────────────────────────────────────────────
  if(onboarding){
    busy=false;
    try{
      if(onboardingStep==='name'){
        const prenom=msg.trim().split(' ')[0];
        currentUserName=prenom;
        await apiCall('/profile','PUT',{name:prenom});
        onboardingStep='gender';
        setTimeout(()=>{
          addMsg('ai',`Enchanté ${prenom} ! Pour personnaliser ton expérience, tu es :`,true);
          const cb=document.getElementById('chatbox');
          const gb=document.createElement('div');
          gb.id='gender-btns';
          gb.style.cssText='display:flex;gap:10px;margin:8px 0 4px 46px';
          gb.innerHTML=`
            <button onclick="selectGender('m')" style="flex:1;padding:10px;border-radius:10px;border:1px solid rgba(139,92,246,.3);background:rgba(139,92,246,.1);color:#c8aaff;font-size:14px;cursor:pointer;font-family:system-ui">👨 Homme</button>
            <button onclick="selectGender('f')" style="flex:1;padding:10px;border-radius:10px;border:1px solid rgba(201,162,39,.3);background:rgba(201,162,39,.08);color:#c9a227;font-size:14px;cursor:pointer;font-family:system-ui">👩 Femme</button>`;
          cb.appendChild(gb);cb.scrollTop=cb.scrollHeight;
        },300);
        return;
      }
      if(onboardingStep==='gender'){
        setTimeout(()=>addMsg('ai','Clique sur un des boutons ci-dessus 😊',false),300);
        return;
      }
      if(onboardingStep==='profession'){
        await apiCall('/profile','PUT',{profession:msg.trim()});
        onboardingStep='interests';
        setTimeout(()=>{
          addMsg('ai',`Super. Et quels sont tes centres d'intérêt ? (ex: technologie, musique, sport, finance...)`,true);
        },300);
        return;
      }
      if(onboardingStep==='interests'){
        const interests=msg.split(',').map(s=>s.trim()).filter(Boolean);
        await apiCall('/profile','PUT',{interests});
        onboardingStep='city';
        setTimeout(()=>{
          addMsg('ai',`Parfait. Dans quelle ville es-tu basé ?`,true);
        },300);
        return;
      }
      if(onboardingStep==='city'){
        await apiCall('/profile','PUT',{location_city:msg.trim()});
        onboardingStep='connections';
        await loadProfile();
        setTimeout(()=>{
          addMsg('ai',`Merci ${currentUserName} ! Je te connais maintenant. 🎉\n\nUne dernière chose — veux-tu connecter tes outils (Google Calendar, Gmail, Spotify, Notion) pour que je puisse t'aider encore mieux ? Réponds "oui" pour aller dans Connexions, ou "plus tard" pour continuer sans.`,true);
        },300);
        return;
      }
      if(onboardingStep==='connections'){
        onboarding=false;
        onboardingStep='';
        const wantsConn=/oui|ouais|ok|d accord|connecter|yes/i.test(msg);
        if(wantsConn){
          setTimeout(()=>{
            addMsg('ai',`Parfait ! Va dans l'onglet CONFIG ci-dessus, section Connexions, et clique sur CONNECTER pour chaque service que tu veux lier. Je suis prêt à t'assister en attendant !`,true);
            sw('cfg',document.querySelectorAll('.tab')[7]);
          },300);
        }else{
          setTimeout(()=>{
            addMsg('ai',`Pas de souci, tu pourras les connecter plus tard dans CONFIG > Connexions. Je suis prêt à t'assister. Que puis-je faire pour toi ?`,true);
          },300);
        }
        return;
      }
    }catch(e){
      onboarding=false;
      onboardingStep='';
      addMsg('ai','Une erreur est survenue pendant la configuration. Tu peux continuer à me parler normalement, je vais apprendre à te connaître au fil de nos échanges.',true);
      return;
    }
  }
  // ── FIN ONBOARDING ───────────────────────────────────────────────────────

  addTyping();setStatus('TRAITEMENT...','think');
  history.push({role:'user',content:msg});
  const mc=detectMediaCmd(msg);
  if(mc){rmTyping();handleMediaCmd(mc,msg);busy=false;setStatus('EN LIGNE','idle');return}
  try{
    const data=await apiCall('/chat','POST',{
      message:msg,
      model,
      history:history.slice(-8),
      location:userLocation,
      image_data: currentPhotoB64 ? (currentPhotoB64.includes(',') ? currentPhotoB64.split(',')[1] : currentPhotoB64) : null,
      image_type: currentPhotoType || 'image/jpeg',
      voice_mode: !!voiceModeActive,
      device_type: window.innerWidth<600 ? 'mobile' : 'desktop',
      thread_id: currentThreadId
    });
    if(data.thread_id && !currentThreadId) currentThreadId=data.thread_id;
    rmTyping();const reply=data.reply||data.detail||'Erreur';
    history.push({role:'assistant',content:reply});
    // Nettoyer la photo après envoi
    clearPhoto();
    // Vérifier si des actions spéciales sont disponibles
    checkSpecialActions(msg, reply);

    // Brouillon d'email — afficher interface de confirmation
    if(data.draft_email && data.draft_email.draft_email){
      const d=data.draft_email;
      const emailHtml=`
        <div style="background:rgba(0,212,255,.06);border:1px solid rgba(0,212,255,.2);border-radius:12px;padding:14px;margin-top:8px">
          <div style="font-size:9px;color:rgba(0,212,255,.5);letter-spacing:2px;margin-bottom:10px">✉ BROUILLON D'EMAIL</div>
          <div style="font-size:11px;color:rgba(150,120,255,.6);margin-bottom:4px">À :</div>
          <div style="font-size:12px;color:#c8aaff;margin-bottom:8px" id="draft-to">${d.to||'<non spécifié>'}</div>
          <div style="font-size:11px;color:rgba(150,120,255,.6);margin-bottom:4px">Objet :</div>
          <div style="font-size:12px;color:#c8aaff;margin-bottom:8px">${d.subject||''}</div>
          <div style="font-size:11px;color:rgba(150,120,255,.6);margin-bottom:4px">Message :</div>
          <div style="font-size:12px;color:#e0d0ff;white-space:pre-wrap;margin-bottom:12px;line-height:1.6">${d.body||''}</div>
          <div style="display:flex;gap:8px">
            <button onclick="sendDraftEmail(${JSON.stringify(d).replace(/"/g,'&quot;')})" style="flex:1;padding:8px;background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.3);border-radius:8px;color:#00d4ff;font-size:10px;letter-spacing:1px;cursor:pointer;font-family:'Courier New',monospace">✓ ENVOYER</button>
            <button onclick="this.closest('div[style]').remove()" style="flex:1;padding:8px;background:rgba(255,60,60,.07);border:1px solid rgba(255,60,60,.2);border-radius:8px;color:#ff6060;font-size:10px;letter-spacing:1px;cursor:pointer;font-family:'Courier New',monospace">✗ ANNULER</button>
          </div>
        </div>`;
      addMsg('ai','Voici le mail que j\'ai rédigé pour toi :'+emailHtml,false);
    }else{
      addMsg('ai',reply,true);
    }

    // Carte persistante — reste ouverte, se met juste à jour à chaque nouvelle demande de lieu
    if(data.map && data.map.route){
      showRouteOnMap(data.map.route);
    }else if(data.map && data.map.lat!=null && data.map.lng!=null){
      showPersistentMap(data.map.lat,data.map.lng,data.map.location_name);
      showHolographicLocation(data.map);
    }

    // Image générée par IA — une nouvelle image par demande, insérée dans le fil
    if(data.image && data.image.url){
      const cbImg=document.getElementById('chatbox');
      const imgWrap=document.createElement('div');
      imgWrap.style.cssText='margin:8px 0 4px 46px;max-width:260px';
      const img=document.createElement('img');
      img.src=data.image.url;
      img.loading='lazy';
      img.alt='Image générée par IA';
      img.style.cssText='width:100%;border-radius:12px;border:1px solid var(--border);display:block;cursor:pointer';
      img.onerror=()=>{imgWrap.innerHTML='<div style="padding:12px;color:rgba(255,120,120,.7);font-size:11px;border:1px solid var(--border);border-radius:12px">Image indisponible (lien expiré ou erreur réseau)</div>';};
      img.onclick=()=>window.open(data.image.url,'_blank');
      imgWrap.appendChild(img);
      cbImg.appendChild(imgWrap);
      cbImg.scrollTop=cbImg.scrollHeight;
    }

    // Vidéo YouTube trouvée — ouverture automatique, comme une vraie lecture
    if(data.youtube_open_url){
      setTimeout(()=>window.open(data.youtube_open_url,'_blank'),500);
    }

    document.getElementById('hmod').textContent=(data.model_used||'ORBIX').toUpperCase().replace('CLAUDE','ORBIX').replace('GPT-4O','ORBIX GPT');
    // Indicateur émotionnel
    const emotIcons={stress:'😤',joie:'😊',fatigue:'😴',motivation:'🔥',tristesse:'😔',colere:'😠',anxiete:'😰',neutre:''};
    const emot=data.emotion||'neutre';
    const hemot=document.getElementById('hemot');
    if(hemot)hemot.textContent=emotIcons[emot]||'';
  }catch(e){rmTyping();addMsg('ai','Erreur de connexion.')}
  setStatus('EN LIGNE','idle');busy=false;
}
