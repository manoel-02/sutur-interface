// ── NOTIFICATIONS PUSH & ADMINISTRATION ─────────────────────────────────

async function loadSportNotifications(){
  try{
    const data=await apiCall('/notifications/sport');
    const notifs=data.notifications||[];
    // N'afficher que les vraies nouveautés
    const newNotifs = notifs.filter(n=>n.is_new);
    if(newNotifs.length){
      newNotifs.forEach((n,i)=>setTimeout(()=>{
        addMsg('ai',`${n.icon} **Nouveauté ${n.sport} !**\n\n${n.content}`,false);
      },i*1500));
    }
    // Pour les infos non nouvelles, les mettre dans un résumé silencieux
    // accessible via le chat ("actualités F1") mais sans notification
  }catch(e){}// Silencieux
}

async function deliverPendingNotifications(){
  try{
    const data=await apiCall('/notifications/pending');
    const notifs=data.notifications||[];
    if(!notifs.length)return;
    notifs.forEach((n,i)=>setTimeout(()=>addMsg('ai',`${n.title}\n\n${n.body}`,false),i*1000));
  }catch(e){}// Silencieux — pas critique
}

function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const rawData=window.atob(base64);
  const outputArray=new Uint8Array(rawData.length);
  for(let i=0;i<rawData.length;++i)outputArray[i]=rawData.charCodeAt(i);
  return outputArray;
}

async function togglePushNotifications(btn){
  btn.classList.toggle('on');btn.classList.toggle('off');
  const isOn=btn.classList.contains('on');
  if(!isOn)return;
  if(!('serviceWorker' in navigator)||!('PushManager' in window)){
    addMsg('ai','Les notifications push ne sont pas supportées sur ce navigateur. Utilise Chrome sur Android.',false);
    btn.classList.remove('on');btn.classList.add('off');
    return;
  }
  try{
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){
      addMsg('ai','Permission notifications refusée. Active-les dans les paramètres du navigateur.',false);
      btn.classList.remove('on');btn.classList.add('off');
      return;
    }
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    await apiCall('/push/subscribe','POST',{subscription:sub.toJSON()});
    addMsg('ai','✅ Notifications push activées ! Tu recevras les alertes Sutur même quand l\'app est fermée.',false);
    localStorage.setItem('s_push','1');
  }catch(e){
    btn.classList.remove('on');btn.classList.add('off');
    addMsg('ai','Erreur activation push: '+e.message,false);
  }
}

async function testPushNotification(){
  if(!localStorage.getItem('s_push') && !document.getElementById('t-push').classList.contains('on')){
    addMsg('ai','Active d\'abord les notifications push juste au-dessus, sinon il n\'y a rien à tester.',false);
    return;
  }
  try{
    const data=await apiCall('/push/send','POST');
    addMsg('ai','📨 '+(data.message||'Notification de test envoyée — regarde ton écran/téléphone.'),false);
  }catch(e){
    addMsg('ai','Erreur envoi test: '+e.message,false);
  }
}

async function loadMessages(){
  try{
    const data=await apiCall('/messages');
    const msgs=data.messages||[];
    const tabBtn=document.getElementById('tab-msgs-btn');
    if(msgs.length>0)tabBtn.innerHTML='MSGS<span class="notif-dot"></span>';
    else tabBtn.innerHTML='MSGS';
    const el=document.getElementById('msgs-list');
    el.innerHTML=msgs.length?msgs.map(m=>`
      <div class="msg-item">
        <div class="msg-from">DE: MANOEL</div>
        <div class="msg-body">${m.content}</div>
        <div class="msg-time">${new Date(m.created_at).toLocaleString('fr')}</div>
      </div>`).join(''):'<div style="color:rgba(120,80,255,.35);text-align:center;padding:10px">Aucun message</div>';
    if(userIsOwner)loadAdminDashboard();
  }catch(e){}
}

async function loadAdminDashboard(){
  if(!userIsOwner)return;
  const dash=document.getElementById('admin-dashboard');
  if(!dash)return;
  dash.style.display='block';
  const sendSec=document.getElementById('send-section');
  const sendArea=document.getElementById('send-area');
  if(sendSec)sendSec.style.display='block';
  if(sendArea)sendArea.style.display='flex';
  try{
    const data=await apiCall('/admin/users');
    const users=data.users||[];
    const elCount=document.getElementById('admin-users-count');
    const elMsgs=document.getElementById('admin-msgs-count');
    const elList=document.getElementById('admin-users-list');
    if(elCount)elCount.textContent=users.filter(u=>u.active).length;
    if(elMsgs)elMsgs.textContent=users.reduce((s,u)=>s+(u.message_count||0),0);
    if(elList)elList.innerHTML=users.length?users.map(u=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 11px;background:rgba(120,80,255,.05);border:1px solid rgba(120,80,255,.12);border-radius:10px;margin-bottom:6px">
        <div>
          <div style="font-size:12px;color:#c8aaff;font-weight:500">${u.name||'Sans nom'} ${u.is_owner?'👑':''}</div>
          <div style="font-size:9px;color:rgba(150,120,255,.4);margin-top:2px;font-family:'Courier New',monospace">${(u.token||'').substring(0,20)}...</div>
          <div style="font-size:9px;color:rgba(201,162,39,.7);margin-top:1px">💬 ${u.message_count||0} msgs</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="font-size:9px;padding:2px 7px;border-radius:99px;background:${u.active?'rgba(74,222,128,.1)':'rgba(248,113,113,.1)'};color:${u.active?'#4ade80':'#f87171'};border:1px solid ${u.active?'rgba(74,222,128,.3)':'rgba(248,113,113,.3)'}">${u.active?'ACTIF':'INACTIF'}</span>
          ${!u.is_owner?`<button onclick="revokeUser('${u.token}')" style="background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.2);border-radius:6px;color:rgba(255,120,120,.6);font-size:9px;padding:3px 7px;cursor:pointer">Révoquer</button>`:''}
        </div>
      </div>`).join(''):'<div style="color:rgba(120,80,255,.35);font-size:11px;text-align:center;padding:8px">Aucun utilisateur</div>';
  }catch(e){
    const el=document.getElementById('admin-users-list');
    if(el)el.innerHTML='<div style="color:rgba(255,80,80,.5);font-size:11px;text-align:center;padding:8px">Erreur chargement</div>';
  }
}

async function inviteUser(){
  const name=document.getElementById('invite-name').value.trim();
  const customToken=document.getElementById('invite-token').value.trim();
  const password=document.getElementById('invite-pass').value.trim();
  const result=document.getElementById('invite-result');
  if(!name){result.style.color='#f87171';result.textContent='Le prénom est requis';return}
  result.style.color='rgba(150,120,255,.5)';result.textContent='Création...';
  try{
    const data=await apiCall('/admin/invite','POST',{name,custom_token:customToken||null,password:password||null,profession:'',interests:[]});
    result.style.color='#4ade80';
    result.innerHTML=`✅ <strong>${data.name}</strong> créé<br>🔑 Token: <span style="font-family:'Courier New',monospace;color:#c9a227">${data.token}</span><br>🔒 Pass: <span style="font-family:'Courier New',monospace;color:#c9a227">${data.password}</span>`;
    document.getElementById('invite-name').value='';
    document.getElementById('invite-token').value='';
    document.getElementById('invite-pass').value='';
    setTimeout(loadAdminDashboard,800);
  }catch(e){result.style.color='#f87171';result.textContent='Erreur: '+(e.message||'inconnue')}
}

async function revokeUser(token){
  if(!confirm('Révoquer cet utilisateur ?'))return;
  try{await apiCall('/admin/revoke','POST',{token});loadAdminDashboard();}catch(e){alert('Erreur')}
}

async function sendAdminMsg(){
  const to=document.getElementById('msg-to').value.trim(),body=document.getElementById('msg-body').value.trim();
  if(!to||!body)return;
  try{
    await apiCall('/admin/message','POST',{to_token:to,content:body});
    document.getElementById('msg-to').value='';document.getElementById('msg-body').value='';
    addMsg('ai','Message envoye avec succes.');
  }catch(e){addMsg('ai','Erreur envoi message.')}
}
