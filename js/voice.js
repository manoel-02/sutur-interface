// ── MOTEUR VOCAL ────────────────────────────────────────────────────────
// Micro (reconnaissance + amplitude), TTS ElevenLabs, boucle d'écoute continue.

function toggleVoiceMode(){
  voiceModeActive=!voiceModeActive;
  document.body.classList.toggle('voice-mode-active',voiceModeActive);
  const btn=document.getElementById('voice-toggle-btn');
  if(btn){btn.textContent=voiceModeActive?'💬':'🎙️';btn.title=voiceModeActive?'Revenir au chat':'Mode vocal plein écran';}
  resizeGlobe();
  if(voiceModeActive){
    sw('chat');
    const globeArea=document.getElementById('globe-area');
    if(globeArea)globeArea.style.display='flex';
    const cap=document.getElementById('voice-caption');
    if(cap)cap.textContent=history.length?history[history.length-1].content.slice(0,240):'Je t\'écoute...';
    greetPulse=1.0; // signal d'accueil bref — le visage s'illumine à l'ouverture, comme s'il te remarquait
    startVoiceLoop();
  }else{
    stopVoiceLoop();
  }
}

function getRMSAmplitude(analyser,dataArray){
  analyser.getByteTimeDomainData(dataArray);
  let sum=0;
  for(let i=0;i<dataArray.length;i++){const v=(dataArray[i]-128)/128;sum+=v*v;}
  return Math.min(1,Math.sqrt(sum/dataArray.length)*4);
}

async function startMicVisualizer(){
  try{
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return;
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(!micActive){stream.getTracks().forEach(t=>t.stop());return;} // micro coupé pendant la demande de permission
    micVisStream=stream;
    micAudioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const src=micAudioCtx.createMediaStreamSource(micVisStream);
    micAnalyser=micAudioCtx.createAnalyser();
    micAnalyser.fftSize=256;
    micDataArray=new Uint8Array(micAnalyser.frequencyBinCount);
    src.connect(micAnalyser);
    const tick=()=>{
      if(!micAnalyser)return;
      micAmplitude=getRMSAmplitude(micAnalyser,micDataArray);
      micRafId=requestAnimationFrame(tick);
    };
    tick();
  }catch(e){/* micro indisponible pour la visu — la reconnaissance vocale continue quand même */}
}

function stopMicVisualizer(){
  if(micRafId)cancelAnimationFrame(micRafId);
  micRafId=null;micAmplitude=0;micAnalyser=null;
  if(micVisStream){micVisStream.getTracks().forEach(t=>t.stop());micVisStream=null;}
  if(micAudioCtx){micAudioCtx.close().catch(()=>{});micAudioCtx=null;}
}

async function analyzeTtsAudio(arrayBuffer){
  const myId=++ttsAnalysisId;
  try{
    if(!ttsDecodeCtx)ttsDecodeCtx=new (window.AudioContext||window.webkitAudioContext)();
    const buf=await ttsDecodeCtx.decodeAudioData(arrayBuffer);
    if(myId!==ttsAnalysisId)return; // une lecture plus récente a démarré entre-temps, on ignore ce résultat périmé
    ttsPcm=buf.getChannelData(0);
    ttsSampleRate=buf.sampleRate;
  }catch(e){ttsPcm=null;}
}

function startTtsAmplitudeLoop(audioEl){
  const windowSize=1024;
  const tick=()=>{
    if(!audioEl||audioEl.paused||audioEl.ended){ttsAmplitude=0;ttsRafId=null;return;}
    if(ttsPcm){
      const idx=Math.floor(audioEl.currentTime*ttsSampleRate);
      let sum=0,count=0;
      for(let i=idx;i<Math.min(idx+windowSize,ttsPcm.length);i++){sum+=ttsPcm[i]*ttsPcm[i];count++;}
      ttsAmplitude=count?Math.min(1,Math.sqrt(sum/count)*3.5):0;
    }
    ttsRafId=requestAnimationFrame(tick);
  };
  tick();
}

function stopTtsAmplitudeLoop(){
  if(ttsRafId)cancelAnimationFrame(ttsRafId);
  ttsRafId=null;ttsAmplitude=0;ttsPcm=null;
}

function stopSpeech(){
  if(currentAudio){currentAudio.pause();currentAudio.src='';currentAudio=null;}
  ttsPlaying=false;
  stopTtsAmplitudeLoop();
  if(!micActive)setGlobeMode(0);
  const stopBtn=document.getElementById('stopbtn');
  if(stopBtn)stopBtn.style.display='none';
}

function flashVoiceFailure(msg){
  const hst=document.getElementById('hst');
  if(!hst)return;
  hst.textContent=msg;
  hst.style.color='#f87171';
  setTimeout(()=>{hst.textContent='EN LIGNE';hst.style.color='';},3000);
}

async function speakText(text){
  if(!text)return;
  const voiceOn=document.getElementById('t-voice').classList.contains('on');
  if(!voiceOn)return;
  if(!TOKEN||!API_URL)return;
  stopSpeech();
  const cleanText=cleanForSpeech(text);
  if(!cleanText.trim())return;
  // Limiter à 4500 chars pour ElevenLabs
  const toSpeak=cleanText.slice(0,4500);
  ttsPlaying=true;
  const stopBtn=document.getElementById('stopbtn');
  if(stopBtn)stopBtn.style.display='flex';
  try{
    const r=await fetch(API_URL+'/tts',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
      body:JSON.stringify({text:toSpeak})
    });
    if(!r.ok){
      const errBody=await r.text().catch(()=>'');
      console.warn('[TTS] échec HTTP',r.status,errBody.slice(0,300));
      flashVoiceFailure(`🔇 Voix indisponible (${r.status})`);
      ttsPlaying=false;if(stopBtn)stopBtn.style.display='none';return;
    }
    const data=await r.json();
    if(!data.audio){
      console.warn('[TTS] réponse sans audio',JSON.stringify(data).slice(0,300));
      flashVoiceFailure('🔇 Voix indisponible');
      ttsPlaying=false;if(stopBtn)stopBtn.style.display='none';return;
    }
    const bytes=atob(data.audio);
    const arr=new Uint8Array(bytes.length);
    for(let i=0;i<bytes.length;i++)arr[i]=bytes.charCodeAt(i);
    const blob=new Blob([arr],{type:'audio/mpeg'});
    const url=URL.createObjectURL(blob);
    analyzeTtsAudio(arr.buffer.slice(0)); // analyse en parallèle, ne touche jamais à la lecture réelle
    setGlobeMode(2);
    await new Promise((resolve)=>{
      const audio=new Audio(url);
      currentAudio=audio;
      audio.onplay=()=>startTtsAmplitudeLoop(audio);
      audio.onended=()=>{URL.revokeObjectURL(url);currentAudio=null;stopTtsAmplitudeLoop();resolve();};
      audio.onerror=()=>{URL.revokeObjectURL(url);currentAudio=null;stopTtsAmplitudeLoop();resolve();};
      audio.play().catch(()=>resolve());
    });
    if(!micActive)setGlobeMode(0);
  }catch(e){
    console.warn('[TTS] exception',e);
    flashVoiceFailure('🔇 Voix indisponible (réseau)');
  }
  ttsPlaying=false;
  if(stopBtn)stopBtn.style.display='none';
}

function startVoiceLoop(){
  if(!('webkitSpeechRecognition'in window||'SpeechRecognition'in window)){
    addMsg('ai','La conversation continue nécessite un navigateur compatible (Chrome/Edge). Le micro ponctuel reste disponible.');
    return;
  }
  const tv=document.getElementById('t-voice'),ta=document.getElementById('t-autospeak');
  if(tv&&!tv.classList.contains('on')){tv.classList.add('on');tv.classList.remove('off');}
  if(ta&&!ta.classList.contains('on')){ta.classList.add('on');ta.classList.remove('off');}
  voiceLoopActive=true;
  voiceLoopErrorCount=0;
  listenLoopCycle();
}

function stopVoiceLoop(){
  voiceLoopActive=false;
  if(voiceRecognition){
    voiceRecognition.onend=null;
    voiceRecognition.onresult=null;
    voiceRecognition.onerror=null;
    try{voiceRecognition.stop();}catch(e){}
    voiceRecognition=null;
  }
  if(micActive){
    micActive=false;
    const btn=document.getElementById('micbtn');
    if(btn)btn.classList.remove('active');
    stopMicVisualizer();
  }
  if(!ttsPlaying)setGlobeMode(0);
}

function listenLoopCycle(){
  if(!voiceLoopActive)return;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const rec=new SR();
  voiceRecognition=rec;
  rec.lang='fr-FR';
  rec.continuous=false;
  rec.interimResults=false;
  micActive=true;
  const btn=document.getElementById('micbtn');
  if(btn)btn.classList.add('active');
  setGlobeMode(4);
  startMicVisualizer();
  rec.onresult=(e)=>{
    voiceLoopErrorCount=0;
    const transcript=e.results[0][0].transcript;
    if(transcript&&transcript.trim())voiceLoopTurn(transcript.trim());
  };
  rec.onerror=(e)=>{
    if(e.error==='not-allowed'||e.error==='service-not-allowed'){
      voiceLoopActive=false;
      addMsg('ai','Micro refusé — impossible de continuer la conversation vocale. Autorise le micro dans les réglages du navigateur.');
      return;
    }
    // 'no-speech' (silence normal entre 2 tours) et 'aborted' (arrêt volontaire via le bouton d'interruption
    // ou stopVoiceLoop) sont des artefacts attendus du fonctionnement normal — jamais de vraies erreurs.
    if(e.error==='network'){
      // Souvent un hoquet transitoire du moteur de reconnaissance — tolérance élargie,
      // et on laisse un peu plus de temps avant de relancer (voir onend).
      voiceLoopErrorCount+=0.5;
      voiceNetworkBackoff=true;
    }else if(e.error!=='no-speech'&&e.error!=='aborted'){
      voiceLoopErrorCount++;
    }
    if(voiceLoopErrorCount>=5){
      voiceLoopActive=false;
      addMsg('ai','La conversation continue a rencontré trop d\'erreurs micro et s\'est arrêtée. Réessaie avec le bouton vocal.');
    }
  };
  rec.onend=()=>{
    micActive=false;
    if(btn)btn.classList.remove('active');
    stopMicVisualizer();
    if(voiceLoopActive&&!busy){
      const delay=voiceNetworkBackoff?1500:400;
      voiceNetworkBackoff=false;
      setTimeout(()=>{if(voiceLoopActive&&!busy)listenLoopCycle();},delay);
    }
  };
  try{rec.start();}catch(e){
    setTimeout(()=>{if(voiceLoopActive)listenLoopCycle();},600);
  }
}

async function voiceLoopTurn(transcript){
  document.getElementById('cinp').value=transcript;
  await sendMsg();
  // addMsg déclenche speakText avec 200ms de délai — on laisse le temps au TTS de démarrer puis on attend la fin
  await new Promise(r=>setTimeout(r,350));
  while(ttsPlaying){
    await new Promise(r=>setTimeout(r,200));
  }
  if(voiceLoopActive)listenLoopCycle();
}

function toggleMic(){
  if(voiceLoopActive){
    // En conversation continue : le bouton sert à couper Sutur et reprendre la parole tout de suite
    if(ttsPlaying)stopSpeech();
    if(voiceRecognition){
      voiceRecognition.onend=null; // évite un double redémarrage avec celui programmé juste en dessous
      try{voiceRecognition.stop();}catch(e){}
    }
    setTimeout(()=>{if(voiceLoopActive)listenLoopCycle();},150);
    return;
  }
  if(!('webkitSpeechRecognition'in window||'SpeechRecognition'in window)){addMsg('ai','Micro non supporte.');return}const btn=document.getElementById('micbtn');if(micActive){micActive=false;btn.classList.remove('active');stopMicVisualizer();setGlobeMode(0);return}micActive=true;btn.classList.add('active');setGlobeMode(4);startMicVisualizer();const SR=window.SpeechRecognition||window.webkitSpeechRecognition,rec=new SR();rec.lang='fr-FR';rec.continuous=false;rec.interimResults=false;rec.onresult=e=>{document.getElementById('cinp').value=e.results[0][0].transcript;sendMsg()};rec.onend=()=>{micActive=false;btn.classList.remove('active');stopMicVisualizer();setGlobeMode(0)};rec.start()}
