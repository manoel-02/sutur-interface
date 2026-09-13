// ── NAVIGATION & UTILITAIRES GÉNÉRAUX ───────────────────────────────────

function selectGender(g){
  userGender=g;
  localStorage.setItem('s_gender',g);
  apiCall('/profile','PUT',{gender:g}).catch(()=>{});
  const gb=document.getElementById('gender-btns');if(gb)gb.remove();
  addMsg('user',g==='m'?'👨 Homme':'👩 Femme',false);
  onboardingStep='profession';
  setTimeout(()=>addMsg('ai','Parfait ! Pour mieux te connaitre, quelle est ta profession ou ton activite principale ?',true),400);
}

function getLocation(){
  if(navigator.geolocation&&document.getElementById('t-geo').classList.contains('on')){
    navigator.geolocation.getCurrentPosition(pos=>{
      userLocation={lat:pos.coords.latitude,lng:pos.coords.longitude};
      // Envoyée tout de suite, sans attendre le prochain message de chat — sinon,
      // en voyage, un simple coup d'oeil à l'app sans écrire de message ne mettrait
      // jamais à jour la position, et le brief du matin refléterait encore l'ancien lieu.
      apiCall('/location/update','POST',{lat:userLocation.lat,lng:userLocation.lng}).catch(()=>{});
    },()=>{});
  }
}

// Rafraîchit la position à chaque fois que l'app revient au premier plan (l'utilisateur
// rouvre l'app après l'avoir mise en arrière-plan) — c'est le moment naturel où on
// détecterait un changement de lieu après un trajet, pas seulement à la connexion initiale.
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible') getLocation();
});
// Filet de sécurité supplémentaire si l'app reste ouverte longtemps sans jamais
// passer en arrière-plan (ex: laissée ouverte sur un bureau) — un rafraîchissement
// toutes les 30 minutes reste largement suffisant pour ce cas, sans solliciter le
// GPS de façon excessive.
setInterval(getLocation, 30*60*1000);

async function silentHealthCheck(){
  if(!TOKEN||!API_URL) return;
  try{
    const r = await fetch(API_URL+'/health', {headers:{'Authorization':'Bearer '+TOKEN}});
    if(!r.ok){
      // Backend down — alerter
      setTimeout(()=>{
        addMsg('ai', '⚠️ Le serveur Sutur semble avoir un problème. Lance un diagnostic depuis CONFIG → SYSTÈME.', false);
      }, 5000);
    }
  }catch(e){
    setTimeout(()=>{
      addMsg('ai', '⚠️ Impossible de joindre le serveur Sutur. Vérifie ta connexion ou les logs Railway.', false);
    }, 5000);
  }
}

function navTo(zone){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('nav-'+zone).classList.add('active');
  if(zone==='home'){
    closePage();
    // Revenir au chat
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    const chatPanel=document.getElementById('tab-chat');
    if(chatPanel)chatPanel.classList.add('active');
    const inpBar=document.getElementById('inp-bar');
    if(inpBar)inpBar.style.display='flex';
    const globeArea=document.getElementById('globe-area');
    if(globeArea)globeArea.style.display='flex';
    return;
  }
  const page=document.getElementById('page-'+zone);
  if(page){
    if(currentPage&&currentPage!==page){currentPage.classList.remove('open')}
    page.classList.add('open');
    currentPage=page;
  }
}

function closePage(){
  if(currentPage){currentPage.classList.remove('open');currentPage=null}
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('nav-home').classList.add('active');
  // Masquer inp-bar sauf si on est sur chat
  const activePanel=document.querySelector('.panel.active');
  const inpBar=document.getElementById('inp-bar');
  if(inpBar)inpBar.style.display=activePanel&&activePanel.id==='tab-chat'?'flex':'none';
}

function sw(name,el){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  const panel=document.getElementById('tab-'+name);
  if(panel)panel.classList.add('active');
  const inpBar=document.getElementById('inp-bar');
  if(inpBar)inpBar.style.display=name==='chat'?'flex':'none';
  if(name==='mem')loadMemories();
  if(name==='agents')loadAgents();
  if(name==='msgs'){loadMessages();if(userIsOwner)setTimeout(loadAdminDashboard,300);}
  if(name==='profil')loadProfile();
  if(name==='media')loadTrends(currentTrendCategory||'general');
  // Montrer/cacher le globe
  const globeArea=document.getElementById('globe-area');
  if(globeArea)globeArea.style.display=name==='chat'?'flex':'none';
  // Montrer/cacher la carte persistante — uniquement sur l'onglet chat, jamais ailleurs
  const mapWrap=document.getElementById('persistent-map-wrap');
  if(mapWrap){
    const showMap=(name==='chat'&&mapIsActive);
    mapWrap.style.display=showMap?'block':'none';
    if(showMap&&persistentMapInstance)setTimeout(()=>persistentMapInstance.invalidateSize(),50);
  }
}

function openApp(app){const urls={youtube:'https://youtube.com',spotify:'https://open.spotify.com',instagram:'https://instagram.com',tiktok:'https://tiktok.com',x:'https://x.com',news:'https://news.google.com'};window.open(urls[app],'_blank')}

function setAF(el,app){document.querySelectorAll('.af').forEach(a=>a.classList.remove('active'));el.classList.add('active');selApp=app}

function smartSearch(){const q=document.getElementById('search-inp').value.trim();if(!q)return;const urls={youtube:'https://www.youtube.com/results?search_query=',spotify:'https://open.spotify.com/search/',tiktok:'https://www.tiktok.com/search?q=',x:'https://x.com/search?q=',instagram:'https://www.instagram.com/explore/tags/'};speakText(`Je recherche ${q} sur ${selApp}.`);window.open(urls[selApp]+encodeURIComponent(q),'_blank')}

function qa(msg){sw('chat',document.querySelectorAll('.tab')[0]);document.getElementById('cinp').value=msg;sendMsg()}
