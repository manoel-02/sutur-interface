// ── AUTHENTIFICATION ────────────────────────────────────────────────────
// Connexion, biométrie WebAuthn, conditions d'utilisation, configuration initiale.

function loadCfg(){
  const p=new URLSearchParams(window.location.search);
  if(p.get('autosetup')){
    const tk=p.get('token'),ps=p.get('pass');
    if(tk)localStorage.setItem('s_token',tk);
    if(ps)localStorage.setItem('s_pass',ps);
    window.history.replaceState({},'',window.location.pathname);
  }
  TOKEN=localStorage.getItem('s_token')||'';
  PASS=localStorage.getItem('s_pass')||'';
  // API URL fixe — plus besoin de la configurer
  API_URL='https://uvicorn-appmain-production-95d3.up.railway.app';
  EL_KEY=localStorage.getItem('s_el')||'';
  if(!TOKEN||!PASS)showFirstSetup();else showLoginForm();
}

function showFirstSetup(){document.getElementById('first-setup').style.display='flex';document.getElementById('login-form').style.display='none'}

function showLoginForm(){document.getElementById('first-setup').style.display='none';document.getElementById('login-form').style.display='flex'}

function saveSetup(){
  const p=document.getElementById('new-pass').value.trim(),tk=document.getElementById('new-token').value.trim();
  if(!p||!tk){document.getElementById('serr').textContent='Token et mot de passe requis';return}
  localStorage.setItem('s_pass',p);
  localStorage.setItem('s_token',tk);
  PASS=p;TOKEN=tk;
  API_URL='https://uvicorn-appmain-production-95d3.up.railway.app';
  showLoginForm();unlock();
}

function tryPass(){
  const v=document.getElementById('pass-inp').value;
  if(!PASS||!TOKEN){showErr('Configure ton accès dabord');showFirstSetup();return}
  if(v===PASS)unlock();else showErr('Mot de passe incorrect')
}

function webauthnSupported(){
  return window.PublicKeyCredential !== undefined && navigator.credentials !== undefined;
}

function b64urlToBuf(b64url){
  const pad='='.repeat((4-b64url.length%4)%4);
  const b64=(b64url+pad).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(b64);
  const buf=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)buf[i]=raw.charCodeAt(i);
  return buf.buffer;
}

function bufToB64url(buf){
  const bytes=new Uint8Array(buf);
  let str='';
  for(let i=0;i<bytes.length;i++)str+=String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function tryBio(type){
  const btn=document.getElementById(type+'-btn');
  if(!TOKEN){showErr('Configure ton accès dabord');showFirstSetup();return}
  if(!webauthnSupported()){
    showErr(type==='face'?'Face ID non disponible sur cet appareil':'Touch ID non disponible sur cet appareil');
    return;
  }
  btn.classList.add('scanning');
  try{
    // Récupère les options de connexion depuis le backend
    const optRes=await fetch(API_URL+'/webauthn/login/options?token='+encodeURIComponent(TOKEN));
    if(!optRes.ok){
      btn.classList.remove('scanning');
      if(optRes.status===404){
        showErr('Aucune biométrie enregistrée. Connecte-toi par mot de passe puis active-la dans CONFIG.');
      }else{
        showErr('Biométrie indisponible pour le moment');
      }
      return;
    }
    const options=await optRes.json();
    options.challenge=b64urlToBuf(options.challenge);
    if(options.allowCredentials){
      options.allowCredentials=options.allowCredentials.map(c=>({...c,id:b64urlToBuf(c.id)}));
    }
    const credential=await navigator.credentials.get({publicKey:options});
    const authResponse={
      id:credential.id,
      rawId:bufToB64url(credential.rawId),
      type:credential.type,
      response:{
        authenticatorData:bufToB64url(credential.response.authenticatorData),
        clientDataJSON:bufToB64url(credential.response.clientDataJSON),
        signature:bufToB64url(credential.response.signature),
        userHandle:credential.response.userHandle?bufToB64url(credential.response.userHandle):null,
      },
    };
    const verifyRes=await fetch(API_URL+'/webauthn/login/verify',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user_token:TOKEN,credential:authResponse})
    });
    btn.classList.remove('scanning');
    if(verifyRes.ok){
      unlock();
    }else{
      showErr('Échec de la vérification biométrique');
    }
  }catch(e){
    btn.classList.remove('scanning');
    if(e.name==='NotAllowedError'){
      showErr('Authentification annulée');
    }else{
      showErr('Erreur biométrique — utilise ton mot de passe');
    }
  }
}

async function enrollBiometric(){
  if(!TOKEN){addMsg('ai','Connecte-toi dabord pour activer la biométrie.');return}
  if(!webauthnSupported()){addMsg('ai','Ton appareil/navigateur ne supporte pas Face ID/Touch ID (WebAuthn).');return}
  try{
    const optRes=await apiCall('/webauthn/register/options','GET');
    optRes.challenge=b64urlToBuf(optRes.challenge);
    optRes.user.id=b64urlToBuf(optRes.user.id);
    if(optRes.excludeCredentials){
      optRes.excludeCredentials=optRes.excludeCredentials.map(c=>({...c,id:b64urlToBuf(c.id)}));
    }
    const credential=await navigator.credentials.create({publicKey:optRes});
    const regResponse={
      id:credential.id,
      rawId:bufToB64url(credential.rawId),
      type:credential.type,
      response:{
        attestationObject:bufToB64url(credential.response.attestationObject),
        clientDataJSON:bufToB64url(credential.response.clientDataJSON),
      },
      device_name:navigator.userAgentData?.platform||navigator.platform||'Appareil',
    };
    const r=await fetch(API_URL+'/webauthn/register/verify',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
      body:JSON.stringify(regResponse)
    });
    if(r.ok){
      addMsg('ai','✅ Biométrie activée ! Tu peux maintenant te connecter avec Face ID / Touch ID.');
      checkWebauthnStatus();
    }else{
      addMsg('ai','Échec de l\'activation de la biométrie. Réessaie.');
    }
  }catch(e){
    if(e.name==='NotAllowedError'){
      addMsg('ai','Activation annulée.');
    }else{
      addMsg('ai','Erreur lors de l\'activation biométrique: '+(e.message||'inconnue'));
    }
  }
}

async function checkWebauthnStatus(){
  if(!TOKEN||!API_URL)return;
  try{
    const data=await apiCall('/webauthn/status','GET');
    const btn=document.getElementById('bio-enroll-btn');
    if(btn){
      btn.textContent=data.enrolled?'BIOMÉTRIE ACTIVÉE ✓':'ACTIVER FACE ID / TOUCH ID';
    }
  }catch(e){}
}

function showErr(m){const e=document.getElementById('lerr');e.textContent=m;setTimeout(()=>e.textContent='',3000)}

function unlock(){
  document.getElementById('lock').style.display='none';
  const ms=document.getElementById('main');ms.style.display='flex';
  gActive=true;
  // Charger genre sauvegardé
  const sg=localStorage.getItem('s_gender');
  if(sg)userGender=sg;
  getLocation();
  loadMessages();
  checkGoogleStatus();
  checkSpotifyStatus();
  checkNotionStatus();
  checkCanvaStatus();
  checkWebauthnStatus();
  // Afficher la nav du bas après connexion
  const nav=document.getElementById('bottom-nav');
  if(nav)nav.style.display='flex';
  const chatPanel=document.getElementById('tab-chat');
  if(chatPanel)chatPanel.classList.add('active');
  const inpBar=document.getElementById('inp-bar');
  if(inpBar)inpBar.style.display='flex';
  const globeArea=document.getElementById('globe-area');
  if(globeArea)globeArea.style.display='flex';
  // Détecte retour OAuth
  const q=window.location.search;
  if(q.includes('google=connected')){
    loadProfile().then(()=>{
      addMsg('ai','✅ Google Calendar et Gmail connectés ! Demande-moi ton agenda ou tes emails.',true);
      checkGoogleStatus();
      window.history.replaceState({},'',window.location.pathname);
    });
  } else if(q.includes('spotify=connected')){
    loadProfile().then(()=>{
      addMsg('ai','✅ Spotify connecté ! Dis-moi "mets de la musique" ou "qu\'est-ce qui joue ?"',true);
      checkSpotifyStatus();
      window.history.replaceState({},'',window.location.pathname);
    });
  } else if(q.includes('notion=connected')){
    loadProfile().then(()=>{
      addMsg('ai','✅ Notion connecté ! Je peux maintenant accéder à tes pages et créer des notes.',true);
      checkNotionStatus();
      window.history.replaceState({},'',window.location.pathname);
    });
  } else if(q.includes('canva=connected')){
    loadProfile().then(()=>{
      addMsg('ai','✅ Canva connecté ! Dis-moi "génère une vidéo avec Canva" pour voir tes templates disponibles.',true);
      checkCanvaStatus();
      window.history.replaceState({},'',window.location.pathname);
    });
  } else {
    loadProfile().then(async userName => {
      // Vérifier contrat confidentialité (utilisateurs invités)
      const termsOk = await checkTerms();
      if(!termsOk) return;
      greetUser(userName);
      setTimeout(loadSportNotifications, 2000);
      setTimeout(deliverPendingNotifications, 3000);
      setTimeout(checkAndRequestPermissions, 4000);
      setTimeout(silentHealthCheck, 6000);
    });
  }
}

async function checkTerms(){
  try{
    const data=await apiCall('/terms/status');
    if(data.accepted||data.is_owner||data.error)return true;
    showTermsModal();
    return false;
  }catch(e){
    // En cas d'erreur réseau ou route manquante → laisser passer
    return true;
  }
}

function showTermsModal(){
  const modal=document.createElement('div');
  modal.id='terms-modal';
  modal.style.cssText='position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML=`
    <div style="background:#0d0a24;border:1px solid rgba(139,92,246,.35);border-radius:20px;max-width:480px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden">
      <div style="padding:18px 20px 12px;border-bottom:1px solid rgba(139,92,246,.15);flex-shrink:0">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="6" fill="#8b5cf6"/><ellipse cx="16" cy="16" rx="15" ry="5.5" stroke="#c9a227" stroke-width="1.5" fill="none" transform="rotate(-20 16 16)"/></svg>
          <span style="font-size:14px;font-weight:700;color:#e8e4f8;letter-spacing:1px">CONTRAT DE CONFIDENTIALITÉ</span>
        </div>
        <div style="font-size:10px;color:rgba(160,151,196,.5);letter-spacing:1px">Sutur by OrbixLabs · v1.0 · ${new Date().toLocaleDateString('fr')}</div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:18px;font-size:13px;color:rgba(200,190,230,.8);line-height:1.75">
        <div style="font-size:11px;color:#c9a227;letter-spacing:2px;margin-bottom:10px">📋 OBJET</div>
        <p style="margin-bottom:12px">Le présent contrat régit l'utilisation de <strong style="color:#c8aaff">Sutur</strong>, assistant personnel intelligent développé par <strong style="color:#c8aaff">OrbixLabs</strong>. En accédant à Sutur, vous acceptez les conditions ci-dessous.</p>
        <div style="font-size:11px;color:#c9a227;letter-spacing:2px;margin-bottom:8px">🔒 1. DONNÉES COLLECTÉES</div>
        <p style="margin-bottom:12px">Sutur collecte : profil utilisateur, historique des conversations, données financières saisies volontairement, contacts et rappels, enregistrements audio (réunions). Ces données sont stockées sur Supabase (UE) et Railway (US). Elles ne sont <strong style="color:#4ade80">jamais vendues</strong> à des tiers.</p>
        <div style="font-size:11px;color:#c9a227;letter-spacing:2px;margin-bottom:8px">🤖 2. INTELLIGENCE ARTIFICIELLE</div>
        <p style="margin-bottom:12px">Sutur utilise les APIs Anthropic (Claude) et OpenAI (Whisper). Vos messages sont traités par ces services selon leurs propres politiques de confidentialité.</p>
        <div style="font-size:11px;color:#c9a227;letter-spacing:2px;margin-bottom:8px">👤 3. VOS DROITS</div>
        <p style="margin-bottom:12px">Accès, rectification, suppression et export de vos données disponibles dans les paramètres Sutur. Contact : <strong style="color:#c8aaff">contact@orbixlabs.tech</strong></p>
        <div style="font-size:11px;color:#c9a227;letter-spacing:2px;margin-bottom:8px">⚠️ 4. LIMITATIONS</div>
        <p style="margin-bottom:12px">Les réponses de Sutur ne constituent pas des conseils médicaux, juridiques ou financiers professionnels. OrbixLabs décline toute responsabilité pour les décisions prises sur la base des réponses de Sutur.</p>
        <div style="background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.2);border-radius:10px;padding:12px;margin-top:8px;font-size:12px;color:rgba(180,170,220,.7)">
          En cliquant "J'accepte", vous confirmez avoir lu et accepté ce contrat. Cette acceptation est enregistrée avec date et heure.
        </div>
      </div>
      <div style="padding:14px 20px;border-top:1px solid rgba(139,92,246,.15);flex-shrink:0;display:flex;gap:10px">
        <button onclick="rejectTerms()" style="flex:1;padding:11px;border-radius:10px;border:1px solid rgba(248,113,113,.25);background:rgba(248,113,113,.08);color:rgba(248,113,113,.7);font-size:13px;cursor:pointer;font-family:system-ui">Refuser et quitter</button>
        <button onclick="acceptTerms()" style="flex:2;padding:11px;border-radius:10px;border:1px solid rgba(139,92,246,.4);background:rgba(139,92,246,.2);color:#c8aaff;font-size:13px;font-weight:600;cursor:pointer;font-family:system-ui;letter-spacing:1px">✅ J'ACCEPTE</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function acceptTerms(){
  try{
    await apiCall('/terms/accept','POST',{});
    const modal=document.getElementById('terms-modal');
    if(modal)modal.remove();
    loadProfile().then(userName=>{
      greetUser(userName);
      setTimeout(loadSportNotifications,2000);
      setTimeout(deliverPendingNotifications,3000);
    });
  }catch(e){alert('Erreur lors de l\'enregistrement. Réessaie.')}
}

function rejectTerms(){
  const modal=document.getElementById('terms-modal');
  if(modal)modal.remove();
  logout();
}

async function greetUser(userName){
  // Appliquer correctement le thème sauvegardé
  const savedTheme=localStorage.getItem('s_theme')||'default';
  setTheme(savedTheme, true); // init=true pour ne pas vider le chat
  // Sync CMD prefix
  const cmdPfx=document.getElementById('cmd-prefix');
  const inp=document.getElementById('cinp');
  if(cmdPfx)cmdPfx.style.display=savedTheme==='terminal'?'flex':'none';
  if(inp)inp.placeholder=savedTheme==='terminal'?'entrer commande...':'Parle a Sutur...';

  if(!userName || userName === 'Utilisateur'){
    setTimeout(()=>{
      if(isTerminal()){
        addMsg('ai','[SUTUR_OS] — Nouvel utilisateur détecté. Initialisation du profil. Quel est ton nom ?',true);
      } else {
        addMsg('ai','Bonjour ! Je suis Sutur, ton assistant personnel. Je ne te connais pas encore — comment tu t\'appelles ?',true);
      }
      onboarding=true;onboardingStep='name';
    },400);
  } else {
    const hour=new Date().getHours();
    const salut=hour<12?'Bonjour':hour<18?'Bon après-midi':'Bonsoir';
    setTimeout(()=>{
      if(isTerminal()){
        addMsg('ai',`[SUTUR_OS] — Authentification réussie. Bienvenue ${userName}. Systèmes en ligne. En attente de commande.`,true);
      } else {
        addMsg('ai',`${salut} ${userName}. Sutur est opérationnel. Que puis-je faire pour toi ?`,true);
      }
    },400);
  }
}

function logout(){stopVoiceLoop();document.getElementById('main').style.display='none';document.getElementById('lock').style.display='flex';gActive=false;history=[];document.getElementById('chatbox').innerHTML='';document.getElementById('pass-inp').value=''}
