// ── PROFIL & CONNEXIONS EXTERNES ────────────────────────────────────────
// Google, Spotify, Canva, Notion — connexion/déconnexion/statut.

function setTheme(theme, init){
  document.body.classList.remove('theme-terminal');
  if(theme==='terminal') document.body.classList.add('theme-terminal');
  localStorage.setItem('s_theme', theme);
  // Label
  const lbl=document.getElementById('theme-label');
  if(lbl)lbl.textContent='Thème actuel : '+(theme==='terminal'?'TERMINAL':'LIQUID GLASS');
  // Boutons
  const btnD=document.getElementById('theme-default');
  const btnT=document.getElementById('theme-terminal-btn');
  if(btnD)btnD.style.opacity=theme==='default'?'1':'0.4';
  if(btnT)btnT.style.opacity=theme==='terminal'?'1':'0.4';
  // Input
  const inp=document.getElementById('cinp');
  const cmdPfx=document.getElementById('cmd-prefix');
  if(inp)inp.placeholder=theme==='terminal'?'entrer commande...':'Parle a Sutur...';
  if(cmdPfx)cmdPfx.style.display=theme==='terminal'?'flex':'none';
  // Partage le thème avec le profil Sutur (l'île de bureau le lit) — sauf au chargement.
  if(!init) apiCall('/profile','PUT',{ui_theme:theme}).catch(()=>{});
  // Vider le chat seulement si changement en live (pas au chargement)
  if(!init){
    // Une réponse en cours s'écrit dans liveStream.row : vider le chat détacherait ce
    // nœud, le texte serait perdu à l'écran tout en continuant d'alimenter l'historique
    // — écran et contexte du modèle divergeaient. On garde le fil tel quel.
    if(busy){
      showToast('Thème appliqué. Le fil garde son apparence actuelle jusqu\'au prochain message.',{duration:3200});
      return;
    }
    const cb=document.getElementById('chatbox');
    if(cb)cb.innerHTML='';
    if(theme==='terminal'){
      addMsg('ai','[SUTUR_OS v2.1] — Système initialisé. Connexions actives. En attente de commande.',false);
    } else {
      addMsg('ai','Interface Liquid Glass activée. Que puis-je faire pour toi ?',false);
    }
  }
}

async function loadProfile(){
  try{
    const data=await apiCall('/profile');
    if(data.is_owner){userIsOwner=true;setTimeout(loadAdminDashboard,800);}
    const interests=data.interests||[];
    // Stocker le nom globalement
    currentUserName = data.name || '';
    // Thème partagé avec l'île de bureau : le profil Sutur fait foi quand il existe.
    if(data.ui_theme && data.ui_theme!==(localStorage.getItem('s_theme')||'default')) setTheme(data.ui_theme,true);
    else if(!data.ui_theme && localStorage.getItem('s_theme')==='terminal') apiCall('/profile','PUT',{ui_theme:'terminal'}).catch(()=>{});
    document.getElementById('profile-display').innerHTML=`
      <div class="prof-row"><div class="prof-lbl">Nom</div><div class="prof-val">${escapeHtml(data.name||'-')}</div></div>
      <div class="prof-row"><div class="prof-lbl">Profession</div><div class="prof-val">${escapeHtml(data.profession||'-')}</div></div>
      <div class="prof-row"><div class="prof-lbl">Localisation</div><div class="prof-val">${escapeHtml(data.location_city||'-')}</div></div>
      <div class="prof-row"><div class="prof-lbl">Brief quotidien</div><div class="prof-val" style="display:flex;align-items:center;gap:8px"><span>${data.brief_enabled!==false?'Actif a '+(data.daily_brief_hour||8)+'h':'Desactive'}</span><button class="tog ${data.brief_enabled!==false?'on':'off'}" style="transform:scale(.7)" onclick="toggleBriefEnabled(this)"></button></div></div>
      <div class="prof-row" style="border:none"><div class="prof-lbl">Interets</div></div>
      <div class="tag-list">${interests.map(i=>`<span class="tag">${escapeHtml(i)}</span>`).join('')||'<span style="color:rgba(120,80,255,.35);font-size:11px">Aucun</span>'}</div>`;
    if(data.profession)document.getElementById('prof-job').value=data.profession;
    if(interests.length)document.getElementById('prof-interests').value=interests.join(', ');
    if(data.location_city)document.getElementById('prof-city').value=data.location_city;
    if(data.daily_brief_hour)document.getElementById('prof-hour').value=data.daily_brief_hour;
    return data.name || '';
  }catch(e){ return ''; }
}

async function toggleBriefEnabled(btn){
  const willEnable=btn.classList.contains('off');
  btn.classList.toggle('on');btn.classList.toggle('off');
  try{
    await apiCall('/profile','PUT',{brief_enabled:willEnable});
    loadProfile();
  }catch(e){
    btn.classList.toggle('on');btn.classList.toggle('off'); // annule le changement visuel si l'appel échoue
    addMsg('ai','Erreur mise a jour du brief quotidien: '+e.message,false);
  }
}

async function saveProfile(){
  const profession=document.getElementById('prof-job').value.trim();
  const interestsRaw=document.getElementById('prof-interests').value.trim();
  const interests=interestsRaw?interestsRaw.split(',').map(s=>s.trim()).filter(Boolean):null;
  const location_city=document.getElementById('prof-city').value.trim();
  const daily_brief_hour=parseInt(document.getElementById('prof-hour').value);
  try{
    await apiCall('/profile','PUT',{profession:profession||null,interests,location_city:location_city||null,daily_brief_hour});
    addMsg('ai','Profil mis a jour. Sutur adaptera ses reponses a ton nouveau profil.');sw('chat',document.querySelectorAll('.tab')[0]);
  }catch(e){addMsg('ai','Erreur mise a jour profil.')}
}

function saveConfig(){
  const p=document.getElementById('new-pass-cfg').value.trim(),el=document.getElementById('el-cfg').value.trim();
  if(p){localStorage.setItem('s_pass',p);PASS=p}
  if(el){localStorage.setItem('s_el',el);EL_KEY=el}
  addMsg('ai','Configuration mise a jour.');
}

// Suivi d'une fenêtre d'autorisation OAuth.
//
// Deux défauts réels corrigés ici. Le fournisseur redirige vers
// « …/?google=connected », mais cette redirection atterrit DANS la fenêtre
// d'autorisation, qui démarre alors une deuxième copie complète de Sutur et y
// affiche « connecté » — pendant que la fenêtre d'origine, celle que l'utilisateur
// regarde, ne change pas. Sur téléphone, window.open donne un simple onglet : on se
// retrouvait devant un doublon de l'application, à revenir en arrière à la main.
// Et l'intervalle de surveillance n'était nettoyé que dans sa propre branche : avec
// un bloqueur de fenêtres (popup === null) ou un onglet jamais refermé, il tournait
// indéfiniment, et chaque clic sur CONNECTER en ajoutait un.
function watchAuthPopup(popup, label, onDone){
  if(!popup){
    addMsg('ai','Ton navigateur a bloqué la fenêtre d\'autorisation '+label+'. Autorise les fenêtres surgissantes pour ce site, puis réessaie.',false);
    return;
  }
  const started=Date.now();
  const stop=()=>{clearInterval(timer);window.removeEventListener('message',onMessage);};
  // La copie de Sutur chargée dans la fenêtre prévient puis se ferme (voir auth.js).
  const onMessage=(ev)=>{
    if(ev.origin!==window.location.origin)return;
    if(!ev.data||ev.data.type!=='oauth-done')return;
    stop();
    try{popup.close();}catch(e){}
    onDone();
  };
  window.addEventListener('message',onMessage);
  const timer=setInterval(()=>{
    if(popup.closed){stop();setTimeout(onDone,800);return;}
    // Garde-fou : une fenêtre laissée ouverte ne doit pas faire tourner ce minuteur
    // pour le reste de la session.
    if(Date.now()-started>5*60*1000)stop();
  },1000);
}

async function connectGoogle(){
  if(!TOKEN||!API_URL){addMsg('ai','Configure ton accès dabord.');return}
  try{
    const data=await apiCall('/google/auth','GET');
    if(data.auth_url){
      addMsg('ai','Ouverture de Google. Autorise l\'accès à ton compte dans la fenêtre qui s\'ouvre.',false);
      const popup=window.open(data.auth_url,'google_auth','width=500,height=640,scrollbars=yes');
      watchAuthPopup(popup,'Google',()=>{checkGoogleStatus();refreshConnectorTruth();});
    }
  }catch(e){addMsg('ai','Erreur connexion Google: '+(e.message||'inconnue'),false);}
}

async function disconnectGoogle(){
  try{
    await apiCall('/google/disconnect','POST');
    addMsg('ai','✅ Google déconnecté.',false);
    checkGoogleStatus();
  }catch(e){addMsg('ai','Erreur déconnexion Google.',false);}
}

// Un statut qu'on n'a pas pu lire n'est pas un statut vert. Avant, chaque vérification
// était enveloppée dans un catch vide : dès qu'une carte avait affiché « ✓ Connecté »,
// elle le restait toute la session, même service mort.
function connectorUnknown(ids,err){
  for(const id of ids){
    const el=document.getElementById(id);
    if(!el)continue;
    el.textContent='État inconnu — vérification impossible';
    el.className='conn-status ko';
    el.title=String((err&&err.message)||err||'');
  }
}

// Ce que le serveur répond VRAIMENT : /health/connectors appelle chaque service avec
// les identifiants de l'utilisateur au lieu de regarder si une ligne existe en base.
// C'est la seule source qui distingue « connecté » de « connecté mais autorisation
// expirée » — l'état qui faisait passer Sutur pour cassé sans explication.
const CONNECTOR_CARDS={
  google:['goog-cal-status','goog-gmail-status'],
  spotify:['spotify-status'],
  notion:['notion-status'],
  canva:['canva-status'],
};
const CONNECTOR_LABEL={
  ok:'✓ Connecté', degraded:'✓ Connecté', needs_reconnect:'⚠️ À reconnecter',
  not_connected:'Non connecté', not_configured:'Non configuré', error:'Injoignable',
};

async function refreshConnectorTruth(){
  if(!TOKEN||!API_URL)return;
  let data;
  try{
    data=await apiCall('/health/connectors','GET');
  }catch(e){
    // Route absente = serveur pas encore déployé. On ne contredit pas les
    // vérifications individuelles, qui elles ont répondu.
    return;
  }
  for(const c of (data&&data.connectors)||[]){
    const ids=CONNECTOR_CARDS[c.id];
    if(!ids)continue;
    const note=[c.detail,c.action].filter(Boolean)
      .map(t=>'<br><span style="color:#e0c060;font-size:9px">'+escapeHtml(t)+'</span>').join('');
    for(const id of ids){
      const el=document.getElementById(id);
      if(!el)continue;
      el.innerHTML=escapeHtml(CONNECTOR_LABEL[c.state]||c.state)+note;
      el.className='conn-status '+(c.state==='ok'||c.state==='degraded'?'ok':'ko');
    }
    updateStatusDot('sb-'+c.id,c.state==='ok');
  }
}

function updateStatusDot(id,connected){
  const dot=document.getElementById(id);
  if(dot)dot.className='statusdot '+(connected?'ok':'ko');
}

async function checkGoogleStatus(){
  if(!TOKEN||!API_URL)return;
  try{
    const data=await apiCall('/google/status','GET');
    updateStatusDot('sb-google',data.connected);
    const calSt=document.getElementById('goog-cal-status');
    const calBtn=document.getElementById('goog-cal-btn');
    const gmailSt=document.getElementById('goog-gmail-status');
    const gmailBtn=document.getElementById('goog-gmail-btn');
    if(data.connected){
      const since=data.updated_at?new Date(data.updated_at).toLocaleDateString('fr'):'';
      const reconnectWarning=data.needs_reconnect?' · ⚠️ reconnecte pour Docs/Sheets':'';
      calSt.innerHTML='✓ Connecté'+(since?' · '+since:'')+(reconnectWarning?'<br><span style="color:#e0c060;font-size:9px">⚠️ Docs/Sheets/Contacts non autorisés — déconnecte puis reconnecte</span>':'');
      calSt.className='conn-status ok';
      calBtn.textContent='DÉCONNECTER';
      calBtn.className='conn-btn connected';
      calBtn.onclick=disconnectGoogle;
      gmailSt.textContent='✓ Connecté'+(since?' · '+since:'');
      gmailSt.className='conn-status ok';
      gmailBtn.textContent='DÉCONNECTER';
      gmailBtn.className='conn-btn connected';
      gmailBtn.onclick=disconnectGoogle;
    }else{
      calSt.textContent='Non connecté';calSt.className='conn-status ko';
      calBtn.textContent='CONNECTER';calBtn.className='conn-btn connect';calBtn.onclick=connectGoogle;
      gmailSt.textContent='Non connecté';gmailSt.className='conn-status ko';
      gmailBtn.textContent='CONNECTER';gmailBtn.className='conn-btn connect';gmailBtn.onclick=connectGoogle;
    }
  }catch(e){connectorUnknown(['goog-cal-status','goog-gmail-status'],e);}
}

async function connectSpotify(){
  if(!TOKEN||!API_URL){addMsg('ai','Configure ton accès dabord.');return}
  try{
    const data=await apiCall('/spotify/auth','GET');
    if(data.auth_url){
      addMsg('ai','Ouverture de Spotify. Autorise l\'accès dans la fenêtre.',false);
      const popup=window.open(data.auth_url,'spotify_auth','width=500,height=640,scrollbars=yes');
      watchAuthPopup(popup,'Spotify',()=>{checkSpotifyStatus();refreshConnectorTruth();});
    }
  }catch(e){addMsg('ai','Erreur connexion Spotify.',false);}
}

async function disconnectSpotify(){
  try{
    await apiCall('/spotify/disconnect','POST');
    addMsg('ai','✅ Spotify déconnecté.',false);
    checkSpotifyStatus();
  }catch(e){addMsg('ai','Erreur déconnexion Spotify.',false);}
}

async function checkSpotifyStatus(){
  if(!TOKEN||!API_URL)return;
  try{
    const data=await apiCall('/spotify/status','GET');
    updateStatusDot('sb-spotify',data.connected);
    const st=document.getElementById('spotify-status');
    const btn=document.getElementById('spotify-btn');
    if(data.connected){
      const since=data.updated_at?new Date(data.updated_at).toLocaleDateString('fr'):'';
      st.textContent='✓ Connecté'+(since?' · '+since:'');
      st.className='conn-status ok';
      btn.textContent='DÉCONNECTER';
      btn.className='conn-btn connected';
      btn.onclick=disconnectSpotify;
    }else{
      st.textContent='Non connecté';st.className='conn-status ko';
      btn.textContent='CONNECTER';btn.className='conn-btn connect';btn.onclick=connectSpotify;
    }
  }catch(e){connectorUnknown(['spotify-status'],e);}
}

async function connectCanva(){
  if(!TOKEN||!API_URL){addMsg('ai','Configure ton accès dabord.');return}
  try{
    const data=await apiCall('/canva/auth','GET');
    if(data.auth_url){
      addMsg('ai','Ouverture de Canva. Autorise l\'accès dans la fenêtre.',false);
      const popup=window.open(data.auth_url,'canva_auth','width=500,height=640,scrollbars=yes');
      watchAuthPopup(popup,'Canva',()=>{checkCanvaStatus();refreshConnectorTruth();});
    }
  }catch(e){addMsg('ai','Erreur connexion Canva — vérifie que CANVA_CLIENT_ID est bien configuré côté serveur.',false);}
}

async function disconnectCanva(){
  try{
    await apiCall('/canva/disconnect','POST');
    addMsg('ai','✅ Canva déconnecté.',false);
    checkCanvaStatus();
  }catch(e){addMsg('ai','Erreur déconnexion Canva.',false);}
}

async function checkCanvaStatus(){
  if(!TOKEN||!API_URL)return;
  try{
    const data=await apiCall('/canva/status','GET');
    const st=document.getElementById('canva-status');
    const btn=document.getElementById('canva-btn');
    if(data.connected){
      const since=data.updated_at?new Date(data.updated_at).toLocaleDateString('fr'):'';
      st.textContent='✓ Connecté'+(since?' · '+since:'');
      st.className='conn-status ok';
      btn.textContent='DÉCONNECTER';
      btn.className='conn-btn connected';
      btn.onclick=disconnectCanva;
    }else{
      st.textContent='Non connecté';st.className='conn-status ko';
      btn.textContent='CONNECTER';btn.className='conn-btn connect';btn.onclick=connectCanva;
    }
  }catch(e){connectorUnknown(['canva-status'],e);}
}

async function connectNotion(){
  if(!TOKEN||!API_URL){addMsg('ai','Configure ton accès dabord.');return}
  try{
    const data=await apiCall('/notion/auth','GET');
    if(data.auth_url){
      addMsg('ai','Ouverture de Notion. Autorise l\'accès dans la fenêtre.',false);
      const popup=window.open(data.auth_url,'notion_auth','width=500,height=640,scrollbars=yes');
      watchAuthPopup(popup,'Notion',()=>{checkNotionStatus();refreshConnectorTruth();});
    }
  }catch(e){addMsg('ai','Notion non configuré — ajoute NOTION_CLIENT_ID dans Railway.',false);}
}

async function disconnectNotion(){
  try{
    await apiCall('/notion/disconnect','POST');
    addMsg('ai','✅ Notion déconnecté.',false);
    checkNotionStatus();
  }catch(e){addMsg('ai','Erreur déconnexion Notion.',false);}
}

async function checkNotionStatus(){
  if(!TOKEN||!API_URL)return;
  try{
    const data=await apiCall('/notion/status','GET');
    updateStatusDot('sb-notion',data.connected);
    const st=document.getElementById('notion-status');
    const btn=document.getElementById('notion-btn');
    if(data.connected){
      const since=data.updated_at?new Date(data.updated_at).toLocaleDateString('fr'):'';
      st.textContent='✓ Connecté'+(since?' · '+since:'');
      st.className='conn-status ok';
      btn.textContent='DÉCONNECTER';
      btn.className='conn-btn connected';
      btn.onclick=disconnectNotion;
    }else{
      st.textContent='Non connecté';st.className='conn-status ko';
      btn.textContent='CONNECTER';btn.className='conn-btn connect';btn.onclick=connectNotion;
    }
  }catch(e){connectorUnknown(['notion-status'],e);}
}
