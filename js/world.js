// ── PANNEAU WORLD — globe 3D rotatif, frontières réelles, clic pays ────────
// Frontières issues d'un jeu de données public (Natural Earth, domaine public),
// chargées une seule fois par session. Rendu dans le même thème holographique
// (violet/or/lignes lumineuses) que le reste de Sutur — pas de texture
// photographique, une vraie géométrie stylisée cohérente avec l'identité visuelle.
const WORLD_GEOJSON_URL='https://raw.githubusercontent.com/datasets/geo-countries/main/data/countries.geojson';
let world_scene=null, world_camera=null, world_renderer=null, world_globeGroup=null;
let world_earthTexture=null; // chargée une seule fois, réutilisée à chaque réouverture
const WORLD_EARTH_TEXTURE_URL='https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg';
let world_countriesData=null, world_animating=false;
let world_rotationY=0.4, world_rotationX=0.3;
let world_dragging=false, world_lastX=0, world_lastY=0;
let world_autoRotate=true;
let world_spinVelocityY=0;          // vélocité "toupie" après un glissement — persiste sans frottement
let world_velocityHistory=[];       // échantillons récents pour calculer la vélocité au relâchement
let world_holdTimer=null;           // minuteur de pression longue (souris/tactile)
let world_holdCanceledByMove=false; // un vrai geste de glisser annule l'arrêt programmé
let world_keyHoldTimer=null;        // minuteur de pression longue (clavier)

function latLngToVector3(lat,lng,radius){
  const phi=(90-lat)*Math.PI/180;
  const theta=(lng+180)*Math.PI/180;
  return new THREE.Vector3(
    -radius*Math.sin(phi)*Math.cos(theta),
    radius*Math.cos(phi),
    radius*Math.sin(phi)*Math.sin(theta)
  );
}

function vector3ToLatLng(v){
  const radius=v.length();
  const phi=Math.acos(Math.max(-1,Math.min(1,v.y/radius)));
  const theta=Math.atan2(v.z,-v.x);
  const lat=90-(phi*180/Math.PI);
  let lng=(theta*180/Math.PI)-180;
  if(lng<-180)lng+=360;
  if(lng>180)lng-=360;
  return {lat,lng};
}

function pointInRing(lng,lat,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
    const intersect=((yi>lat)!==(yj>lat)) && (lng < (xj-xi)*(lat-yi)/(yj-yi)+xi);
    if(intersect) inside=!inside;
  }
  return inside;
}

function findCountryAt(lat,lng){
  if(!world_countriesData) return null;
  for(const feature of world_countriesData.features){
    const geom=feature.geometry;
    if(!geom) continue;
    const polys = geom.type==='Polygon' ? [geom.coordinates] : (geom.type==='MultiPolygon' ? geom.coordinates : []);
    for(const poly of polys){
      if(poly.length && pointInRing(lng,lat,poly[0])) return feature.properties;
    }
  }
  return null;
}

async function openWorldPanel(){
  document.getElementById('world-modal').style.display='flex';
  document.getElementById('world-info-panel').style.display='none';

  try{
    await ensureThreeJS();
  }catch(e){
    document.getElementById('world-loading').innerHTML='<div style="color:#f87171;font-size:11px">Three.js indisponible — vérifie ta connexion</div>';
    return;
  }

  if(!world_countriesData){
    try{
      const resp=await fetch(WORLD_GEOJSON_URL);
      world_countriesData=await resp.json();
    }catch(e){
      document.getElementById('world-loading').innerHTML='<div style="color:#f87171;font-size:11px">Chargement des frontières impossible — vérifie ta connexion</div>';
      return;
    }
  }

  await initWorldGlobe();
  buildCountryBorders();
  document.getElementById('world-loading').style.display='none';

  if(!world_animating){
    world_animating=true;
    worldLoop();
  }
  setupWorldControls();
}

async function initWorldGlobe(){
  const canvas=document.getElementById('world-canvas');
  const w=canvas.clientWidth||400, h=canvas.clientHeight||400;

  if(!world_renderer){
    world_scene=new THREE.Scene();
    world_camera=new THREE.PerspectiveCamera(45,w/h,0.1,100);
    world_renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
  }
  world_renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  world_renderer.setSize(w,h,false);
  world_camera.aspect=w/h;
  world_camera.updateProjectionMatrix();
  world_camera.position.set(0,0,7);

  if(world_globeGroup){ world_scene.remove(world_globeGroup); }
  world_globeGroup=new THREE.Group();

  // Étoiles de fond
  const starPos=[];
  for(let i=0;i<600;i++) starPos.push((Math.random()-0.5)*80,(Math.random()-0.5)*80,(Math.random()-0.5)*80);
  const starGeo=new THREE.BufferGeometry();
  starGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(starPos),3));
  world_scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xffffff,size:0.06,transparent:true,opacity:0.5})));

  // Vraie texture Terre — chargée une seule fois puis mise en cache. Repli sur le
  // style filaire précédent si le chargement échoue (réseau coupé, etc.), pour ne
  // jamais laisser le globe complètement vide en cas de souci.
  const sphereGeo=new THREE.SphereGeometry(2.5,48,32);
  let earthMat;
  try{
    if(!world_earthTexture){
      world_earthTexture=await new Promise((resolve,reject)=>{
        new THREE.TextureLoader().load(WORLD_EARTH_TEXTURE_URL,resolve,undefined,reject);
      });
    }
    earthMat=new THREE.MeshBasicMaterial({map:world_earthTexture});
  }catch(e){
    console.warn('[world] texture Terre indisponible, repli sur le rendu filaire',e);
    earthMat=new THREE.MeshBasicMaterial({color:0x8b5cf6,wireframe:true,transparent:true,opacity:0.15});
  }
  world_globeGroup.add(new THREE.Mesh(sphereGeo,earthMat));

  // Sphère invisible dédiée au raycasting (plus fiable que viser la texture directement)
  const hitSphere=new THREE.Mesh(sphereGeo,new THREE.MeshBasicMaterial({visible:false}));
  hitSphere.name='world-hit-sphere';
  world_globeGroup.add(hitSphere);

  // Halo doux
  const glowGeo=new THREE.SphereGeometry(2.55,32,24);
  world_globeGroup.add(new THREE.Mesh(glowGeo,new THREE.MeshBasicMaterial({color:0x8b5cf6,transparent:true,opacity:0.04,side:THREE.BackSide})));

  world_scene.add(world_globeGroup);
}

function buildCountryBorders(){
  const RADIUS=2.5;
  for(const feature of world_countriesData.features){
    const geom=feature.geometry;
    if(!geom) continue;
    const polys = geom.type==='Polygon' ? [geom.coordinates] : (geom.type==='MultiPolygon' ? geom.coordinates : []);
    for(const poly of polys){
      const ring=poly[0]; // anneau extérieur uniquement — suffisant pour un tracé de frontière lisible
      if(!ring || ring.length<2) continue;
      const pts=ring.map(([lng,lat])=>latLngToVector3(lat,lng,RADIUS+0.01));
      const geo=new THREE.BufferGeometry().setFromPoints(pts);
      // Contour doré, net et bien visible par-dessus la texture réelle — cohérent avec
      // le reste de l'identité visuelle de Sutur sans dénaturer les vraies couleurs du globe.
      const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xffd966,transparent:true,opacity:0.85}));
      world_globeGroup.add(line);
    }
  }
}

function setupWorldControls(){
  const canvas=document.getElementById('world-canvas');
  if(canvas._worldControlsBound) return; // éviter d'attacher les écouteurs plusieurs fois
  canvas._worldControlsBound=true;
  canvas.setAttribute('tabindex','0'); // rend le canvas focusable, nécessaire pour capter le clavier

  let moved=false, downX=0, downY=0;

  const startHoldTimer=()=>{
    world_holdCanceledByMove=false;
    clearTimeout(world_holdTimer);
    world_holdTimer=setTimeout(()=>{
      if(!world_holdCanceledByMove){
        // Pression longue de 2 secondes sans glisser -> arrêt volontaire, comme on
        // poserait la main sur une vraie toupie pour l'arrêter.
        world_spinVelocityY=0; world_autoRotate=false;
      }
    },2000);
  };
  const cancelHoldTimer=()=>{ clearTimeout(world_holdTimer); world_holdTimer=null; };

  const onDown=(x,y)=>{
    world_dragging=true; world_lastX=x; world_lastY=y; downX=x; downY=y; moved=false;
    world_velocityHistory=[{x,t:performance.now()}];
    canvas.style.cursor='grabbing';
    startHoldTimer();
  };
  const onMove=(x,y)=>{
    if(!world_dragging)return;
    const dx=x-world_lastX, dy=y-world_lastY;
    if(Math.abs(x-downX)>4||Math.abs(y-downY)>4){
      moved=true;
      world_holdCanceledByMove=true; // un vrai geste de glisser annule l'arrêt programmé
      cancelHoldTimer();
    }
    world_rotationY+=dx*0.005;
    world_rotationX=Math.max(-1.3,Math.min(1.3,world_rotationX+dy*0.005));
    world_lastX=x; world_lastY=y;
    world_velocityHistory.push({x,t:performance.now()});
    if(world_velocityHistory.length>8) world_velocityHistory.shift();
  };
  const onUp=(clientX,clientY)=>{
    world_dragging=false; canvas.style.cursor='grab';
    cancelHoldTimer();
    if(!moved){
      // Un simple tap ne touche JAMAIS à la rotation en cours — ni pour l'arrêter, ni
      // pour la relancer — il ne fait que vérifier si un pays a été touché.
      handleWorldClick(clientX,clientY);
    }else if(world_velocityHistory.length>=2){
      // Vélocité calculée sur les derniers échantillons -> effet toupie, le globe
      // continue sur sa lancée après le relâchement, sans ralentir de lui-même.
      const first=world_velocityHistory[0], last=world_velocityHistory[world_velocityHistory.length-1];
      const dt=(last.t-first.t)||16;
      const dx=last.x-first.x;
      let v=(dx/dt)*16*0.005;
      world_spinVelocityY=Math.max(-0.15,Math.min(0.15,v)); // borne raisonnable, évite un flick délirant
      world_autoRotate=false; // le contrôle passe définitivement à la vélocité de spin
    }
  };

  canvas.addEventListener('mousedown',e=>onDown(e.clientX,e.clientY));
  canvas.addEventListener('mousemove',e=>onMove(e.clientX,e.clientY));
  window.addEventListener('mouseup',e=>{ if(world_dragging) onUp(e.clientX,e.clientY); });

  canvas.addEventListener('touchstart',e=>{ const t=e.touches[0]; onDown(t.clientX,t.clientY); },{passive:true});
  canvas.addEventListener('touchmove',e=>{ const t=e.touches[0]; onMove(t.clientX,t.clientY); },{passive:true});
  canvas.addEventListener('touchend',e=>{ const t=e.changedTouches[0]; if(world_dragging) onUp(t.clientX,t.clientY); });

  // Clavier — n'importe quelle touche maintenue 2 secondes arrête aussi la rotation
  canvas.addEventListener('keydown',()=>{
    if(world_keyHoldTimer) return; // déjà en cours (répétition automatique du navigateur sur touche maintenue)
    world_keyHoldTimer=setTimeout(()=>{ world_spinVelocityY=0; world_autoRotate=false; },2000);
  });
  canvas.addEventListener('keyup',()=>{ clearTimeout(world_keyHoldTimer); world_keyHoldTimer=null; });
}

function handleWorldClick(clientX,clientY){
  const canvas=document.getElementById('world-canvas');
  const rect=canvas.getBoundingClientRect();
  const mouse=new THREE.Vector2(
    ((clientX-rect.left)/rect.width)*2-1,
    -((clientY-rect.top)/rect.height)*2+1
  );
  const raycaster=new THREE.Raycaster();
  raycaster.setFromCamera(mouse,world_camera);
  const hitSphere=world_globeGroup.getObjectByName('world-hit-sphere');
  const intersects=raycaster.intersectObject(hitSphere);
  if(!intersects.length) return;

  // Le point d'intersection est en coordonnées locales du groupe (qui tourne) —
  // on annule la rotation pour retrouver la vraie position sur le globe non tourné.
  const localPoint=intersects[0].point.clone();
  world_globeGroup.worldToLocal(localPoint);
  const {lat,lng}=vector3ToLatLng(localPoint);

  const props=findCountryAt(lat,lng);
  if(props){
    const isoCode = props['ISO3166-1-Alpha-3'] || props['ISO3166-1-Alpha-2'] || props.ISO_A3 || props.ISO_A2 || null;
    const countryLabel = props.name || props.ADMIN || props.NAME || 'Pays';
    showWorldCountryInfo(countryLabel, (isoCode && isoCode !== '-99') ? isoCode : null);
  }
}

let world_currentCountryData=null;

async function showWorldCountryInfo(countryName, isoCode){
  const panel=document.getElementById('world-info-panel');
  const title=document.getElementById('world-info-title');
  const body=document.getElementById('world-info-body');
  panel.style.display='block';
  title.textContent=countryName;
  body.innerHTML='<div style="color:rgba(139,92,246,.4)">Chargement...</div>';
  world_currentCountryData=null;

  try{
    const isoParam = isoCode ? `?iso=${encodeURIComponent(isoCode)}` : '';
    const data=await apiCall('/country/'+encodeURIComponent(countryName)+isoParam);
    world_currentCountryData=data;
    let html='';
    if(data.population) html+=`<div>👥 <b>${data.population.toLocaleString('fr')}</b> habitants</div>`;
    if(data.capital) html+=`<div>🏛️ Capitale : <b>${data.capital}</b></div>`;
    if(data.region) html+=`<div>🌍 ${data.region}${data.subregion?' — '+data.subregion:''}</div>`;
    if(data.languages && data.languages.length) html+=`<div>🗣️ ${data.languages.join(', ')}</div>`;
    if(data.current_weather) html+=`<div style="margin-top:8px">🌤️ ${data.current_weather}</div>`;
    if(data.recent_activity) html+=`<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(139,92,246,.15)">${data.recent_activity}</div>`;
    if(data.capital_lat!=null && data.capital_lng!=null){
      html+=`<button onclick="showCapitalBuildings()" class="access-btn" style="width:100%;margin-top:10px;font-size:11px">🏙️ Voir les bâtiments de la capitale</button>`;
    }
    body.innerHTML=html || '<div style="color:rgba(139,92,246,.4)">Aucune information disponible.</div>';
  }catch(e){
    body.innerHTML='<div style="color:#f87171">Informations indisponibles pour ce pays.</div>';
  }
}

function worldLoop(){
  const modal=document.getElementById('world-modal');
  if(!modal || modal.style.display==='none'){ world_animating=false; return; }
  if(world_autoRotate){
    world_rotationY+=0.0008;
  }else if(Math.abs(world_spinVelocityY)>0.00005){
    // Pas de frottement volontaire — "comme une toupie", continue indéfiniment
    // jusqu'à l'arrêt explicite par pression longue (souris/tactile/clavier).
    world_rotationY+=world_spinVelocityY;
  }
  if(world_globeGroup){ world_globeGroup.rotation.y=world_rotationY; world_globeGroup.rotation.x=world_rotationX; }
  if(world_renderer && world_scene && world_camera) world_renderer.render(world_scene,world_camera);
  requestAnimationFrame(worldLoop);
}

async function showCapitalBuildings(){
  const data=world_currentCountryData;
  if(!data || data.capital_lat==null || data.capital_lng==null)return;
  const btn=document.querySelector('#world-info-body button');
  if(btn){ btn.disabled=true; btn.textContent='Chargement des bâtiments...'; }
  try{
    const geo=await apiCall(`/places/buildings-nearby?lat=${data.capital_lat}&lng=${data.capital_lng}&radius=200&coord_format=local`);
    showHolographicLocation({
      location_name:data.capital||data.official_name||'Capitale',
      lat:data.capital_lat, lng:data.capital_lng,
      buildings:geo.buildings||[], roads:geo.roads||[],
    });
  }catch(e){
    // Échec silencieux — le panneau pays reste utilisable même sans les bâtiments
  }finally{
    if(btn){ btn.disabled=false; btn.textContent='🏙️ Voir les bâtiments de la capitale'; }
  }
}

function closeWorldPanel(){
  document.getElementById('world-modal').style.display='none';
}
