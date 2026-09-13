// ── CONTACTS, TRADUCTION & WHATSAPP ─────────────────────────────────────

async function loadContacts(){
  try{
    const data=await apiCall('/contacts');
    allContacts=data.contacts||[];
    renderContacts(allContacts);
    renderFollowups(allContacts.filter(c=>c.needs_followup));
    checkWhatsAppStatus();
  }catch(e){}
}

function filterContacts(){
  const q=document.getElementById('ct-search').value.toLowerCase();
  renderContacts(allContacts.filter(c=>
    c.name.toLowerCase().includes(q)||
    (c.context||'').toLowerCase().includes(q)||
    (c.notes||'').toLowerCase().includes(q)
  ));
}

function renderFollowups(followups){
  const div=document.getElementById('contacts-followup');
  if(!followups.length){div.innerHTML='';return}
  div.innerHTML=`<div style="background:rgba(201,162,39,.08);border:1px solid rgba(201,162,39,.2);border-radius:12px;padding:12px;margin-bottom:10px">
    <div style="font-size:10px;color:var(--gold);letter-spacing:2px;margin-bottom:8px">⚠ RELANCES EN ATTENTE</div>
    ${followups.map(c=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)">
      <div>
        <span style="font-size:13px;color:var(--text-primary);font-weight:500">${c.name}</span>
        <span style="font-size:11px;color:var(--text-muted);margin-left:8px">${c.days_since}j sans contact</span>
      </div>
      <button onclick="logInteraction('${c.id}','${c.name}')" style="background:rgba(201,162,39,.1);border:1px solid rgba(201,162,39,.3);border-radius:6px;color:var(--gold);font-size:10px;padding:4px 8px;cursor:pointer">✓ Contacté</button>
    </div>`).join('')}
  </div>`;
}

function renderContacts(contacts){
  const div=document.getElementById('contacts-list');
  if(!contacts.length){
    div.innerHTML='<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:12px">Aucun contact</div>';
    return;
  }
  div.innerHTML=contacts.map(c=>`
    <div style="background:var(--surface);border:1px solid ${c.needs_followup?'rgba(201,162,39,.3)':'var(--border)'};border-radius:12px;padding:12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1">
          <div style="font-size:15px;color:var(--text-primary);font-weight:600">${c.name} ${c.needs_followup?'<span style="font-size:10px;color:var(--gold)">· relance</span>':''}</div>
          ${c.context?`<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${c.context}</div>`:''}
          ${c.notes?`<div style="font-size:12px;color:var(--text-secondary);margin-top:3px;font-style:italic">${c.notes}</div>`:''}
          <div style="display:flex;gap:10px;margin-top:6px;flex-wrap:wrap">
            ${c.phone?`<a href="tel:${c.phone}" style="font-size:11px;color:var(--violet);text-decoration:none">📞 ${c.phone}</a>`:''}
            ${c.email?`<a href="mailto:${c.email}" style="font-size:11px;color:var(--violet);text-decoration:none">✉ ${c.email}</a>`:''}
            ${c.last_contact?`<span style="font-size:11px;color:var(--text-muted)">Dernier contact: ${c.last_contact}</span>`:''}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;margin-left:8px">
          ${c.phone?`<button onclick="prefillWA('${c.phone}','${c.name}')" style="background:rgba(37,211,102,.1);border:1px solid rgba(37,211,102,.25);border-radius:6px;color:#25d166;font-size:11px;padding:4px 8px;cursor:pointer">WA</button>`:''}
          <button onclick="logInteraction('${c.id}','${c.name}')" style="background:rgba(139,92,246,.1);border:1px solid var(--border);border-radius:6px;color:var(--text-muted);font-size:11px;padding:4px 8px;cursor:pointer">✓</button>
          <button onclick="deleteContact('${c.id}')" style="background:none;border:none;color:rgba(248,113,113,.4);cursor:pointer;font-size:14px">✕</button>
        </div>
      </div>
    </div>`).join('');
}

async function addContact(){
  const name=document.getElementById('ct-name').value.trim();
  const msg=document.getElementById('ct-msg');
  if(!name){msg.style.color='#f87171';msg.textContent='Le nom est requis';return}
  try{
    await apiCall('/contacts','POST',{
      name,
      phone:document.getElementById('ct-phone').value.trim(),
      email:document.getElementById('ct-email').value.trim(),
      context:document.getElementById('ct-context').value.trim(),
      notes:document.getElementById('ct-notes').value.trim(),
      follow_up_days:parseInt(document.getElementById('ct-followup').value)||30,
    });
    msg.style.color='#4ade80';msg.textContent='✅ Contact ajouté !';
    ['ct-name','ct-phone','ct-email','ct-context','ct-notes'].forEach(id=>document.getElementById(id).value='');
    setTimeout(()=>{msg.textContent='';loadContacts()},1200);
  }catch(e){msg.style.color='#f87171';msg.textContent='Erreur'}
}

async function deleteContact(id){
  try{await apiCall(`/contacts/${id}`,'DELETE');loadContacts()}catch(e){}
}

async function logInteraction(id,name){
  try{
    await apiCall(`/contacts/${id}/interaction`,'POST');
    addMsg('ai',`✅ Interaction avec **${name}** enregistrée. Le compteur de relance est remis à zéro.`,false);
    loadContacts();
  }catch(e){}
}

function prefillWA(phone,name){
  document.getElementById('wa-to').value=phone;
  document.getElementById('wa-msg').value=`Bonjour ${name}, `;
  document.getElementById('wa-to').scrollIntoView({behavior:'smooth'});
}

async function doTranslate(){
  const text=document.getElementById('tl-text').value.trim();
  const lang=document.getElementById('tl-lang').value;
  const style=document.getElementById('tl-style').value;
  if(!text){return}
  const result=document.getElementById('tl-result');
  const output=document.getElementById('tl-output');
  output.textContent='Traduction en cours...';
  result.style.display='block';
  try{
    const data=await apiCall('/translate','POST',{text,target_language:lang,style});
    output.textContent=data.translation;
    speakText(data.translation);
  }catch(e){output.textContent='Erreur de traduction'}
}

function copyTranslation(){
  const text=document.getElementById('tl-output').textContent;
  navigator.clipboard.writeText(text).then(()=>{
    addMsg('ai','📋 Traduction copiée dans le presse-papier !',false);
  });
}

async function checkWhatsAppStatus(){
  try{
    const data=await apiCall('/whatsapp/status');
    const bar=document.getElementById('wa-status-bar');
    if(data.configured){
      bar.innerHTML='<div style="font-size:11px;color:#4ade80;margin-bottom:8px">✅ WhatsApp connecté via Twilio</div>';
    }else{
      bar.innerHTML='<div style="font-size:11px;color:rgba(248,113,113,.7);margin-bottom:8px">⚠ WhatsApp non configuré — Ajoute TWILIO_SID et TWILIO_TOKEN dans Railway</div>';
    }
  }catch(e){}
}

async function sendWhatsApp(){
  const to=document.getElementById('wa-to').value.trim();
  const msg=document.getElementById('wa-msg').value.trim();
  const status=document.getElementById('wa-send-status');
  if(!to||!msg){status.style.color='#f87171';status.textContent='Numéro et message requis';return}
  status.style.color='var(--gold)';status.textContent='Envoi en cours...';
  try{
    await apiCall('/whatsapp/send','POST',{to,message:msg});
    status.style.color='#4ade80';status.textContent='✅ Message WhatsApp envoyé !';
    document.getElementById('wa-msg').value='';
    setTimeout(()=>status.textContent='',3000);
  }catch(e){
    status.style.color='#f87171';
    status.textContent='Erreur — vérifie la configuration Twilio';
  }
}
