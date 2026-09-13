// ── FOCUS TIMER & RAPPELS ────────────────────────────────────────────────

function setFocusDuration(min){
  focusDuration=min;
  focusTotalSeconds=min*60;
  focusSeconds=0;
  updateFocusDisplay(min*60);
  document.querySelectorAll('[id^="f"]').forEach(b=>b.classList.remove('active'));
  document.getElementById('f'+min)&&document.getElementById('f'+min).classList.add('active');
}

function updateFocusDisplay(secs){
  const m=Math.floor(secs/60),s=secs%60;
  document.getElementById('focus-timer').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function startFocus(){
  if(focusTimer)return;
  const task=document.getElementById('focus-task-inp').value.trim();
  document.getElementById('focus-task-display').textContent=task||'Session de focus';
  document.getElementById('focus-state').textContent=focusIsBreak?'PAUSE ☕':'FOCUS 🎯';
  document.getElementById('focus-state').style.color=focusIsBreak?'#4ade80':'var(--gold)';
  focusSeconds=focusTotalSeconds;
  if(task)speakText(`Session de focus démarrée. ${focusDuration} minutes pour : ${task}. Bonne concentration.`);
  else speakText(`Session de focus de ${focusDuration} minutes. C'est parti.`);
  focusTimer=setInterval(()=>{
    focusSeconds--;
    updateFocusDisplay(focusSeconds);
    if(focusSeconds<=0){
      clearInterval(focusTimer);focusTimer=null;
      if(!focusIsBreak){
        speakText(`Excellent travail ! Session de ${focusDuration} minutes terminée. Prends une pause de 5 minutes.`);
        document.getElementById('focus-state').textContent='PAUSE ☕';
        document.getElementById('focus-state').style.color='#4ade80';
        focusIsBreak=true;focusSeconds=5*60;focusTotalSeconds=5*60;
        startFocus();
      }else{
        speakText('Pause terminée. Prêt pour une nouvelle session ?');
        document.getElementById('focus-state').textContent='PRÊT';
        document.getElementById('focus-state').style.color='var(--gold)';
        focusIsBreak=false;setFocusDuration(focusDuration);
      }
    }
  },1000);
}

function stopFocus(){
  if(focusTimer){clearInterval(focusTimer);focusTimer=null}
  focusIsBreak=false;
  setFocusDuration(focusDuration);
  document.getElementById('focus-state').textContent='PRÊT';
  document.getElementById('focus-state').style.color='var(--gold)';
  document.getElementById('focus-task-display').textContent='Aucune tâche en cours';
  speakText('Session arrêtée.');
}

async function addReminder(){
  const msg=document.getElementById('reminder-msg').value.trim();
  const dt=document.getElementById('reminder-dt').value;
  const repeat=document.getElementById('reminder-repeat').value||null;
  const status=document.getElementById('reminder-msg-status');
  if(!msg){status.style.color='#f87171';status.textContent='Ajoute un message';return}
  if(!dt){status.style.color='#f87171';status.textContent='Choisis une date et heure';return}
  try{
    await apiCall('/reminders','POST',{message:msg,remind_at:dt,repeat});
    status.style.color='#4ade80';status.textContent='⏰ Rappel créé !';
    document.getElementById('reminder-msg').value='';
    document.getElementById('reminder-dt').value='';
    setTimeout(()=>{status.textContent='';loadReminders()},1200);
  }catch(e){status.style.color='#f87171';status.textContent='Erreur'}
}

async function loadReminders(){
  try{
    const data=await apiCall('/reminders');
    const list=document.getElementById('reminders-list');
    const reminders=data.reminders||[];
    if(!reminders.length){
      list.innerHTML='<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:8px">Aucun rappel à venir</div>';
      return;
    }
    list.innerHTML=reminders.map(r=>{
      const dt=new Date(r.remind_at);
      const fmt=dt.toLocaleDateString('fr',{day:'2-digit',month:'short'})+' à '+dt.toLocaleTimeString('fr',{hour:'2-digit',minute:'2-digit'});
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:6px">
        <div>
          <div style="font-size:13px;color:var(--text-primary);font-weight:500">${r.message}</div>
          <div style="font-size:11px;color:var(--gold);margin-top:2px">⏰ ${fmt}${r.repeat?' · '+r.repeat:''}</div>
        </div>
        <button onclick="deleteReminder('${r.id}')" style="background:none;border:none;color:rgba(248,113,113,.4);cursor:pointer;font-size:15px">✕</button>
      </div>`;
    }).join('');
  }catch(e){}
}

async function deleteReminder(id){
  try{await apiCall(`/reminders/${id}`,'DELETE');loadReminders()}catch(e){}
}

function checkDueReminders(){
  if(!TOKEN||!API_URL)return;
  apiCall('/reminders/due').then(data=>{
    const due=data.due||[];
    due.forEach(r=>{
      speakText(`Rappel : ${r.message}`);
      addMsg('ai',`⏰ **Rappel :** ${r.message}`,true);
    });
  }).catch(()=>{});
}
