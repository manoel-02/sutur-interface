// ── COFFRE SÉCURISÉ — documents et identifiants chiffrés ──────────────────
// Le mot de passe n'est JAMAIS envoyé au backend en dehors d'une requête de
// déverrouillage précise, et n'est jamais stocké ailleurs qu'en mémoire JS le
// temps de la session (jamais dans localStorage) — fermé si on quitte la page
// ou recharge l'app.
let vaultPassword = null;

function vaultUnlock(){
  const pwd = document.getElementById('vault-password-input').value;
  if(!pwd){
    const err = document.getElementById('vault-unlock-error');
    err.textContent = 'Entre un mot de passe.';
    err.style.display = 'block';
    return;
  }
  vaultPassword = pwd;
  document.getElementById('vault-password-input').value = '';
  document.getElementById('vault-locked-view').style.display = 'none';
  document.getElementById('vault-unlocked-view').style.display = 'block';
  document.getElementById('vault-lock-btn').style.display = 'inline-block';
  loadVaultList();
}

function vaultLock(){
  vaultPassword = null;
  document.getElementById('vault-locked-view').style.display = 'block';
  document.getElementById('vault-unlocked-view').style.display = 'none';
  document.getElementById('vault-lock-btn').style.display = 'none';
  document.getElementById('vault-add-document').style.display = 'none';
  document.getElementById('vault-add-credential').style.display = 'none';
  const err = document.getElementById('vault-unlock-error');
  if(err) err.style.display = 'none';
}

function vaultShowAddDocument(){
  document.getElementById('vault-add-document').style.display = 'block';
  document.getElementById('vault-add-credential').style.display = 'none';
}

function vaultShowAddCredential(){
  document.getElementById('vault-add-credential').style.display = 'block';
  document.getElementById('vault-add-document').style.display = 'none';
}

async function loadVaultList(){
  const list = document.getElementById('vault-list');
  list.innerHTML = '<div style="color:rgba(120,80,255,.35);text-align:center;padding:10px;font-size:12px">Chargement...</div>';
  try{
    const data = await apiCall('/vault');
    if(!data.items || data.items.length===0){
      list.innerHTML = '<div style="color:rgba(120,80,255,.35);text-align:center;padding:16px;font-size:12px">Coffre vide pour l\'instant.</div>';
      return;
    }
    list.innerHTML = data.items.map(item => {
      const icon = item.item_type==='document' ? '📄' : '🔑';
      const date = new Date(item.created_at).toLocaleDateString('fr');
      return `<div class="mem-item" id="vault-item-${item.id}">
        <div style="flex:1">
          <div class="mem-cat">${icon} ${item.item_type==='document'?'Document':'Identifiant'}</div>
          <div class="mem-key">${item.label}</div>
          <div class="mem-val" style="color:rgba(160,151,196,.4)">Ajouté le ${date}</div>
        </div>
        <button class="go-btn" style="font-size:10px" onclick="vaultViewItem('${item.id}')">👁 Voir</button>
        <button class="mem-del" onclick="vaultDeleteItem('${item.id}')">&#10005;</button>
      </div>`;
    }).join('');
  }catch(e){
    list.innerHTML = '<div style="color:#f87171;text-align:center;padding:10px;font-size:12px">Erreur de chargement</div>';
  }
}

async function vaultViewItem(id){
  if(!vaultPassword){ vaultLock(); return; }
  try{
    const data = await apiCall('/vault/'+id+'/unlock', 'POST', {password: vaultPassword});
    const c = data.content;
    let detail = '';
    if(data.item_type==='document'){
      detail = `Fichier : ${c.filename}\n${c.notes ? 'Notes : '+c.notes : ''}`;
      // Ouvre le fichier déchiffré dans un nouvel onglet pour le consulter/télécharger
      const byteChars = atob(c.base64_content);
      const byteNumbers = new Array(byteChars.length);
      for(let i=0;i<byteChars.length;i++) byteNumbers[i]=byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], {type:c.mime_type});
      window.open(URL.createObjectURL(blob), '_blank');
    }else{
      detail = `Service : ${c.service_name}\nIdentifiant : ${c.username}\nMot de passe : ${c.password_value}${c.url?'\nSite : '+c.url:''}${c.notes?'\nNotes : '+c.notes:''}`;
    }
    alert(`🔓 ${data.label}\n\n${detail}`);
  }catch(e){
    if(e.message && e.message.includes('403')){
      alert('Mot de passe incorrect — reverrouille et réessaie.');
      vaultLock();
    }else{
      alert('Erreur lors du déverrouillage de cet élément.');
    }
  }
}

async function vaultDeleteItem(id){
  if(!confirm('Supprimer définitivement cet élément du coffre ?'))return;
  try{
    await apiCall('/vault/'+id, 'DELETE');
    loadVaultList();
  }catch(e){}
}

function vaultReadFileAsBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function vaultAddDocument(){
  const label = document.getElementById('vault-doc-label').value.trim();
  const fileInput = document.getElementById('vault-doc-file');
  const notes = document.getElementById('vault-doc-notes').value.trim();
  if(!label || !fileInput.files[0]){ alert('Donne un libellé et choisis un fichier.'); return; }
  if(!vaultPassword){ vaultLock(); return; }
  const file = fileInput.files[0];
  if(file.size > 9_000_000){ alert('Fichier trop volumineux (max ~9 Mo).'); return; }
  try{
    const base64Content = await vaultReadFileAsBase64(file);
    await apiCall('/vault/document', 'POST', {
      label, filename: file.name, mime_type: file.type || 'application/octet-stream',
      base64_content: base64Content, notes, password: vaultPassword
    });
    document.getElementById('vault-doc-label').value = '';
    document.getElementById('vault-doc-file').value = '';
    document.getElementById('vault-doc-notes').value = '';
    document.getElementById('vault-add-document').style.display = 'none';
    loadVaultList();
  }catch(e){
    alert('Erreur lors de l\'enregistrement du document.');
  }
}

async function vaultAddCredential(){
  const label = document.getElementById('vault-cred-label').value.trim();
  const username = document.getElementById('vault-cred-username').value.trim();
  const passwordValue = document.getElementById('vault-cred-password').value;
  const url = document.getElementById('vault-cred-url').value.trim();
  if(!label || !username || !passwordValue){ alert('Remplis au moins le libellé, l\'identifiant et le mot de passe.'); return; }
  if(!vaultPassword){ vaultLock(); return; }
  try{
    await apiCall('/vault/credential', 'POST', {
      label, service_name: label, username, password_value: passwordValue, url, password: vaultPassword
    });
    document.getElementById('vault-cred-label').value = '';
    document.getElementById('vault-cred-username').value = '';
    document.getElementById('vault-cred-password').value = '';
    document.getElementById('vault-cred-url').value = '';
    document.getElementById('vault-add-credential').style.display = 'none';
    loadVaultList();
  }catch(e){
    alert('Erreur lors de l\'enregistrement de l\'identifiant.');
  }
}
