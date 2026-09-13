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
window.onerror = function(msg, src, line, col, err){
  if(TOKEN && API_URL){
    apiCall('/bugs/report','POST',{
      error: `${msg} (${src}:${line}:${col})`,
      context: err ? err.stack : 'no stack',
      path: 'frontend:js_error'
    }).catch(()=>{});
  }
  return false;
};
window.onunhandledrejection = function(evt){
  if(TOKEN && API_URL){
    apiCall('/bugs/report','POST',{
      error: String(evt.reason || 'Unhandled rejection'),
      context: evt.reason?.stack || '',
      path: 'frontend:promise_rejection'
    }).catch(()=>{});
  }
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
