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
  // Vider le chat seulement si changement en live (pas au chargement)
  if(!init){
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
    document.getElementById('profile-display').innerHTML=`
      <div class="prof-row"><div class="prof-lbl">Nom</div><div class="prof-val">${data.name||'-'}</div></div>
      <div class="prof-row"><div class="prof-lbl">Profession</div><div class="prof-val">${data.profession||'-'}</div></div>
      <div class="prof-row"><div class="prof-lbl">Localisation</div><div class="prof-val">${data.location_city||'-'}</div></div>
      <div class="prof-row"><div class="prof-lbl">Brief quotidien</div><div class="prof-val" style="display:flex;align-items:center;gap:8px"><span>${data.brief_enabled!==false?'Actif a '+(data.daily_brief_hour||8)+'h':'Desactive'}</span><button class="tog ${data.brief_enabled!==false?'on':'off'}" style="transform:scale(.7)" onclick="toggleBriefEnabled(this)"></button></div></div>
      <div class="prof-row" style="border:none"><div class="prof-lbl">Interets</div></div>
      <div class="tag-list">${interests.map(i=>`<span class="tag">${i}</span>`).join('')||'<span style="color:rgba(120,80,255,.35);font-size:11px">Aucun</span>'}</div>`;
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
  const p=document.getElementById('new-pass-cfg').value.trim(),el=document.getElementById('el-cfg').value.trim(),a=document.getElementById('api-cfg').value.trim();
  if(p){localStorage.setItem('s_pass',p);PASS=p}
  if(el){localStorage.setItem('s_el',el);EL_KEY=el}
  if(a){localStorage.setItem('s_api',a);API_URL=a}
  addMsg('ai','Configuration mise a jour.');
}

async function connectGoogle(){
  if(!TOKEN||!API_URL){addMsg('ai','Configure ton accès dabord.');return}
  try{
    const data=await apiCall('/google/auth','GET');
    if(data.auth_url){
      addMsg('ai','Ouverture de Google. Autorise l\'accès à ton compte dans la fenêtre qui s\'ouvre.',false);
      const popup=window.open(data.auth_url,'google_auth','width=500,height=600,scrollbars=yes');
      // Vérifier toutes les 2s si la popup s'est fermée
      const check=setInterval(()=>{
        if(popup&&popup.closed){
          clearInterval(check);
          setTimeout(()=>checkGoogleStatus(),1000);
        }
      },2000);
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
  }catch(e){}
}

async function connectSpotify(){
  if(!TOKEN||!API_URL){addMsg('ai','Configure ton accès dabord.');return}
  try{
    const data=await apiCall('/spotify/auth','GET');
    if(data.auth_url){
      addMsg('ai','Ouverture de Spotify. Autorise l\'accès dans la fenêtre.',false);
      const popup=window.open(data.auth_url,'spotify_auth','width=500,height=600,scrollbars=yes');
      const check=setInterval(()=>{
        if(popup&&popup.closed){clearInterval(check);setTimeout(()=>checkSpotifyStatus(),1000);}
      },2000);
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
  }catch(e){}
}

async function connectCanva(){
  if(!TOKEN||!API_URL){addMsg('ai','Configure ton accès dabord.');return}
  try{
    const data=await apiCall('/canva/auth','GET');
    if(data.auth_url){
      addMsg('ai','Ouverture de Canva. Autorise l\'accès dans la fenêtre.',false);
      const popup=window.open(data.auth_url,'canva_auth','width=500,height=650,scrollbars=yes');
      const check=setInterval(()=>{
        if(popup&&popup.closed){clearInterval(check);setTimeout(()=>checkCanvaStatus(),1000);}
      },2000);
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
  }catch(e){}
}

async function connectNotion(){
  if(!TOKEN||!API_URL){addMsg('ai','Configure ton accès dabord.');return}
  try{
    const data=await apiCall('/notion/auth','GET');
    if(data.auth_url){
      addMsg('ai','Ouverture de Notion. Autorise l\'accès dans la fenêtre.',false);
      const popup=window.open(data.auth_url,'notion_auth','width=500,height=600,scrollbars=yes');
      const check=setInterval(()=>{
        if(popup&&popup.closed){clearInterval(check);setTimeout(()=>checkNotionStatus(),1000);}
      },2000);
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
  }catch(e){}
}
