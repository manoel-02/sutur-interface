// ── BRIEF, MÉMOIRES, CARTES & AGENTS DE VEILLE ──────────────────────────

async function loadBrief(){
  document.getElementById('brief-content').innerHTML='<div style="color:rgba(120,80,255,.4);text-align:center;padding:20px">Generation de votre brief...<br><div class="typing" style="justify-content:center;margin-top:10px"><span></span><span></span><span></span></div></div>';
  try{
    const data=await apiCall('/brief');
    currentBrief=data.brief||'';
    const html=currentBrief.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>').replace(/#{1,3} /g,'');
    document.getElementById('brief-content').innerHTML=`<div class="brief-card"><div class="brief-header"><span style="font-size:10px;color:rgba(0,212,255,.5);letter-spacing:1px">BRIEF DU JOUR</span><button class="go-btn" onclick="speakText(currentBrief)" style="font-size:9px;padding:4px 8px">&#128266; LIRE</button></div>${html}</div>`;
  }catch(e){document.getElementById('brief-content').innerHTML='<div style="color:#ff6060;text-align:center;padding:20px">Erreur lors de la generation</div>'}
}

async function loadMemories(){
  document.getElementById('mem-list').innerHTML='<div style="color:rgba(120,80,255,.35);text-align:center;padding:10px">Chargement...</div>';
  try{
    const data=await apiCall('/memories');
    if(!data.memories||data.memories.length===0){document.getElementById('mem-list').innerHTML='<div style="color:rgba(120,80,255,.35);text-align:center;padding:20px">Aucune memorisation encore.<br>Sutur apprend au fil de vos conversations.</div>';return}
    document.getElementById('mem-list').innerHTML=data.memories.map(m=>`
      <div class="mem-item">
        <div style="flex:1">
          <div class="mem-cat">${m.category}</div>
          <div class="mem-key">${m.key}</div>
          <div class="mem-val">${m.value}</div>
        </div>
        <button class="mem-del" onclick="deleteMemory('${m.key}')">&#10005;</button>
      </div>`).join('');
  }catch(e){document.getElementById('mem-list').innerHTML='<div style="color:#ff6060;text-align:center;padding:10px">Erreur de chargement</div>'}
}

async function deleteMemory(key){
  try{await apiCall('/memories/'+encodeURIComponent(key),'DELETE');loadMemories()}catch(e){}
}

function ensureLeaflet(){
  if(leafletLoaded && window.L)return Promise.resolve();
  if(leafletLoadingPromise)return leafletLoadingPromise;
  leafletLoadingPromise=new Promise((resolve,reject)=>{
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
    document.head.appendChild(link);
    const script=document.createElement('script');
    script.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
    script.onload=()=>{leafletLoaded=true;resolve();};
    script.onerror=()=>{leafletLoadingPromise=null;reject(new Error('Impossible de charger la carte'));};
    document.head.appendChild(script);
  });
  return leafletLoadingPromise;
}

async function showPersistentMap(lat,lng,label){
  const wrap=document.getElementById('persistent-map-wrap');
  if(!wrap)return;
  mapIsActive=true;
  const onChatTab=document.getElementById('tab-chat')?.classList.contains('active');
  // Leaflet a besoin d'un conteneur visible pour s'initialiser correctement — on l'affiche
  // temporairement le temps de la préparer, puis on applique la vraie visibilité à la fin.
  wrap.style.display='block';
  try{
    await ensureLeaflet();
  }catch(e){
    wrap.style.display='none';
    return;
  }
  const labelEl=document.getElementById('persistent-map-label');
  if(labelEl)labelEl.textContent=label||'';
  if(!persistentMapInstance){
    persistentMapInstance=L.map('persistent-map',{zoomControl:true,attributionControl:true}).setView([20,0],2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:18,subdomains:'abcd',attribution:'© OpenStreetMap, © CARTO'}).addTo(persistentMapInstance);
    persistentMapMarker=L.circleMarker([lat,lng],{radius:8,color:'#8b5cf6',fillColor:'#c9a227',fillOpacity:.9,weight:2}).addTo(persistentMapInstance);
    setTimeout(()=>{
      if(!persistentMapInstance)return;
      persistentMapInstance.invalidateSize();
      persistentMapInstance.flyTo([lat,lng],4,{duration:1.4});
    },80);
  }else{
    // La carte reste ouverte — on ne fait que déplacer le marqueur et recentrer la vue
    persistentMapMarker.setLatLng([lat,lng]);
    persistentMapInstance.invalidateSize();
    persistentMapInstance.flyTo([lat,lng],4,{duration:1});
  }
  // Visibilité finale : uniquement si on est bien sur l'onglet chat
  wrap.style.display=onChatTab?'block':'none';
}

function hidePersistentMap(){
  mapIsActive=false;
  const wrap=document.getElementById('persistent-map-wrap');
  if(wrap)wrap.style.display='none';
}

async function loadAgentsMap(){
  const mapEl=document.getElementById('agents-map');
  if(!mapEl)return;
  try{
    await ensureLeaflet();
  }catch(e){
    mapEl.innerHTML='<div style="padding:0 12px;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;color:rgba(255,255,255,.35);font-size:11px">Carte indisponible (connexion internet requise)</div>';
    return;
  }
  if(!agentsMapInstance){
    agentsMapInstance=L.map('agents-map',{zoomControl:true,attributionControl:true}).setView([20,10],2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:18,subdomains:'abcd',attribution:'© OpenStreetMap, © CARTO'}).addTo(agentsMapInstance);
  }
  setTimeout(()=>{if(agentsMapInstance)agentsMapInstance.invalidateSize()},50);
  try{
    const data=await apiCall('/agents/map-data','GET');
    agentsMapMarkers.forEach(m=>agentsMapInstance.removeLayer(m));
    agentsMapMarkers=[];
    const reports=data.reports||[];
    if(reports.length===0){
      mapEl.dataset.empty='1';
      return;
    }
    const bounds=[];
    reports.forEach(rep=>{
      if(rep.lat==null||rep.lng==null)return;
      const marker=L.circleMarker([rep.lat,rep.lng],{radius:7,color:'#8b5cf6',fillColor:'#c9a227',fillOpacity:.85,weight:2}).addTo(agentsMapInstance);
      const when=rep.created_at?new Date(rep.created_at).toLocaleDateString('fr'):'';
      marker.bindPopup(`<b>${rep.agent_name||'Agent'}</b><br>${rep.location_name||''}${when?' · '+when:''}<br><small>${(rep.summary||'').slice(0,140)}...</small>`);
      agentsMapMarkers.push(marker);
      bounds.push([rep.lat,rep.lng]);
    });
    if(bounds.length===1){agentsMapInstance.setView(bounds[0],5);}
    else if(bounds.length>1){agentsMapInstance.fitBounds(bounds,{padding:[24,24],maxZoom:6});}
  }catch(e){/* silencieux — la carte reste vide si l'API échoue, le reste du panel fonctionne quand même */}
}

async function loadAgents(){
  loadAgentsMap();
  document.getElementById('agents-list').innerHTML='<div style="color:rgba(120,80,255,.35);text-align:center;padding:10px">Chargement...</div>';
  try{
    const data=await apiCall('/agents');
    if(!data.agents||data.agents.length===0){document.getElementById('agents-list').innerHTML='<div style="color:rgba(120,80,255,.35);text-align:center;padding:10px">Aucun agent. Cree ton premier agent ci-dessus.</div>';return}
    document.getElementById('agents-list').innerHTML=data.agents.map(a=>`
      <div class="agent-card">
        <div class="agent-header">
          <div><div class="agent-name">${a.name}</div><div class="agent-type">${a.type.toUpperCase()}</div></div>
          <button class="run-btn" onclick="runAgent('${a.id}','${a.name}')">&#9654; LANCER</button>
        </div>
        <div class="agent-last">${a.last_run?'Derniere execution: '+new Date(a.last_run).toLocaleString('fr'):'Jamais execute'}</div>
        <div class="agent-result" id="ar-${a.id}"></div>
      </div>`).join('');
  }catch(e){document.getElementById('agents-list').innerHTML='<div style="color:#ff6060;text-align:center;padding:10px">Erreur</div>'}
}

async function createAgent(){
  const name=document.getElementById('ag-name').value.trim(),type=document.getElementById('ag-type').value,topic=document.getElementById('ag-topic').value.trim();
  if(!name){return}
  try{
    await apiCall('/agents','POST',{name,type,config:{topic:topic||type,sujet:topic}});
    document.getElementById('ag-name').value='';document.getElementById('ag-topic').value='';
    loadAgents();
  }catch(e){alert('Erreur creation agent')}
}

async function runAgent(id,name){
  const el=document.getElementById('ar-'+id);
  el.style.display='block';el.innerHTML='<div class="typing"><span></span><span></span><span></span></div>';
  try{
    const data=await apiCall('/agents/'+id+'/run','POST');
    el.innerHTML=data.result||'Erreur';
    speakText(`Rapport de l'agent ${name}: ${(data.result||'').substring(0,200)}`);
    loadAgentsMap();
  }catch(e){el.innerHTML='Erreur execution'}
}

async function loadTrends(category='general'){
  currentTrendCategory=category;
  // Mettre à jour boutons
  document.querySelectorAll('[id^="tr-"]').forEach(b=>{
    b.classList.remove('active');
  });
  const btn=document.getElementById('tr-'+category);
  if(btn)btn.classList.add('active');
  const list=document.getElementById('trend-list');
  list.innerHTML='<div style="color:rgba(120,80,255,.35);text-align:center;padding:20px;font-size:13px">Chargement des tendances...</div>';
  try{
    const data=await apiCall('/trends?category='+category);
    const trends=data.trends||[];
    if(!trends.length){
      list.innerHTML='<div style="color:rgba(120,80,255,.35);text-align:center;padding:20px;font-size:13px">Aucune tendance disponible</div>';
      return;
    }
    const sourceLabel=data.source==='NewsAPI'?'📰 NewsAPI':'🔍 Web';
    list.innerHTML=`<div style="font-size:10px;color:var(--text-muted);text-align:right;margin-bottom:6px;letter-spacing:1px">${sourceLabel}</div>`+
    trends.map((t,i)=>`
      <div class="trend-item" onclick="openTrend('${(t.title||'').replace(/'/g,"\\'")}')">
        <div class="trend-num">#${i+1}</div>
        <div class="trend-info">
          <div class="trend-title">${t.title||''}</div>
          <div class="trend-sub">${t.source||''} ${t.publishedAt?'· '+new Date(t.publishedAt).toLocaleDateString('fr'):''}${t.description?'<br><span style="font-size:10px;color:var(--text-muted)">'+(t.description||'').substring(0,80)+'...</span>':''}</div>
        </div>
        <div class="trend-play">&#9654;</div>
      </div>`).join('');
  }catch(e){
    list.innerHTML='<div style="color:rgba(120,80,255,.35);text-align:center;padding:20px;font-size:13px">Erreur chargement tendances</div>';
  }
}

function openTrend(topic){speakText(`Je lance une recherche sur ${topic}.`);window.open('https://www.youtube.com/results?search_query='+encodeURIComponent(topic),'_blank');if(TOKEN&&API_URL){busy=true;addMsg('user','Resume: '+topic);addTyping();sw('chat',document.querySelectorAll('.tab')[0]);setStatus('TRAITEMENT...','think');apiCall('/chat','POST',{message:'Resume concis et interessant: '+topic,model:'claude',history:[]}).then(data=>{rmTyping();addMsg('ai',data.reply||'',true);setStatus('EN LIGNE','idle');busy=false}).catch(()=>{rmTyping();setStatus('EN LIGNE','idle');busy=false})}}
