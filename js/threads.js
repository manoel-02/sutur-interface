// ── FILS DE DISCUSSION — conversations séparées, comme les miens ──────────

function openThreadsPanel(){
  document.getElementById('threads-modal').style.display='flex';
  loadThreadsList();
}

function closeThreadsPanel(){
  document.getElementById('threads-modal').style.display='none';
}

async function loadThreadsList(){
  const list=document.getElementById('threads-list');
  list.innerHTML='<div style="color:rgba(120,80,255,.35);text-align:center;padding:20px;font-size:12px">Chargement...</div>';
  try{
    const data=await apiCall('/threads');
    const threads=data.threads||[];
    if(threads.length===0){
      list.innerHTML='<div style="color:rgba(120,80,255,.35);text-align:center;padding:20px;font-size:12px">Aucune conversation pour l\'instant.</div>';
      return;
    }
    list.innerHTML=threads.map(t=>{
      const date=new Date(t.updated_at).toLocaleDateString('fr',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      const active=t.id===currentThreadId;
      return `<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;margin-bottom:6px;border-radius:10px;background:${active?'rgba(139,92,246,.12)':'rgba(255,255,255,.03)'};border:1px solid ${active?'rgba(139,92,246,.3)':'rgba(255,255,255,.06)'};cursor:pointer" onclick="switchThread('${t.id}')">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:#e0d0ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.title||'Nouvelle conversation'}</div>
          <div style="font-size:10px;color:rgba(160,151,196,.4);margin-top:2px">${date}</div>
        </div>
        <button onclick="event.stopPropagation();renameThread('${t.id}','${(t.title||'').replace(/'/g,"\\\\'")}')" style="background:none;border:none;color:rgba(160,151,196,.5);cursor:pointer;font-size:13px;padding:4px">✎</button>
        <button onclick="event.stopPropagation();deleteThread('${t.id}')" style="background:none;border:none;color:rgba(248,113,113,.6);cursor:pointer;font-size:13px;padding:4px">✕</button>
      </div>`;
    }).join('');
  }catch(e){
    list.innerHTML='<div style="color:#f87171;text-align:center;padding:20px;font-size:12px">Erreur de chargement</div>';
  }
}

async function createNewThread(){
  try{
    const data=await apiCall('/threads','POST');
    currentThreadId=data.id;
    history=[];
    document.getElementById('chatbox').innerHTML='';
    closeThreadsPanel();
    addMsg('ai','Nouvelle conversation — je t\'écoute.',false);
  }catch(e){
    alert('Impossible de créer une nouvelle conversation.');
  }
}

async function switchThread(threadId){
  if(threadId===currentThreadId){ closeThreadsPanel(); return; }
  try{
    const data=await apiCall('/threads/'+threadId+'/messages');
    currentThreadId=threadId;
    history=(data.messages||[]).map(m=>({role:m.role==='assistant'?'assistant':'user',content:m.content}));
    const cb=document.getElementById('chatbox');
    cb.innerHTML='';
    (data.messages||[]).forEach(m=>{
      if(m.role==='user') addMsg('user',m.content,false);
      else addMsg('ai',m.content,false);
    });
    closeThreadsPanel();
    cb.scrollTop=cb.scrollHeight;
  }catch(e){
    alert('Impossible de charger cette conversation.');
  }
}

async function renameThread(threadId,currentTitle){
  const newTitle=prompt('Nouveau nom de la conversation :',currentTitle||'');
  if(!newTitle||!newTitle.trim())return;
  try{
    await apiCall('/threads/'+threadId,'PATCH',{title:newTitle.trim()});
    loadThreadsList();
  }catch(e){
    alert('Renommage impossible.');
  }
}

async function deleteThread(threadId){
  if(!confirm('Supprimer définitivement cette conversation ?'))return;
  try{
    await apiCall('/threads/'+threadId,'DELETE');
    if(threadId===currentThreadId){
      currentThreadId=null;
      history=[];
      document.getElementById('chatbox').innerHTML='';
    }
    loadThreadsList();
  }catch(e){
    alert('Suppression impossible.');
  }
}
