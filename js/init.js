// ── AMORÇAGE ─────────────────────────────────────────────────────────────
// Chargé en DERNIER : ces appels dépendent de fonctions définies dans tous
// les modules précédents (globe, auth, rappels...).

rsz();
window.addEventListener('resize',rsz);
initGlobe3D();
resizeGlobe();
window.addEventListener('resize',resizeGlobe);
requestAnimationFrame(loop);
loadCfg();
// Remontée des erreurs au backend de l'utilisateur, sous garde-fous : une erreur répétée
// dans une boucle d'animation produisait une soixantaine de POST par seconde, et un
// /bugs/report en échec se nourrissait de ses propres erreurs.
const BUG_MAX_PER_LOAD = 12;
const bugSeen = new Set();
function reportBug(key, payload){
  if(!TOKEN || !API_URL) return;
  if(/\/bugs\/report/.test(key)) return; // l'appel de remontée lui-même : jamais remonté
  if(bugSeen.has(key) || bugSeen.size >= BUG_MAX_PER_LOAD) return;
  bugSeen.add(key);
  apiCall('/bugs/report','POST',payload).catch(()=>{});
}
// ── Clavier virtuel ────────────────────────────────────────────────────────
// html/body sont en position:fixed, donc la fenêtre de mise en page ne rétrécit pas
// quand le clavier s'ouvre : la barre de saisie et le bouton Envoyer se retrouvaient
// dessous, et l'utilisateur tapait à l'aveugle. On mesure l'écart avec la fenêtre
// visuelle et on remonte le bas de l'écran d'autant.
(function(){
  const vv = window.visualViewport;
  if(!vv) return;                       // navigateur ancien : rien ne change
  let raf = 0;
  const apply = () => {
    raf = 0;
    // Ce que le clavier (ou une barre d'URL rétractable) recouvre réellement.
    const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    // Sous ~80 px c'est la barre d'URL du navigateur, pas un clavier : l'ignorer
    // évite de faire sautiller l'interface au moindre défilement.
    document.documentElement.style.setProperty('--kb', (hidden > 80 ? Math.round(hidden) : 0) + 'px');
  };
  const schedule = () => { if(!raf) raf = requestAnimationFrame(apply); };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  apply();
})();

// La hauteur de la barre de saisie n'est pas une constante : elle grandit quand le
// champ passe à plusieurs lignes, ou quand une photo et un document y sont joints et
// qu'elle passe à la ligne. Une valeur devinée laissait à nouveau le dernier message
// coincé dessous, alors on mesure.
(function(){
  const bar = document.getElementById('inp-bar');
  if(!bar || typeof ResizeObserver === 'undefined') return;
  const sync = () => {
    // getBoundingClientRect suffit : une barre masquée mesure déjà 0. (offsetParent
    // vaut toujours null pour un élément en position fixe, il ne dit rien ici.)
    const h = Math.round(bar.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--inp-h', h + 'px');
  };
  new ResizeObserver(sync).observe(bar);
  sync();
})();

window.onerror = function(msg, src, line, col, err){
  reportBug(`${msg}|${src}|${line}`, {
    error: `${msg} (${src}:${line}:${col})`,
    context: err ? err.stack : 'no stack',
    path: 'frontend:js_error'
  });
  return false;
};
window.onunhandledrejection = function(evt){
  const reason = String(evt.reason || 'Unhandled rejection');
  reportBug('rejection|'+reason, {
    error: reason,
    context: evt.reason?.stack || '',
    path: 'frontend:promise_rejection'
  });
};
(function(){
  const t=localStorage.getItem('s_theme')||'default';
  if(t==='terminal') document.body.classList.add('theme-terminal');
})();
setInterval(checkDueReminders,30000);

// Enregistrement du service worker (PWA)
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  });
}
