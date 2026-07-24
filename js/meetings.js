// ── RÉUNIONS & GÉNÉRATION DE DOCUMENTS ──────────────────────────────────

function stopMeetingFromBar(){
  // Revenir sur l'onglet FOCUS et déclencher l'arrêt
  sw('focus',document.querySelectorAll('.tab')[5]);
  setTimeout(()=>toggleMeetingRec(),200);
}

function setMeetMode(mode){
  meetMode=mode;
  document.getElementById('meet-mode-mic').classList.toggle('active',mode==='mic');
  document.getElementById('meet-mode-screen').classList.toggle('active',mode==='screen');
  document.getElementById('meet-mode-desc').textContent=mode==='mic'
    ?'Enregistre via ton micro. Idéal pour une réunion en présentiel.'
    :'Capture l\'audio de Teams, Meet ou Zoom. Partage ton écran avec audio quand demandé — Sutur enregistre en arrière-plan.';
}

function startMeetTimer(){
  meetSeconds=0;
  meetTimerInterval=setInterval(()=>{
    meetSeconds++;
    const m=Math.floor(meetSeconds/60),s=meetSeconds%60;
    document.getElementById('meet-timer').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  },1000);
}

function stopMeetTimer(){
  if(meetTimerInterval){clearInterval(meetTimerInterval);meetTimerInterval=null}
}

function startAudioLevel(stream){
  try{
    const ctx=new AudioContext();
    const src=ctx.createMediaStreamSource(stream);
    meetAnalyser=ctx.createAnalyser();
    meetAnalyser.fftSize=256;
    src.connect(meetAnalyser);
    const buf=new Uint8Array(meetAnalyser.frequencyBinCount);
    const level=document.getElementById('meet-level');
    function draw(){
      meetAnimFrame=requestAnimationFrame(draw);
      meetAnalyser.getByteFrequencyData(buf);
      const avg=buf.reduce((a,b)=>a+b,0)/buf.length;
      level.style.width=Math.min(100,avg*2.5)+'%';
    }
    draw();
  }catch(e){}
}

function stopAudioLevel(){
  if(meetAnimFrame){cancelAnimationFrame(meetAnimFrame);meetAnimFrame=null}
  const level=document.getElementById('meet-level');
  if(level)level.style.width='0%';
}

async function toggleMeetingRec(){
  const btn=document.getElementById('meet-rec-btn');
  const status=document.getElementById('meet-status');

  if(meetRecorder&&meetRecorder.state==='recording'){
    // Arrêter l'enregistrement
    meetRecorder.stop();
    stopMeetTimer();
    stopAudioLevel();
    meetStream&&meetStream.getTracks().forEach(t=>t.stop());
    btn.textContent='🎙 DÉMARRER';
    btn.style.background='';
    btn.style.borderColor='';
    status.textContent='⏳ Transcription en cours via Whisper...';
    document.getElementById('meet-stop-bar').style.display='none';
    return;
  }

  try{
    // Démarrer l'enregistrement
    if(meetMode==='screen'){
      const displayStream=await navigator.mediaDevices.getDisplayMedia({
        video:true,audio:{echoCancellation:false,noiseSuppression:false,sampleRate:44100}
      });
      // Vérifier que l'audio est bien capturé
      const audioTracks=displayStream.getAudioTracks();
      if(audioTracks.length===0){
        displayStream.getTracks().forEach(t=>t.stop());
        status.textContent='⚠ Pas d\'audio capturé — coche "Partager l\'audio du système" dans la popup Chrome';
        return;
      }
      meetStream=displayStream;
    }else{
      meetStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    }

    meetChunks=[];
    const mimeType=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'audio/webm';
    meetRecorder=new MediaRecorder(meetStream,{mimeType});
    meetRecorder.ondataavailable=e=>{if(e.data.size>0)meetChunks.push(e.data)};
    meetRecorder.onstop=async()=>{
      const blob=new Blob(meetChunks,{type:'audio/webm'});
      await transcribeWithWhisper(blob);
    };
    meetRecorder.start(1000); // chunk toutes les secondes
    startMeetTimer();
    startAudioLevel(meetStream);
    btn.textContent='⏹ ARRÊTER ET RÉSUMER';
    btn.style.background='rgba(248,113,113,.2)';
    btn.style.borderColor='rgba(248,113,113,.4)';
    status.textContent=meetMode==='screen'?'🔴 Enregistrement de l\'audio système en cours...':'🔴 Enregistrement micro en cours...';
    // Afficher le bouton d'arrêt dans la barre fixe
    document.getElementById('meet-stop-bar').style.display='flex';
  }catch(e){
    if(e.name==='NotAllowedError'){
      status.textContent='Permission refusée — autorise le micro/écran dans ton navigateur';
    }else{
      status.textContent='Erreur: '+e.message;
    }
  }
}

async function transcribeWithWhisper(blob){
  const status=document.getElementById('meet-status');
  const summaryDiv=document.getElementById('meet-summary');
  const summaryContent=document.getElementById('meet-summary-content');
  try{
    status.textContent='📡 Envoi à Whisper... (peut prendre 10-30 secondes)';
    // Convertir blob en base64
    const arrayBuffer=await blob.arrayBuffer();
    const bytes=new Uint8Array(arrayBuffer);
    let binary='';
    for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
    const b64=btoa(binary);
    const data=await apiCall('/meeting/transcribe','POST',{
      audio_b64:b64,format:'webm',summarize:true
    });
    if(data.summary){
      summaryDiv.style.display='block';
      summaryContent.innerHTML=data.summary
        .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
        .replace(/^### (.*)/gm,'<div style="font-size:13px;color:var(--gold);font-weight:700;margin:10px 0 4px">$1</div>')
        .replace(/^## (.*)/gm,'<div style="font-size:15px;color:var(--text-primary);font-weight:700;margin:12px 0 5px">$1</div>')
        .replace(/^- (.*)/gm,'<div style="padding:3px 0 3px 10px;border-left:2px solid var(--violet-light);margin-bottom:3px">$1</div>')
        .replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
      status.textContent=`✅ Résumé généré — ${Math.round(meetSeconds/60)}min de réunion transcrites`;
      speakText('Le résumé de ta réunion est prêt.');
    }else if(data.transcript){
      document.getElementById('meet-transcript').value=data.transcript;
      status.textContent='✅ Transcription effectuée — clique "Résumer" pour générer le résumé';
    }
  }catch(e){
    status.textContent='❌ Erreur Whisper — vérifie que ta clé OpenAI est configurée';
  }
}

function copyMeetSummary(){
  const text=document.getElementById('meet-summary-content').innerText;
  navigator.clipboard.writeText(text).then(()=>{
    addMsg('ai','📋 Résumé de réunion copié !',false);
    sw('chat',document.querySelectorAll('.tab')[0]);
  });
}

async function submitTranscript(){
  const transcript=document.getElementById('meet-transcript').value.trim();
  const status=document.getElementById('meet-status');
  const summaryDiv=document.getElementById('meet-summary');
  const summaryContent=document.getElementById('meet-summary-content');
  if(!transcript){status.textContent='Ajoute une transcription d\'abord';return}
  status.textContent='Analyse en cours...';summaryDiv.style.display='none';
  try{
    const data=await apiCall('/meeting/summarize','POST',{transcript});
    summaryDiv.style.display='block';
    summaryContent.innerHTML=data.summary
      .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
      .replace(/^### (.*)/gm,'<div style="font-size:13px;color:var(--gold);font-weight:700;margin:10px 0 4px">$1</div>')
      .replace(/^## (.*)/gm,'<div style="font-size:15px;color:var(--text-primary);font-weight:700;margin:12px 0 5px">$1</div>')
      .replace(/^- (.*)/gm,'<div style="padding:3px 0 3px 10px;border-left:2px solid var(--violet-light);margin-bottom:3px">$1</div>')
      .replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
    status.textContent='✅ Résumé généré et sauvegardé dans ta mémoire';
    speakText('Le résumé de ta réunion est prêt.');
  }catch(e){status.textContent='Erreur lors de l\'analyse'}
}

async function generateDoc(){
  const type=document.getElementById('doc-type').value;
  const brief=document.getElementById('doc-brief').value.trim();
  const status=document.getElementById('doc-status');
  const result=document.getElementById('doc-result');
  if(!brief){status.textContent='Décris ce que tu veux générer';return}
  status.textContent='Génération en cours...';result.style.display='none';
  try{
    const data=await apiCall('/document/generate','POST',{type,brief});
    result.style.display='block';
    result.innerHTML=data.document
      .replace(/^### (.*)/gm,'<div style="font-size:13px;color:var(--gold);font-weight:700;margin:12px 0 4px;text-transform:uppercase;letter-spacing:1px">$1</div>')
      .replace(/^## (.*)/gm,'<div style="font-size:15px;color:var(--text-primary);font-weight:700;margin:14px 0 6px;border-bottom:1px solid var(--border);padding-bottom:4px">$1</div>')
      .replace(/^# (.*)/gm,'<div style="font-size:18px;color:var(--text-primary);font-weight:700;margin:0 0 10px">$1</div>')
      .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
      .replace(/^- (.*)/gm,'<div style="padding:3px 0 3px 12px;border-left:2px solid var(--violet-light)">$1</div>')
      .replace(/\n\n/g,'<br><br>')
      .replace(/\n/g,'<br>');
    // Bouton copier
    result.innerHTML+=`<div style="margin-top:14px;display:flex;gap:8px">
      <button onclick="copyDoc()" class="go-btn" style="flex:1">📋 COPIER</button>
      <button onclick="document.getElementById('doc-result').style.display='none'" class="go-btn" style="padding:10px 14px">✕</button>
    </div>`;
    status.textContent='✅ Document généré !';
    speakText('Ton document est prêt.');
  }catch(e){status.textContent='Erreur lors de la génération'}
}

function copyDoc(){
  const text=document.getElementById('doc-result').innerText;
  navigator.clipboard.writeText(text).then(()=>{
    addMsg('ai','📋 Document copié dans le presse-papier !',false);
    sw('chat',document.querySelectorAll('.tab')[0]);
  });
}
