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

function handlePhotoSelect(input){
  const file = input.files[0];
  if(!file) return;
  currentPhotoType = file.type || 'image/jpeg';
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    // Stocker le data URL complet pour l'affichage
    currentPhotoB64 = dataUrl;
    // Afficher dans le modal
    const img = document.getElementById('photo-modal-img');
    const btn = document.getElementById('photo-validate-btn');
    if(img){ img.src=dataUrl; img.style.display='block'; }
    if(btn){ btn.style.opacity='1'; btn.style.pointerEvents='auto'; }
    // Ouvrir le modal si pas déjà ouvert
    const modal = document.getElementById('photo-modal');
    if(modal) modal.style.display='flex';
    // Miniature dans la barre
    const thumb=document.getElementById('photo-thumb');
    const preview=document.getElementById('photo-preview-bar');
    if(thumb) thumb.src=dataUrl;
    if(preview) preview.style.display='flex';
  };
  reader.readAsDataURL(file);
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
  if(file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')){
    alert('Seuls les fichiers PDF sont acceptés.');
    input.value='';
    return;
  }
  currentDocumentType = file.type || 'application/pdf';
  currentDocumentName = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    currentDocumentB64 = e.target.result; // data URL complet, nettoyé au moment de l'envoi
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
  currentDocumentName = '';
  const bar = document.getElementById('pdf-preview-bar');
  if(bar) bar.style.display='none';
  const input = document.getElementById('pdf-input');
  if(input) input.value='';
}
