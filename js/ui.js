// ── SERVICES D'INTERFACE ──────────────────────────────────────────────────
// Notifications non bloquantes (à la place de alert/confirm/prompt qui gèlent
// toute la page), bandeau de connexion, annonces pour les lecteurs d'écran.

function _uiRoot(id,build){
  let el=document.getElementById(id);
  if(!el){el=build();document.body.appendChild(el);}
  return el;
}

function _toastRoot(){
  return _uiRoot('toast-root',()=>{
    const d=document.createElement('div');
    d.id='toast-root';
    d.setAttribute('aria-live','polite');
    d.setAttribute('aria-atomic','false');
    return d;
  });
}

// showToast('Message', {type:'info|success|error', duration:4000, action:{label,onClick}})
function showToast(message,opts={}){
  const {type='info',duration=4000,action=null}=opts;
  const root=_toastRoot();
  const el=document.createElement('div');
  el.className='toast toast-'+type;
  el.setAttribute('role',type==='error'?'alert':'status');
  const txt=document.createElement('span');
  txt.className='toast-text';
  txt.textContent=message;
  el.appendChild(txt);
  let timer=null;
  const close=()=>{
    if(timer){clearTimeout(timer);timer=null;}
    if(!el.parentNode)return;
    el.classList.add('toast-out');
    setTimeout(()=>{if(el.parentNode)el.remove();},180);
  };
  if(action){
    const b=document.createElement('button');
    b.type='button';
    b.className='toast-action';
    b.textContent=action.label;
    b.onclick=()=>{close();try{action.onClick();}catch(e){console.error(e);}};
    el.appendChild(b);
  }
  root.appendChild(el);
  while(root.children.length>3)root.firstChild.remove(); // jamais plus de 3 à l'écran
  if(duration>0)timer=setTimeout(close,duration);
  return {el,close};
}

// Annonce silencieuse pour les lecteurs d'écran (sans rien afficher).
function announce(message){
  const el=_uiRoot('sr-live',()=>{
    const d=document.createElement('div');
    d.id='sr-live';d.className='sr-only';
    d.setAttribute('aria-live','polite');d.setAttribute('role','status');
    return d;
  });
  el.textContent='';
  setTimeout(()=>{el.textContent=message;},30);
}

// Bandeau de connexion
function _netBanner(){
  return _uiRoot('net-banner',()=>{
    const d=document.createElement('div');
    d.id='net-banner';
    d.setAttribute('role','status');
    d.hidden=true;
    return d;
  });
}
function setNetworkBanner(text){
  const b=_netBanner();
  if(text){b.textContent=text;b.hidden=false;}
  else{b.hidden=true;}
}

// Réveil des attentes réseau en cours (retour de l'onglet au premier plan,
// connexion rétablie) : évite d'attendre le prochain cycle d'un minuteur ralenti.
function wakeNetworkWaiters(){document.dispatchEvent(new Event('sutur:wake'));}

window.addEventListener('offline',()=>{
  setNetworkBanner('Connexion perdue — Sutur se reconnecte automatiquement dès que le réseau revient.');
});
window.addEventListener('online',()=>{
  setNetworkBanner('');
  showToast('Connexion rétablie.',{type:'success',duration:2500});
  wakeNetworkWaiters();
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')wakeNetworkWaiters();
});
if(typeof navigator!=='undefined'&&navigator.onLine===false){
  document.addEventListener('DOMContentLoaded',()=>setNetworkBanner('Connexion perdue — Sutur se reconnecte automatiquement dès que le réseau revient.'));
}
