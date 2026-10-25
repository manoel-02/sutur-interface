// ── PANNEAU WORLD — globe 3D rotatif, frontières réelles, clic pays ────────
// Frontières issues de Natural Earth 1:110m (licence ISC, via world-atlas),
// servies depuis l'application : 169 Ko au lieu des 14,6 Mo du jeu de données
// haute définition qui était chargé depuis raw.githubusercontent à chaque
// session — plusieurs secondes de fil d'exécution bloqué au JSON.parse et un
// coût de data indéfendable sur un forfait mobile. Rendu dans le même thème
// holographique (violet/or/lignes lumineuses) que le reste de Sutur.
const WORLD_GEOJSON_URL='assets/countries-110m.geojson';
let world_scene=null, world_camera=null, world_renderer=null, world_globeGroup=null;
let world_earthTexture=null; // chargée une seule fois, réutilisée à chaque réouverture
const WORLD_EARTH_TEXTURE_URL='https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg';
let world_countryIndex=null;        // géométries prémâchées (longitudes déroulées + boîtes englobantes)
let world_borderPositions=null;     // tampon de segments de frontières, calculé une seule fois
let world_starfield=null;           // étoiles de fond : un seul objet, jamais empilé d'une ouverture à l'autre
let world_animating=false;
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

// Test de parité classique. Attend des coordonnées DÉROULÉES (voir unwrapRing) :
// sur des longitudes brutes, un anneau qui traverse l'antiméridien saute de +180
// à -180 et le test le croit étalé sur tout le globe.
function pointInRing(lng,lat,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
    const intersect=((yi>lat)!==(yj>lat)) && (lng < (xj-xi)*(lat-yi)/(yj-yi)+xi);
    if(intersect) inside=!inside;
  }
  return inside;
}

// Rend les longitudes d'un anneau continues : à chaque saut de plus de 180° entre
// deux sommets consécutifs on décale de 360°, ce qui remet la Russie, les Fidji et
// l'Antarctique d'un seul morceau au lieu de deux moitiés qui se chevauchent.
function unwrapRing(ring){
  const out=new Array(ring.length);
  out[0]=[ring[0][0],ring[0][1]];
  let shift=0, prev=ring[0][0];
  for(let i=1;i<ring.length;i++){
    const lng=ring[i][0], d=lng-prev;
    if(d>180) shift-=360; else if(d<-180) shift+=360;
    prev=lng;
    out[i]=[lng+shift,ring[i][1]];
  }
  return out;
}

function ringWithBox(pts){
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
  for(let i=0;i<pts.length;i++){
    const x=pts[i][0], y=pts[i][1];
    if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
  }
  return {pts,x0,x1,y0,y1};
}

// Prémâche le GeoJSON une fois pour toutes : anneaux déroulés, trous conservés à
// part, boîte englobante par anneau pour écarter la grande majorité des pays sans
// dérouler le test de parité.
function buildCountryIndex(data){
  const feats=[];
  for(const feature of (data&&data.features)||[]){
    const geom=feature.geometry;
    if(!geom) continue;
    const raw = geom.type==='Polygon' ? [geom.coordinates] : (geom.type==='MultiPolygon' ? geom.coordinates : []);
    const polys=[];
    for(const poly of raw){
      if(!poly||!poly.length||!poly[0]||poly[0].length<4) continue;
      const rings=poly.map(r=>ringWithBox(unwrapRing(r)));
      polys.push({outer:rings[0],holes:rings.slice(1)});
    }
    if(polys.length) feats.push({props:feature.properties||{},polys});
  }
  return feats;
}

function findCountryAt(lat,lng){
  if(!world_countryIndex) return null;
  for(const feat of world_countryIndex){
    for(const poly of feat.polys){
      const o=poly.outer;
      if(lat<o.y0||lat>o.y1) continue;
      // Le point exprimé dans le repère déroulé de CET anneau : même longitude
      // modulo 360, ramenée au plus près de l'anneau.
      const x=lng+360*Math.round(((o.x0+o.x1)/2-lng)/360);
      if(x<o.x0||x>o.x1) continue;
      if(!pointInRing(x,lat,o.pts)) continue;
      // Un point tombant dans un trou (enclave type Lesotho, grand lac) n'est PAS
      // dans ce pays : on laisse la boucle continuer jusqu'à l'enclave elle-même,
      // qui est une entité à part dans le jeu de données.
      let inHole=false;
      for(const h of poly.holes){
        if(lat>=h.y0&&lat<=h.y1&&x>=h.x0&&x<=h.x1&&pointInRing(x,lat,h.pts)){ inHole=true; break; }
      }
      if(!inHole) return feat.props;
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

  if(!world_countryIndex){
    try{
      const resp=await fetch(WORLD_GEOJSON_URL);
      world_countryIndex=buildCountryIndex(await resp.json());
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

// Détacher un objet de la scène ne libère RIEN côté GPU : sans dispose(), chaque
// réouverture du globe laissait derrière elle sphère, halo, frontières et étoiles,
// et trois ou quatre cycles suffisaient à saturer la mémoire d'un téléphone.
// La texture Terre est volontairement épargnée : elle est mise en cache exprès
// pour ne pas être retéléchargée (material.dispose() ne touche pas aux textures).
function disposeWorldNode(node){
  if(!node) return;
  node.traverse(o=>{
    if(o.geometry) o.geometry.dispose();
    const m=o.material;
    if(m) (Array.isArray(m)?m:[m]).forEach(x=>x&&x.dispose());
  });
  if(node.parent) node.parent.remove(node);
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

  disposeWorldNode(world_globeGroup);
  world_globeGroup=new THREE.Group();

  // Étoiles de fond — un seul objet par ouverture. Elles restent dans la scène et
  // non dans le groupe pour ne pas tourner avec le globe.
  if(!world_starfield){
    const starPos=[];
    for(let i=0;i<600;i++) starPos.push((Math.random()-0.5)*80,(Math.random()-0.5)*80,(Math.random()-0.5)*80);
    const starGeo=new THREE.BufferGeometry();
    starGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(starPos),3));
    world_starfield=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xffffff,size:0.06,transparent:true,opacity:0.5}));
    world_scene.add(world_starfield);
  }

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
  const RADIUS=2.51;
  if(!world_borderPositions){
    // TOUTES les frontières dans un seul tampon de segments : un THREE.Line par
    // anneau, c'était des milliers d'appels de rendu à chaque image, pour un
    // résultat visuel identique. Les trous sont tracés aussi — sans eux, le
    // contour des enclaves et des grands lacs manquait à l'écran.
    const seg=[];
    for(const feat of world_countryIndex){
      for(const poly of feat.polys){
        for(const ring of [poly.outer].concat(poly.holes)){
          const pts=ring.pts;
          let prev=latLngToVector3(pts[0][1],pts[0][0],RADIUS);
          for(let i=1;i<pts.length;i++){
            const cur=latLngToVector3(pts[i][1],pts[i][0],RADIUS);
            seg.push(prev.x,prev.y,prev.z,cur.x,cur.y,cur.z);
            prev=cur;
          }
        }
      }
    }
    world_borderPositions=new Float32Array(seg);
  }
  // Contour doré, net et bien visible par-dessus la texture réelle — cohérent avec
  // le reste de l'identité visuelle de Sutur sans dénaturer les vraies couleurs du globe.
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(world_borderPositions,3));
  const borders=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0xffd966,transparent:true,opacity:0.85}));
  borders.name='world-borders';
  world_globeGroup.add(borders);
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
    // `iso` est le code numérique ISO 3166-1 du jeu de données Natural Earth (204
    // pour le Bénin) ; restcountries.com/v3.1/alpha l'accepte tel quel, et le
    // backend retombe sur la recherche par nom si le code ne donne rien.
    const isoCode = props.iso || props['ISO3166-1-Alpha-3'] || props['ISO3166-1-Alpha-2'] || props.ISO_A3 || props.ISO_A2 || null;
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
  // Libération immédiate de la mémoire GPU à la fermeture : le panneau peut être
  // réouvert des dizaines de fois dans une session, et tout est reconstruit à
  // l'ouverture de toute façon (les sommets des frontières, eux, restent en cache).
  disposeWorldNode(world_globeGroup); world_globeGroup=null;
  disposeWorldNode(world_starfield); world_starfield=null;
  if(world_renderer) world_renderer.renderLists.dispose();
}
