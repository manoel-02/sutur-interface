// ── PHOTOS & PERMISSIONS ────────────────────────────────────────────────

function openPhotoModal(){
  const modal = document.getElementById('photo-modal');
  if(!modal){ console.error('photo-modal introuvable'); return; }
  // S'assurer que le modal s'affiche correctement
  modal.style.cssText = 'display:flex;position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.88);align-items:center;justify-content:center;padding:16px;flex-direction:column;gap:0';
  const img = document.getElementById('photo-modal-img');
  const btn = document.getElementById('photo-validate-btn');
  const q = document.getElementById('photo-question');
  if(q) q.value='';
  if(currentPhotoB64 && img){
    img.src = currentPhotoB64;
    img.style.display = 'block';
    if(btn){ btn.style.opacity='1'; btn.style.pointerEvents='auto'; }
  } else {
    if(img) img.style.display='none';
    if(btn){ btn.style.opacity='0.4'; btn.style.pointerEvents='none'; }
  }
}

function closePhotoModal(){
  const modal = document.getElementById('photo-modal');
  if(modal) modal.style.display='none';
}

// Un téléphone produit des JPEG de 3 à 6 Mo ; en base64 dans un corps JSON cela faisait
// 4 à 8 Mo et l'envoi dépassait régulièrement son délai. On réduit et ré-encode avant
// l'envoi. L'original n'est jamais converti en base64 : il est lu via une URL d'objet,
// libérée dès le dessin terminé, et seules deux images réduites restent en mémoire.
const PHOTO_MAX_EDGE = 1600;
const PHOTO_QUALITY = 0.82;
const PHOTO_THUMB_EDGE = 160;

function _photoResize(img, maxEdge, quality){
  const ratio = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * ratio));
  c.height = Math.max(1, Math.round(img.naturalHeight * ratio));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

function handlePhotoSelect(input){
  const file = input.files[0];
  if(!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const full = _photoResize(img, PHOTO_MAX_EDGE, PHOTO_QUALITY);
    const thumb = _photoResize(img, PHOTO_THUMB_EDGE, 0.7);
    URL.revokeObjectURL(url);
    currentPhotoType = 'image/jpeg'; // le ré-encodage impose le type réellement envoyé
    currentPhotoB64 = full;
    if(typeof syncSendButton==='function')syncSendButton();
    // Afficher dans le modal
    const modalImg = document.getElementById('photo-modal-img');
    const btn = document.getElementById('photo-validate-btn');
    if(modalImg){ modalImg.src=full; modalImg.style.display='block'; }
    if(btn){ btn.style.opacity='1'; btn.style.pointerEvents='auto'; }
    // Ouvrir le modal si pas déjà ouvert
    const modal = document.getElementById('photo-modal');
    if(modal) modal.style.display='flex';
    // Miniature dans la barre
    const thumbEl=document.getElementById('photo-thumb');
    const preview=document.getElementById('photo-preview-bar');
    if(thumbEl) thumbEl.src=thumb;
    if(preview) preview.style.display='flex';
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('Image illisible — réessaie avec un autre fichier.');
  };
  img.src = url;
  input.value='';
}

async function validateAndSendPhoto(){
  const q = document.getElementById('photo-question');
  const question = q ? q.value.trim() : '';
  closePhotoModal();
  // Mettre la question dans l'input
  const inp = document.getElementById('cinp');
  if(inp) inp.value = question || 'Analyse cette image et dis-moi ce que tu vois.';
  // Envoyer
  await sendMsg();
}

function sendPhotoNow(){
  // Envoi rapide depuis la barre sans modal
  const inp = document.getElementById('cinp');
  if(!inp.value) inp.value = 'Analyse cette image et dis-moi ce que tu vois.';
  sendMsg();
}

function clearPhoto(){
  currentPhotoB64 = null;
  if(typeof syncSendButton==='function')syncSendButton();
  currentPhotoType = 'image/jpeg';
  const preview = document.getElementById('photo-preview-bar');
  const thumb = document.getElementById('photo-thumb');
  const inp = document.getElementById('cinp');
  if(preview) preview.style.display='none';
  if(thumb) thumb.src='';
  if(inp) inp.placeholder = isTerminal() ? 'entrer commande...' : 'Parle a Sutur...';
}

async function checkAndRequestPermissions(){
  if(permsRequested || localStorage.getItem('s_perms_done')) return;
  permsRequested = true;
  // Vérifier quelles permissions sont nécessaires
  const perms = [];
  // Micro
  try{
    const mic = await navigator.permissions.query({name:'microphone'});
    if(mic.state !== 'granted') perms.push({icon:'🎙️', name:'Microphone', desc:'Pour parler à Sutur à la voix', key:'microphone'});
  }catch(e){ perms.push({icon:'🎙️', name:'Microphone', desc:'Pour parler à Sutur à la voix', key:'microphone'}); }
  // Localisation
  try{
    const loc = await navigator.permissions.query({name:'geolocation'});
    if(loc.state !== 'granted') perms.push({icon:'📍', name:'Localisation', desc:'Pour les réponses adaptées à ta position', key:'geolocation'});
  }catch(e){ perms.push({icon:'📍', name:'Localisation', desc:'Pour les réponses adaptées à ta position', key:'geolocation'}); }
  // Caméra
  try{
    const cam = await navigator.permissions.query({name:'camera'});
    if(cam.state !== 'granted') perms.push({icon:'📷', name:'Caméra', desc:'Pour analyser des photos en temps réel', key:'camera'});
  }catch(e){ perms.push({icon:'📷', name:'Caméra', desc:'Pour analyser des photos en temps réel', key:'camera'}); }

  if(perms.length === 0){ localStorage.setItem('s_perms_done','1'); return; }

  // Afficher le modal
  const list = document.getElementById('perm-list');
  if(list) list.innerHTML = perms.map(p=>`
    <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px">
      <span style="font-size:22px">${p.icon}</span>
      <div>
        <div style="font-size:13px;color:#e8e4f8;font-weight:500">${p.name}</div>
        <div style="font-size:11px;color:rgba(160,151,196,.5);margin-top:2px">${p.desc}</div>
      </div>
      <div id="perm-status-${p.key}" style="margin-left:auto;font-size:11px;color:rgba(201,162,39,.6)">En attente</div>
    </div>`).join('');

  document.getElementById('perm-modal').style.display='flex';
  window._permsToRequest = perms;
}

async function requestAllPermissions(){
  const perms = window._permsToRequest || [];
  for(const perm of perms){
    const statusEl = document.getElementById(`perm-status-${perm.key}`);
    try{
      if(perm.key === 'microphone' || perm.key === 'camera'){
        const constraints = perm.key === 'microphone'
          ? {audio:true}
          : {video:true};
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach(t=>t.stop());
        if(statusEl){ statusEl.textContent='✅'; statusEl.style.color='#4ade80'; }
      } else if(perm.key === 'geolocation'){
        await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(
          pos=>{ getLocation(); res(pos); },
          err=>rej(err),
          {timeout:8000}
        ));
        if(statusEl){ statusEl.textContent='✅'; statusEl.style.color='#4ade80'; }
      }
    }catch(e){
      if(statusEl){ statusEl.textContent='Refusé'; statusEl.style.color='#f87171'; }
    }
  }
  localStorage.setItem('s_perms_done','1');
  setTimeout(closePermModal, 1200);
}

function closePermModal(){
  document.getElementById('perm-modal').style.display='none';
  localStorage.setItem('s_perms_done','1');
}

// ── DOCUMENT PDF — instructions et/ou code à suivre, généré dans credical ──
function handlePdfSelect(input){
  const file = input.files[0];
  if(!file) return;
  const name = file.name.toLowerCase();
  const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
  const isData = name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')
    || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel'
    || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if(!isPdf && !isData){
    alert('Seuls les fichiers PDF, CSV et Excel sont acceptés.');
    input.value='';
    return;
  }
  currentDocumentType = file.type || 'application/pdf';
  currentDocumentName = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    currentDocumentB64 = e.target.result; // data URL complet, nettoyé au moment de l'envoi
    if(typeof syncSendButton==='function')syncSendButton(); // un document seul suffit pour envoyer
    const bar = document.getElementById('pdf-preview-bar');
    const nameEl = document.getElementById('pdf-filename');
    if(nameEl) nameEl.textContent = file.name;
    if(bar) bar.style.display='flex';
  };
  reader.onerror = () => {
    alert('Impossible de lire ce fichier — réessaie.');
    clearPdf();
  };
  reader.readAsDataURL(file);
}

function clearPdf(){
  currentDocumentB64 = null;
  if(typeof syncSendButton==='function')syncSendButton();
  currentDocumentName = '';
  const bar = document.getElementById('pdf-preview-bar');
  if(bar) bar.style.display='none';
  const input = document.getElementById('pdf-input');
  if(input) input.value='';
}
