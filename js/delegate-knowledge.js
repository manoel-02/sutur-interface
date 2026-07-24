// ── DÉLÉGATION DE TÂCHES & BASE DE CONNAISSANCES ────────────────────────

async function generateCode(description, language='python'){
  if(!TOKEN||!API_URL){addMsg('ai','Configure ton accès dabord.');return}
  addMsg('ai',`💻 **Génération de code en cours...**\nLanguage: ${language}\nDescription: *${description}*`,false);
  try{
    const data = await apiCall('/code/generate','POST',{
      description, language, save_to_pc:true, send_to_phone:true
    });
    if(data.status==='ok'){
      let msg = `✅ **Code généré avec succès!**\n\n📄 **Fichier:** \`${data.filename}\`\n📊 **Lignes:** ${data.lines}\n`;
      if(data.pc_saved) msg += `💾 **Sauvegardé sur ton PC:** \`${data.pc_path}\`\n`;
      if(data.available_for_download) msg += `📱 **Disponible sur téléphone:** Remote Desktop → FICHIERS → télécharge \`${data.filename}\`\n`;
      msg += `\n\`\`\`${language}\n${data.code.slice(0,500)}${data.code.length>500?'\n...(voir fichier complet)':''}\n\`\`\``;
      addMsg('ai', msg, true);
      // Rafraîchir la liste des fichiers
      rdRefreshFiles();
    }
  }catch(e){
    addMsg('ai',`❌ Erreur génération: ${e.message||''}`,false);
  }
}

async function analyzeNotebook(content, action='analyze'){
  if(!TOKEN||!API_URL) return;
  addMsg('ai',`📚 **NotebookLM activé** — Analyse en cours...`,false);
  try{
    const data = await apiCall('/notebook/process','POST',{action, content, format:'structured'});
    addMsg('ai', data.result, true);
  }catch(e){
    addMsg('ai',`❌ Erreur analyse: ${e.message||''}`,false);
  }
}

async function mlAnalyze(data_text, task='analyze_patterns'){
  if(!TOKEN||!API_URL) return;
  addMsg('ai',`🧠 **ML Engine activé** — Analyse des données...`,false);
  try{
    const data = await apiCall('/ml/analyze','POST',{task, data:data_text});
    addMsg('ai', data.result, true);
  }catch(e){
    addMsg('ai',`❌ Erreur ML: ${e.message||''}`,false);
  }
}

async function delegateTask(){
  const task=document.getElementById('delegate-task').value.trim();
  const ctx=document.getElementById('delegate-ctx').value.trim();
  const steps=parseInt(document.getElementById('delegate-steps').value)||3;
  const status=document.getElementById('delegate-status');
  const btn=document.getElementById('delegate-btn');
  const report=document.getElementById('delegate-report');
  if(!task){status.style.color='#f87171';status.textContent='Décris la tâche à déléguer';return}
  btn.disabled=true;btn.textContent='⏳ Sutur travaille...';
  status.style.color='var(--gold)';
  const messages=['🔍 Analyse de la tâche...','📊 Exécution des étapes...','✍️ Rédaction du rapport...'];
  let mi=0;
  const interval=setInterval(()=>{
    if(mi<messages.length){status.textContent=messages[mi++]}
  },3000);
  try{
    const data=await apiCall('/delegate','POST',{task,context:ctx,max_steps:steps});
    clearInterval(interval);
    currentDelegateReport=data.report;
    report.style.display='block';
    document.getElementById('delegate-report-content').innerHTML=
      data.report
        .replace(/^### (.*)/gm,'<div style="font-size:13px;color:var(--gold);font-weight:700;margin:12px 0 4px;text-transform:uppercase;letter-spacing:1px">$1</div>')
        .replace(/^## (.*)/gm,'<div style="font-size:15px;color:var(--text-primary);font-weight:700;margin:14px 0 6px;border-bottom:1px solid var(--border);padding-bottom:4px">$1</div>')
        .replace(/^# (.*)/gm,'<div style="font-size:18px;color:var(--text-primary);font-weight:700;margin:0 0 10px">$1</div>')
        .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
        .replace(/^- (.*)/gm,'<div style="padding:3px 0 3px 12px;border-left:2px solid var(--violet-light);margin-bottom:3px">$1</div>')
        .replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
    status.style.color='#4ade80';
    status.textContent=`✅ Tâche accomplie en ${data.steps_count} étapes`;
    btn.disabled=false;btn.textContent='🚀 DÉLÉGUER À SUTUR';
    speakText('Rapport prêt. Sutur a accompli ta tâche.');
    loadDelegateHistory();
  }catch(e){
    clearInterval(interval);
    status.style.color='#f87171';status.textContent='Erreur lors de la délégation';
    btn.disabled=false;btn.textContent='🚀 DÉLÉGUER À SUTUR';
  }
}

function copyDelegateReport(){
  navigator.clipboard.writeText(currentDelegateReport).then(()=>{
    addMsg('ai','📋 Rapport copié dans le presse-papier !',false);
  });
}

function sendDelegateToChat(){
  sw('chat',document.querySelectorAll('.tab')[0]);
  addMsg('ai','📋 **Rapport de délégation :**\n\n'+currentDelegateReport,true);
}

async function loadDelegateHistory(){
  try{
    const data=await apiCall('/delegate/history');
    const hist=data.delegations||[];
    const div=document.getElementById('delegate-history');
    if(!hist.length){
      div.innerHTML='<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:8px">Aucune tâche déléguée</div>';
      return;
    }
    div.innerHTML=hist.slice(0,5).map(d=>`
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;cursor:pointer" onclick="this.querySelector('.dh-report').style.display=this.querySelector('.dh-report').style.display==='none'?'block':'none'">
        <div style="font-size:13px;color:var(--text-primary);font-weight:500">${d.task.substring(0,80)}${d.task.length>80?'...':''}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${new Date(d.created_at).toLocaleDateString('fr',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})} · ▼ voir le rapport</div>
        <div class="dh-report" style="display:none;margin-top:10px;font-size:13px;color:var(--text-secondary);line-height:1.6;border-top:1px solid var(--border);padding-top:10px">${(d.report||'').substring(0,400)}...</div>
      </div>`).join('');
  }catch(e){}
}

async function loadKnowledge(){
  try{
    const data=await apiCall('/knowledge');
    const grouped=data.knowledge||{};
    const div=document.getElementById('knowledge-graph');
    const catIcons={projet:'🚀',objectif:'🎯',pattern:'🔄',preference:'⭐',relation:'👥'};
    const catColors={projet:'rgba(139,92,246,.15)',objectif:'rgba(201,162,39,.1)',pattern:'rgba(74,222,128,.08)',preference:'rgba(100,200,255,.08)',relation:'rgba(248,113,113,.08)'};
    if(!Object.keys(grouped).length){
      div.innerHTML='<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:12px">Graphe vide — analyse tes conversations ou ajoute des connaissances manuellement</div>';
      return;
    }
    div.innerHTML=Object.entries(grouped).map(([cat,items])=>`
      <div style="background:${catColors[cat]||'var(--surface)'};border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px">
        <div style="font-size:11px;color:var(--gold);letter-spacing:2px;margin-bottom:8px">${catIcons[cat]||'📌'} ${cat.toUpperCase()}</div>
        ${items.map(item=>`
          <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)">
            <div style="flex:1;padding-right:8px">
              <div style="font-size:13px;color:var(--text-primary);font-weight:500">${item.key}${item.timeframe?` <span style="font-size:10px;color:var(--gold);padding:2px 6px;border-radius:99px;background:rgba(201,162,39,.1);border:1px solid rgba(201,162,39,.2)">${item.timeframe}</span>`:''}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:3px;line-height:1.5">${item.value}</div>
            </div>
            <button onclick="deleteKnowledge('${item.id}')" style="background:none;border:none;color:rgba(248,113,113,.4);cursor:pointer;font-size:14px;flex-shrink:0">✕</button>
          </div>`).join('')}
      </div>`).join('');
  }catch(e){}
}

async function addKnowledge(){
  const cat=document.getElementById('kn-cat').value;
  const key=document.getElementById('kn-key').value.trim();
  const val=document.getElementById('kn-val').value.trim();
  const time=document.getElementById('kn-time').value||null;
  const msg=document.getElementById('kn-msg');
  if(!key||!val){msg.style.color='#f87171';msg.textContent='Titre et détail requis';return}
  try{
    await apiCall('/knowledge','POST',{category:cat,key,value:val,timeframe:time});
    msg.style.color='#4ade80';msg.textContent='✅ Ajouté au graphe !';
    document.getElementById('kn-key').value='';
    document.getElementById('kn-val').value='';
    setTimeout(()=>{msg.textContent='';loadKnowledge()},1000);
  }catch(e){msg.style.color='#f87171';msg.textContent='Erreur'}
}

async function deleteKnowledge(id){
  try{await apiCall(`/knowledge/${id}`,'DELETE');loadKnowledge()}catch(e){}
}

async function analyzeKnowledge(){
  const status=document.getElementById('analyze-status');
  status.textContent='🔍 Analyse de tes conversations en cours...';
  try{
    const data=await apiCall('/knowledge/analyze','POST');
    status.textContent=`✅ ${data.message}`;
    setTimeout(()=>{status.textContent='';loadKnowledge()},2000);
  }catch(e){status.textContent='Erreur lors de l\'analyse'}
}
