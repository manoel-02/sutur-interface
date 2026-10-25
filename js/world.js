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

// Zoom : la molette, le pincement et le clavier ne déplacent que la CIBLE, et la
// boucle de rendu rapproche la distance réelle par amorti. Sans ça, chaque cran de
// molette était un saut sec, et le pincement tactile un tremblement.
const WORLD_RADIUS=2.5;
const WORLD_CAM_DEFAULT=7;
const WORLD_CAM_MIN=WORLD_RADIUS*1.2;  // au plus près : la Terre déborde largement du cadre
const WORLD_CAM_MAX=WORLD_RADIUS*8;    // au plus loin : le globe reste assez gros pour être visé du doigt
let world_camDist=WORLD_CAM_DEFAULT, world_camDistTarget=WORLD_CAM_DEFAULT;
let world_pinchStartDist=null;      // écart entre les deux doigts au début du pincement
let world_pinchStartCam=0;          // distance caméra au même instant, base du rapport

// Couches planétaires vivantes (avions, séismes, lancements) posées sur le globe.
let world_markerGroup=null;         // UN seul groupe, deux objets fusionnés dedans — jamais un Mesh par objet
let world_markerPoints=null;        // le nuage de marqueurs, cible du raycasting
let world_markerMaterial=null;      // gardé à part : l'échelle en pixels dépend de la taille du canvas
let world_markerData=[];            // index aligné sur les sommets du nuage -> point + item d'origine
let world_activeLayer=null;         // couche affichée, ou null
let world_layerBusy=false;          // un appel /geo/* en cours : pas deux en parallèle
let world_selectedMarker=-1;        // marqueur dont le panneau est ouvert, pour le bouton « pays en dessous »
let world_pendingChatLayer=null;    // points venus d'une réponse de chat, en attente d'un geste de sa part

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
  const hint=document.getElementById('world-hint');
  if(hint) hint.classList.remove('gone');
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
  // Chaque ouverture repart de la vue d'ensemble : retrouver le globe au niveau de
  // zoom où on l'avait laissé, sans savoir sur quoi il est centré, désoriente.
  world_camDist=world_camDistTarget=WORLD_CAM_DEFAULT;
  world_camera.position.set(0,0,world_camDist);

  // Les marqueurs vivent DANS le groupe qui va être détruit juste après : les libérer
  // ici évite de garder des références vers des objets déjà déposés côté GPU.
  disposeGlobeMarkers();
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

// ── Surlignage ──────────────────────────────────────────────────────────────
// Sélectionner un pays sans le voir se détacher, c'est deviner si on a touché le
// bon : le contour du pays choisi (ou de tout un continent) passe en violet, au
// ras de la surface.

let world_highlight=null;

function worldFeatureSegments(feats,radius){
  const seg=[];
  for(const feat of feats){
    for(const poly of feat.polys){
      for(const ring of [poly.outer].concat(poly.holes)){
        const pts=ring.pts;
        let prev=latLngToVector3(pts[0][1],pts[0][0],radius);
        for(let i=1;i<pts.length;i++){
          const cur=latLngToVector3(pts[i][1],pts[i][0],radius);
          seg.push(prev.x,prev.y,prev.z,cur.x,cur.y,cur.z);
          prev=cur;
        }
      }
    }
  }
  return new Float32Array(seg);
}

function worldClearHighlight(){
  if(!world_highlight) return;
  if(world_globeGroup) world_globeGroup.remove(world_highlight);
  disposeWorldNode(world_highlight);
  world_highlight=null;
}

/** Surligne un ou plusieurs pays. `names` : noms tels qu'ils figurent dans le jeu de données. */
function worldHighlightCountries(names){
  worldClearHighlight();
  if(!names||!names.length||!world_countryIndex||!world_globeGroup) return 0;
  const want=new Set(names.map(n=>String(n).toLowerCase()));
  const feats=world_countryIndex.filter(f=>{
    const n=(f.props.name||f.props.ADMIN||f.props.NAME||'').toLowerCase();
    return want.has(n);
  });
  if(!feats.length) return 0;
  // 2,515 contre 2,51 pour les frontières : juste assez pour passer devant sans
  // se détacher visiblement de la surface.
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(worldFeatureSegments(feats,2.515),3));
  world_highlight=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({
    color:0xa294ff,transparent:true,opacity:0.95,depthTest:true,
  }));
  world_globeGroup.add(world_highlight);
  return feats.length;
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

// ── COUCHES PLANÉTAIRES VIVANTES SUR LE GLOBE ──────────────────────────────
// Les mêmes points que la carte plate recevait déjà (voir showMapPoints), posés
// cette fois à leur lat/lng sur la sphère. Tout tient dans deux objets : un nuage
// de points pour les marqueurs, un tampon de segments pour les caps. Une version
// antérieure créait un Mesh par objet — 4 274 objets, autant d'appels de rendu par
// image, et un téléphone de milieu de gamme à genoux.
const WORLD_MARKER_RADIUS=2.53; // juste au-dessus de la surface, sous les frontières dorées
const WORLD_LAYER_STYLE={
  aircraft:{color:[0.00,0.83,1.00], size:0.055},
  quakes:  {color:[0.97,0.44,0.44], size:0.065},
  launches:{color:[0.79,0.64,0.15], size:0.075},
  default: {color:[0.55,0.36,0.96], size:0.055},
};

// Le backend nomme ses couches au pluriel ; une réponse plus ancienne pouvait
// envoyer « quake » ou « launch » au singulier dans point.kind.
function normalizeGlobeLayer(layer){
  const k=String(layer||'').toLowerCase();
  if(k==='quake') return 'quakes';
  if(k==='launch') return 'launches';
  return k;
}

// Un marqueur sur la face cachée du globe ne doit PAS se voir : vu de l'extérieur,
// un point qui traverse la Terre casse immédiatement l'illusion. Le test est le même
// dans les deux nuanceurs : la normale du marqueur — sa position, le globe étant
// centré sur l'origine — contre la direction vers la caméra, qui est à l'origine en
// espace vue. Le faire sur le GPU évite de reparcourir les marqueurs à chaque image.
const WORLD_FACING_GLSL=[
  'float worldFacing(vec3 localPos,vec3 viewPos){',
  '  vec3 n=normalize(normalMatrix*normalize(localPos));',
  '  return dot(n,normalize(-viewPos));',
  '}',
].join('\n');

function makeGlobeMarkerMaterial(pixelScale){
  return new THREE.ShaderMaterial({
    uniforms:{
      uScale:{value:pixelScale},
      // Bornes en pixels : assez gros pour être visé au doigt même quand le globe
      // est loin, assez petit pour ne pas devenir une tache une fois zoomé à fond.
      uMinPx:{value:7},
      uMaxPx:{value:34},
    },
    vertexShader:[
      'attribute vec3 aColor;',
      'attribute float aSize;',
      'uniform float uScale;',
      'uniform float uMinPx;',
      'uniform float uMaxPx;',
      'varying vec3 vColor;',
      'varying float vOn;',
      WORLD_FACING_GLSL,
      'void main(){',
      '  vColor=aColor;',
      '  vec4 mv=modelViewMatrix*vec4(position,1.0);',
      '  vOn=worldFacing(position,mv.xyz)>0.0?1.0:0.0;',
      '  gl_Position=projectionMatrix*mv;',
      // Même atténuation en perspective que PointsMaterial de Three (taille en
      // unités monde divisée par la profondeur), pour que le zoom grossisse
      // naturellement les marqueurs avec le globe.
      '  gl_PointSize=vOn*clamp(aSize*uScale/max(0.001,-mv.z),uMinPx,uMaxPx);',
      '}',
    ].join('\n'),
    fragmentShader:[
      'varying vec3 vColor;',
      'varying float vOn;',
      'void main(){',
      '  if(vOn<0.5) discard;',
      '  float r=length(gl_PointCoord-vec2(0.5))*2.0;',
      '  if(r>1.0) discard;',
      // Noyau clair cerné d'un halo qui s'éteint : lisible aussi bien sur l'océan
      // sombre que sur une zone claire de la texture, sans contour tracé à part.
      '  float core=1.0-smoothstep(0.30,0.52,r);',
      '  float halo=1.0-smoothstep(0.52,1.0,r);',
      '  gl_FragColor=vec4(mix(vColor,vec3(1.0),core*0.6),max(core,halo*0.42));',
      '}',
    ].join('\n'),
    transparent:true,
    depthTest:true,
    depthWrite:false, // un marqueur ne doit jamais masquer celui qui est derrière lui
  });
}

function makeGlobeHeadingMaterial(color){
  return new THREE.ShaderMaterial({
    uniforms:{uColor:{value:new THREE.Color(color[0],color[1],color[2])}},
    vertexShader:[
      // Le test de face cachée porte sur l'ANCRE du trait (le marqueur), pas sur
      // chaque sommet : sinon la pointe du cap disparaît avant sa base quand
      // l'avion passe le limbe, et le trait semble se couper en deux.
      'attribute vec3 aAnchor;',
      'varying float vOn;',
      WORLD_FACING_GLSL,
      'void main(){',
      '  vec4 anchorMv=modelViewMatrix*vec4(aAnchor,1.0);',
      '  vOn=worldFacing(aAnchor,anchorMv.xyz)>0.0?1.0:0.0;',
      '  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);',
      '}',
    ].join('\n'),
    fragmentShader:[
      'uniform vec3 uColor;',
      'varying float vOn;',
      'void main(){',
      '  if(vOn<0.5) discard;',
      '  gl_FragColor=vec4(uColor,0.85);',
      '}',
    ].join('\n'),
    transparent:true,
    depthWrite:false,
  });
}

// Les items d'une réponse /geo/* portent le détail complet (vitesse, profondeur,
// pas de tir) que les points n'ont pas. Les deux listes ne sont pas forcément de
// même longueur — un lancement sans coordonnées de pas de tir est compté dans les
// items et absent des points — donc l'appariement se fait sur les coordonnées,
// seul lien fiable entre elles.
function indexGeoItems(items){
  if(!Array.isArray(items)) return null;
  const index={};
  for(const it of items){
    if(!it||it.lat==null||it.lng==null) continue;
    index[Number(it.lat).toFixed(4)+','+Number(it.lng).toFixed(4)]=it;
  }
  return index;
}

// Vecteurs de travail réutilisés plutôt que réalloués : ce test tourne à chaque
// clic et pour chaque marqueur. Ils ne peuvent pas être créés au chargement du
// fichier — Three.js n'est téléchargé qu'à la première ouverture du globe.
let worldScratchA=null, worldScratchB=null;

function disposeGlobeMarkers(){
  disposeWorldNode(world_markerGroup);
  world_markerGroup=null;
  world_markerPoints=null;
  world_markerMaterial=null;
  world_markerData=[];
  world_selectedMarker=-1;
}

function showGlobePoints(points,layer,items){
  disposeGlobeMarkers();
  if(!world_globeGroup||!Array.isArray(points)) return 0;
  const kind=normalizeGlobeLayer(layer);
  const style=WORLD_LAYER_STYLE[kind]||WORLD_LAYER_STYLE.default;
  const byCoord=indexGeoItems(items);

  const usable=[];
  for(const p of points){
    if(!p||p.lat==null||p.lng==null) continue;
    const lat=Number(p.lat), lng=Number(p.lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180) continue;
    const item=byCoord?byCoord[lat.toFixed(4)+','+lng.toFixed(4)]:null;
    usable.push({lat,lng,kind:normalizeGlobeLayer(p.kind)||kind,label:p.label,detail:p.detail,heading:p.heading,item:item||null});
  }
  if(!usable.length) return 0;

  const n=usable.length;
  const pos=new Float32Array(n*3), col=new Float32Array(n*3), siz=new Float32Array(n);
  const headPos=[], headAnchor=[];
  for(let i=0;i<n;i++){
    const d=usable[i];
    const st=WORLD_LAYER_STYLE[d.kind]||style;
    const v=latLngToVector3(d.lat,d.lng,WORLD_MARKER_RADIUS);
    pos[i*3]=v.x; pos[i*3+1]=v.y; pos[i*3+2]=v.z;
    col[i*3]=st.color[0]; col[i*3+1]=st.color[1]; col[i*3+2]=st.color[2];
    // Un séisme plus fort est un marqueur plus gros : la magnitude est l'information
    // principale de cette couche, elle doit se lire sans ouvrir le panneau.
    const mag=d.item?Number(d.item.magnitude):Number(String(d.label||'').replace(/^M/,''));
    siz[i]=(d.kind==='quakes'&&Number.isFinite(mag))?st.size*(0.7+Math.min(mag,8)/8):st.size;

    // Number(null) vaut 0 : sans ce garde-fou, un cap ABSENT passait pour un cap
    // plein nord et chaque séisme se retrouvait fléché.
    const h=(d.heading==null||d.heading==='')?NaN:Number(d.heading);
    if(Number.isFinite(h)){
      // Cap tracé comme un court trait tangent à la sphère : nord et est locaux
      // obtenus par différence finie, ce qui évite de redériver la convention de
      // latLngToVector3 à la main et de se tromper de signe.
      const latSafe=Math.max(-89.5,Math.min(89.5,d.lat));
      const north=latLngToVector3(latSafe+0.3,d.lng,WORLD_MARKER_RADIUS).sub(v).normalize();
      const east=latLngToVector3(latSafe,d.lng+0.3,WORLD_MARKER_RADIUS).sub(v).normalize();
      const rad=h*Math.PI/180;
      const dir=north.multiplyScalar(Math.cos(rad)).add(east.multiplyScalar(Math.sin(rad))).normalize();
      const tip=v.clone().add(dir.multiplyScalar(0.095));
      headPos.push(v.x,v.y,v.z,tip.x,tip.y,tip.z);
      headAnchor.push(v.x,v.y,v.z,v.x,v.y,v.z);
    }
  }

  world_markerGroup=new THREE.Group();
  world_markerGroup.name='world-markers';

  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  geo.setAttribute('aColor',new THREE.BufferAttribute(col,3));
  geo.setAttribute('aSize',new THREE.BufferAttribute(siz,1));
  // L'échelle en pixels de Three dépend de la hauteur du tampon de dessin ; elle est
  // lue ici, après que le rendu a été dimensionné pour cette ouverture.
  const bufferHeight=(world_renderer&&world_renderer.domElement&&world_renderer.domElement.height)||600;
  world_markerMaterial=makeGlobeMarkerMaterial(bufferHeight*0.5);
  world_markerPoints=new THREE.Points(geo,world_markerMaterial);
  world_markerPoints.name='world-marker-points';
  world_markerGroup.add(world_markerPoints);

  if(headPos.length){
    const hg=new THREE.BufferGeometry();
    hg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(headPos),3));
    hg.setAttribute('aAnchor',new THREE.BufferAttribute(new Float32Array(headAnchor),3));
    world_markerGroup.add(new THREE.LineSegments(hg,makeGlobeHeadingMaterial(style.color)));
  }

  world_globeGroup.add(world_markerGroup);
  world_markerData=usable;
  return n;
}

// Même règle que le nuanceur, côté JavaScript : elle sert au clic (un marqueur
// caché derrière la Terre ne doit pas être cliquable non plus).
function globeMarkerFacesCamera(i){
  if(!world_markerPoints||!world_globeGroup||!world_camera) return false;
  const attr=world_markerPoints.geometry.attributes.position;
  if(i<0||i>=attr.count) return false;
  if(!worldScratchA){ worldScratchA=new THREE.Vector3(); worldScratchB=new THREE.Vector3(); }
  const p=worldScratchA.fromBufferAttribute(attr,i);
  const cam=worldScratchB.copy(world_camera.position);
  world_globeGroup.worldToLocal(cam);
  return p.dot(cam.sub(p))>0;
}

// ── Panneau d'un objet de couche ───────────────────────────────────────────

function globeInfoRow(icon,text){
  return '<div>'+icon+' '+escapeHtml(text)+'</div>';
}

function globeWhenLabel(value){
  const t=typeof value==='number'?value:Date.parse(value||'');
  if(!Number.isFinite(t)) return '';
  return new Date(t).toLocaleString('fr',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
}

function showGlobeMarkerInfo(i){
  const d=world_markerData[i];
  if(!d) return;
  world_selectedMarker=i;
  const panel=document.getElementById('world-info-panel');
  const title=document.getElementById('world-info-title');
  const body=document.getElementById('world-info-body');
  world_currentCountryData=null; // ce panneau ne décrit plus un pays : le bouton capitale n'a plus de sens
  const it=d.item||{};
  let html='';
  if(d.kind==='aircraft'){
    title.textContent='✈ '+(d.label||it.callsign||it.registration||'Avion');
    if(it.model) html+=globeInfoRow('🛩️',it.model+(it.registration?' · '+it.registration:''));
    if(it.on_ground) html+=globeInfoRow('🛬','Au sol');
    else if(it.altitude_m!=null) html+=globeInfoRow('📏',it.altitude_m+' m d\'altitude');
    else if(d.detail) html+=globeInfoRow('📏',d.detail);
    if(it.speed_kmh!=null) html+=globeInfoRow('💨',it.speed_kmh+' km/h');
    const head=(d.heading==null||d.heading==='')?NaN:Number(d.heading);
    if(Number.isFinite(head)) html+=globeInfoRow('🧭','Cap '+Math.round(head)+'°');
    if(it.distance_km!=null) html+=globeInfoRow('📍',it.distance_km+' km'+(it.direction?' au '+it.direction:''));
    if(it.emergency&&it.emergency!=='none') html+='<div style="color:#f87171;margin-top:6px">⚠️ Urgence déclarée : '+escapeHtml(it.emergency)+'</div>';
  }else if(d.kind==='quakes'){
    title.textContent='◉ Séisme '+(d.label||'');
    if(it.magnitude!=null) html+=globeInfoRow('📊','Magnitude '+it.magnitude);
    html+=globeInfoRow('📍',it.place||d.detail||'lieu inconnu');
    if(it.depth_km!=null) html+=globeInfoRow('⬇️',it.depth_km+' km de profondeur');
    const when=globeWhenLabel(it.time_ms!=null?it.time_ms:it.time);
    if(when) html+=globeInfoRow('🕒',when);
    if(it.distance_km!=null) html+=globeInfoRow('📏',it.distance_km+' km de toi');
  }else if(d.kind==='launches'){
    title.textContent='▲ '+(d.label||it.name||'Lancement');
    if(it.provider) html+=globeInfoRow('🏢',it.provider);
    if(it.pad) html+=globeInfoRow('🚀','Pas de tir : '+it.pad);
    if(it.location||d.detail) html+=globeInfoRow('📍',it.location||d.detail);
    const when=globeWhenLabel(it.net);
    if(when) html+=globeInfoRow('🕒',when);
    if(it.status) html+=globeInfoRow('📋',it.status);
  }else{
    title.textContent=d.label||'Objet';
    if(d.detail) html+=globeInfoRow('📍',d.detail);
  }
  html+='<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(139,92,246,.15);font-size:11px;color:rgba(160,151,196,.6)">'
    +escapeHtml(d.lat.toFixed(3)+'°, '+d.lng.toFixed(3)+'°')+'</div>';
  // Le pays sous l'objet passe par le chemin pays existant, celui du clic sur la
  // carte : même requête, même panneau, rien de parallèle à maintenir.
  html+='<button onclick="showCountryUnderGlobeMarker()" class="access-btn" style="width:100%;margin-top:10px;font-size:11px">🌍 Le pays en dessous</button>';
  panel.style.display='block';
  body.innerHTML=html;
}

function showCountryUnderGlobeMarker(){
  const d=world_markerData[world_selectedMarker];
  if(!d) return;
  const props=findCountryAt(d.lat,d.lng);
  if(!props){
    document.getElementById('world-info-body').innerHTML=
      '<div style="color:rgba(160,151,196,.75)">Cet objet est au-dessus de l\'eau ou d\'une zone sans pays — rien à ouvrir en dessous.</div>';
    return;
  }
  const isoCode=props.iso||props['ISO3166-1-Alpha-3']||props['ISO3166-1-Alpha-2']||props.ISO_A3||props.ISO_A2||null;
  showWorldCountryInfo(props.name||props.ADMIN||props.NAME||'Pays',(isoCode&&isoCode!=='-99')?isoCode:null);
}

// ── Contrôle de couches ────────────────────────────────────────────────────
// Une seule couche à la fois : le backend répond par couche, et superposer avions
// et séismes sur une sphère de 2,5 unités donne un amas illisible sur un écran de
// 360 px. Retoucher la couche active l'enlève.
const GLOBE_LAYERS={
  aircraft:{
    label:'Avions',
    // La couche suit le dernier pays ouvert quand il y en a un : l'ADS-B est borné à
    // 463 km de rayon, « les avions du monde » n'existe pas côté source.
    query:()=>{
      const c=world_currentCountryData;
      if(c&&c.capital_lat!=null&&c.capital_lng!=null){
        return '/geo/aircraft?lat='+c.capital_lat+'&lng='+c.capital_lng
          +'&place='+encodeURIComponent(c.capital||'')+'&radius_km=400&limit=40';
      }
      return '/geo/aircraft?radius_km=400&limit=40';
    },
    count:(n,data)=>n+(n>1?' avions':' avion')+(data.location_name?' autour de '+data.location_name:''),
    nothing:(data)=>'Aucun avion capté autour de '+(data.location_name||'ce point')
      +' — la couverture ADS-B est mince par ici, ce n\'est pas une panne.',
  },
  quakes:{
    label:'Séismes',
    query:()=>'/geo/quakes?min_magnitude=2.5&limit=50',
    count:(n)=>n+(n>1?' séismes':' séisme')+' sur 24 h',
    nothing:()=>'Aucun séisme au-dessus de M2.5 depuis 24 h. Rien à afficher, rien de cassé.',
  },
  launches:{
    label:'Lancements',
    query:()=>'/geo/launches?limit=20',
    count:(n)=>n+(n>1?' lancements à venir':' lancement à venir'),
    nothing:(data)=>(data.count>0)
      ? data.count+' lancement(s) annoncé(s), aucun avec un pas de tir localisé.'
      : 'Aucun lancement orbital annoncé pour le moment.',
  },
};

const GLOBE_STATUS_COLOR={load:'rgba(160,151,196,.75)',ok:'rgba(201,162,39,.9)',empty:'rgba(160,151,196,.75)',err:'#f87171'};

function setGlobeLayerStatus(text,tone){
  const el=document.getElementById('world-layer-status');
  if(!el) return;
  if(!text){ el.style.display='none'; el.textContent=''; return; }
  el.style.display='block';
  el.style.color=GLOBE_STATUS_COLOR[tone]||GLOBE_STATUS_COLOR.load;
  el.textContent=text; // textContent et non innerHTML : ce texte contient des noms de lieux venus du réseau
}

function paintGlobeLayerButtons(){
  for(const id of Object.keys(GLOBE_LAYERS)){
    const btn=document.getElementById('world-layer-'+id);
    if(btn) btn.classList.toggle('on',world_activeLayer===id);
  }
}

function nowHHMM(){
  return new Date().toLocaleTimeString('fr',{hour:'2-digit',minute:'2-digit'});
}

async function toggleGlobeLayer(layer){
  if(world_activeLayer===layer&&!world_layerBusy){
    world_activeLayer=null;
    disposeGlobeMarkers();
    paintGlobeLayerButtons();
    setGlobeLayerStatus('');
    return;
  }
  await loadGlobeLayer(layer);
}

async function refreshGlobeLayer(){
  if(!world_activeLayer){
    setGlobeLayerStatus('Choisis d\'abord une couche à afficher.','load');
    return;
  }
  await loadGlobeLayer(world_activeLayer);
}

async function loadGlobeLayer(layer){
  const def=GLOBE_LAYERS[layer];
  if(!def||world_layerBusy) return;
  world_layerBusy=true;
  world_activeLayer=layer;
  world_pendingChatLayer=null; // une lecture directe remplace ce qui venait du chat
  paintGlobeLayerButtons();
  setGlobeLayerStatus(def.label+' — lecture en cours...','load');
  try{
    const data=await apiCall(def.query());
    if(world_activeLayer!==layer) return; // il a changé de couche pendant l'appel : sa dernière intention gagne
    const n=showGlobePoints(data.points||[],layer,data.items||null);
    // Zéro objet n'est pas une erreur : la source peut honnêtement n'avoir rien vu.
    // Le dire tel quel, sinon un globe vide passe pour une panne.
    setGlobeLayerStatus(n?(def.count(n,data)+' · lu à '+nowHHMM()):def.nothing(data),n?'ok':'empty');
  }catch(e){
    showGlobePoints([],layer);
    // Les routes /geo/* renvoient une raison précise (« adsb.lol a répondu 503 »),
    // nettement plus utile que le « problème côté serveur » générique : on la montre
    // quand il y en a une, et on retombe sur la classification commune sinon.
    const why=(e&&e.kind==='server'&&e.message&&e.message.length<140)?e.message:describeApiError(e);
    setGlobeLayerStatus(def.label+' : '+why,'err');
  }finally{
    world_layerBusy=false;
  }
}

// ── Couche venue d'une réponse de chat ─────────────────────────────────────
// Elle n'ouvre PAS le globe d'autorité. Sur téléphone, le modal couvre tout
// l'écran : le faire surgir au milieu d'une conversation, c'est la lui voler. Les
// points sont déjà posés sur la carte plate dans le fil (comportement d'avant,
// inchangé), et le globe reste à un geste près. Seule exception : s'il a déjà le
// globe ouvert, c'est qu'il regarde le globe — on y pose les objets directement.
const GLOBE_CHAT_LAYERS=['aircraft','quakes','launches'];

function worldModalIsOpen(){
  const m=document.getElementById('world-modal');
  return !!(m&&m.style.display!=='none'&&m.style.display!=='');
}

function offerGlobeForChatLayer(map){
  const btn=document.getElementById('persistent-map-globe-btn');
  const layer=normalizeGlobeLayer(map&&map.layer);
  const points=(map&&Array.isArray(map.points))?map.points:[];
  if(!points.length||GLOBE_CHAT_LAYERS.indexOf(layer)<0){
    if(btn) btn.style.display='none';
    world_pendingChatLayer=null;
    return;
  }
  world_pendingChatLayer={points,layer,name:map.location_name||''};
  if(worldModalIsOpen()&&world_globeGroup){
    applyPendingChatLayer();
    if(btn) btn.style.display='none';
    return;
  }
  if(btn) btn.style.display='block';
}

function applyPendingChatLayer(){
  const pending=world_pendingChatLayer;
  if(!pending) return;
  const n=showGlobePoints(pending.points,pending.layer);
  world_activeLayer=pending.layer;
  paintGlobeLayerButtons();
  const def=GLOBE_LAYERS[pending.layer];
  setGlobeLayerStatus(n?((def?def.count(n,{location_name:pending.name,count:n}):n+' objets')+' · de ta question')
    :'Rien à poser sur le globe pour cette réponse.',n?'ok':'empty');
}

async function showPendingChatLayerOnGlobe(){
  if(!world_pendingChatLayer) return;
  const btn=document.getElementById('persistent-map-globe-btn');
  if(btn) btn.style.display='none';
  await openWorldPanel();
  if(!world_globeGroup) return; // l'ouverture a échoué : son propre message est déjà à l'écran
  applyPendingChatLayer();
}

// ── Zoom ───────────────────────────────────────────────────────────────────

function worldZoomBy(factor){
  const d=world_camDistTarget*factor;
  world_camDistTarget=Math.max(WORLD_CAM_MIN,Math.min(WORLD_CAM_MAX,d));
}

// Zoomé, un même glissement doit couvrir moins de longitude, sinon le globe fuit
// sous le doigt ; dézoomé, il en couvre plus, puisqu'il paraît plus petit.
function worldDragScale(){
  return Math.max(0.3,Math.min(2.5,world_camDist/WORLD_CAM_DEFAULT));
}

function worldTouchSpread(touches){
  const dx=touches[0].clientX-touches[1].clientX;
  const dy=touches[0].clientY-touches[1].clientY;
  return Math.hypot(dx,dy);
}

// ── Manipulation du globe ───────────────────────────────────────────────────
//
// Un seul système d'événements (Pointer Events) pour la souris, le doigt et le
// stylet : avant, deux jeux d'écouteurs séparés se marchaient dessus dès qu'un
// second doigt arrivait. Et `touch-action:none` sur le canevas est ce qui empêche
// la page de défiler pendant qu'on fait tourner le globe au doigt — c'était le
// défaut le plus agaçant sur téléphone.
//
// L'inertie est AMORTIE. Avant, la rotation lancée ne s'arrêtait jamais d'elle-même
// et il fallait maintenir l'appui deux secondes pour la figer : impossible de lire
// un pays tranquillement, et personne ne devine ce geste. Elle ralentit maintenant
// toute seule, et le moindre contact l'arrête net — c'est ce que fait n'importe
// quel globe qu'on a déjà manipulé.

const WORLD_FRICTION = 0.935;        // ~1,5 s pour s'immobiliser après un lancer franc
const WORLD_SPIN_FLOOR = 0.00012;    // en dessous, on considère le globe arrêté
const WORLD_TAP_SLOP = 5;            // px : au-delà c'est un glissement, pas un tap
const WORLD_DOUBLE_MS = 300;

let world_pointers = new Map();      // pointeurs actifs, pour distinguer glisser et pincer
let world_lastTapAt = 0;
let world_hoverIso = null;

function worldZoomBy(factor){
  const d=world_camDistTarget*factor;
  world_camDistTarget=Math.max(WORLD_CAM_MIN,Math.min(WORLD_CAM_MAX,d));
}

// Zoomé, un même glissement doit couvrir moins de longitude, sinon le globe fuit
// sous le doigt ; dézoomé, il en couvre plus, puisqu'il paraît plus petit.
function worldDragScale(){
  return Math.max(0.3,Math.min(2.5,world_camDist/WORLD_CAM_DEFAULT));
}

/** Arrête net la rotation en cours. Tout contact le fait : c'est le geste attendu. */
function worldHalt(){
  world_spinVelocityY=0;
  world_autoRotate=false;
}

function worldPinchSpread(){
  const pts=[...world_pointers.values()];
  if(pts.length<2) return 0;
  return Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
}

/** L'aide a rempli son rôle dès le premier geste ; ensuite elle couvre le globe. */
function worldDismissHint(){
  const el=document.getElementById('world-hint');
  if(el && !el.classList.contains('gone')) el.classList.add('gone');
}

function setupWorldControls(){
  const canvas=document.getElementById('world-canvas');
  if(canvas._worldControlsBound) return;
  canvas._worldControlsBound=true;
  canvas.setAttribute('tabindex','0');
  canvas.style.touchAction='none';   // le navigateur ne vole plus le geste
  canvas.style.cursor='grab';

  let moved=false, downX=0, downY=0, downAt=0;

  const onDown=(e)=>{
    world_pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(world_pointers.size===2){
      // Deuxième doigt : on passe en pincement et on abandonne le glissement en cours,
      // sinon poser le doigt fait sauter le globe d'un coup sec.
      world_dragging=false;
      world_pinchStartDist=worldPinchSpread()||null;
      world_pinchStartCam=world_camDistTarget;
      return;
    }
    if(world_pointers.size>2) return;
    try{ canvas.setPointerCapture(e.pointerId); }catch(err){}
    worldHalt();                      // toucher le globe l'arrête, toujours
    worldDismissHint();
    world_dragging=true;
    world_lastX=e.clientX; world_lastY=e.clientY;
    downX=e.clientX; downY=e.clientY; downAt=performance.now(); moved=false;
    world_velocityHistory=[{x:e.clientX,t:downAt}];
    canvas.style.cursor='grabbing';
  };

  const onMove=(e)=>{
    if(world_pointers.has(e.pointerId)) world_pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});

    if(world_pinchStartDist!==null && world_pointers.size>=2){
      const d=worldPinchSpread();
      if(d) world_camDistTarget=Math.max(WORLD_CAM_MIN,
        Math.min(WORLD_CAM_MAX,world_pinchStartCam*(world_pinchStartDist/d)));
      return;
    }
    if(!world_dragging){
      // Sans bouton enfoncé, la souris sert seulement à montrer ce qui est cliquable.
      if(e.pointerType==='mouse') worldHover(e.clientX,e.clientY);
      return;
    }
    const dx=e.clientX-world_lastX, dy=e.clientY-world_lastY;
    if(Math.abs(e.clientX-downX)>WORLD_TAP_SLOP||Math.abs(e.clientY-downY)>WORLD_TAP_SLOP) moved=true;
    const k=worldDragScale();
    world_rotationY+=dx*0.005*k;
    // Bridé avant les pôles : au-delà le globe se retourne et on perd le nord,
    // littéralement.
    world_rotationX=Math.max(-1.25,Math.min(1.25,world_rotationX+dy*0.005*k));
    world_lastX=e.clientX; world_lastY=e.clientY;
    world_velocityHistory.push({x:e.clientX,t:performance.now()});
    if(world_velocityHistory.length>6) world_velocityHistory.shift();
  };

  const onUp=(e)=>{
    world_pointers.delete(e.pointerId);
    try{ canvas.releasePointerCapture(e.pointerId); }catch(err){}
    if(world_pointers.size<2) world_pinchStartDist=null;
    if(world_pointers.size>0) return;   // encore un doigt posé : le geste continue
    if(!world_dragging) return;
    world_dragging=false;
    canvas.style.cursor='grab';

    if(!moved){
      const now=performance.now();
      if(now-world_lastTapAt<WORLD_DOUBLE_MS){
        // Double appui : on se rapproche, centré sur l'endroit visé.
        world_lastTapAt=0;
        worldZoomToward(e.clientX,e.clientY,0.6);
        return;
      }
      world_lastTapAt=now;
      handleWorldClick(e.clientX,e.clientY);
      return;
    }
    // Lancer : vélocité moyenne des derniers échantillons, puis l'amortissement
    // de worldLoop s'en occupe.
    if(world_velocityHistory.length>=2){
      const first=world_velocityHistory[0], last=world_velocityHistory[world_velocityHistory.length-1];
      const dt=(last.t-first.t)||16;
      const v=((last.x-first.x)/dt)*16*0.005*worldDragScale();
      world_spinVelocityY=Math.max(-0.14,Math.min(0.14,v));
    }
  };

  canvas.addEventListener('pointerdown',onDown);
  canvas.addEventListener('pointermove',onMove);
  canvas.addEventListener('pointerup',onUp);
  canvas.addEventListener('pointercancel',e=>{
    world_pointers.delete(e.pointerId);
    if(world_pointers.size<2) world_pinchStartDist=null;
    if(world_pointers.size===0){ world_dragging=false; canvas.style.cursor='grab'; }
  });
  canvas.addEventListener('pointerleave',()=>{ worldSetHover(null); });
  canvas.addEventListener('dblclick',e=>e.preventDefault()); // le double-clic est géré au pointeur

  // Molette. Le pavé tactile envoie son pincement comme une molette avec Ctrl :
  // même geste, effet plus franc puisqu'il est explicitement un zoom.
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();
    worldDismissHint();
    worldZoomToward(e.clientX,e.clientY,Math.exp(e.deltaY*(e.ctrlKey?0.004:0.0016)));
  },{passive:false});

  // Clavier. Avant, la seule touche utile était « n'importe laquelle, maintenue
  // deux secondes, pour arrêter » — ce qui n'aide personne à explorer un globe.
  canvas.addEventListener('keydown',e=>{
    const step=0.09*worldDragScale();
    switch(e.key){
      case 'ArrowLeft':  worldHalt(); world_rotationY-=step; break;
      case 'ArrowRight': worldHalt(); world_rotationY+=step; break;
      case 'ArrowUp':    worldHalt(); world_rotationX=Math.max(-1.25,world_rotationX-step); break;
      case 'ArrowDown':  worldHalt(); world_rotationX=Math.min(1.25,world_rotationX+step); break;
      case '+': case '=': worldZoomBy(0.88); break;
      case '-': case '_': worldZoomBy(1.14); break;
      case 'Home': worldResetView(); break;
      case ' ': case 'Spacebar': worldHalt(); break;
      default: return;
    }
    e.preventDefault();
  });
}

/** Zoom en gardant sous le curseur le point visé, plutôt qu'en se contentant du centre. */
function worldZoomToward(clientX,clientY,factor){
  const before=worldPointAt(clientX,clientY);
  worldZoomBy(factor);
  if(!before) return;
  // Le point visé a glissé : on recale la rotation pour le ramener sous le curseur.
  // Sans ça, zoomer sur un pays le fait sortir du cadre.
  const after=worldPointAt(clientX,clientY,world_camDistTarget);
  if(!after) return;
  world_rotationY+=(before.lng-after.lng)*Math.PI/180;
  world_rotationX=Math.max(-1.25,Math.min(1.25,world_rotationX-(before.lat-after.lat)*Math.PI/180));
}

function worldResetView(){
  worldHalt();
  world_rotationX=0.3; world_rotationY=0.4;
  world_camDistTarget=WORLD_CAM_DEFAULT;
}

/** Latitude/longitude sous un point de l'écran, ou null si on vise le vide. */
function worldPointAt(clientX,clientY,camDistOverride){
  if(!world_camera||!world_globeGroup) return null;
  const canvas=document.getElementById('world-canvas');
  if(!canvas) return null;
  const rect=canvas.getBoundingClientRect();
  const saved=world_camera.position.z;
  if(camDistOverride){ world_camera.position.z=camDistOverride; world_camera.updateMatrixWorld(); }
  const ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(
    ((clientX-rect.left)/rect.width)*2-1,
    -((clientY-rect.top)/rect.height)*2+1
  ),world_camera);
  const sphere=world_globeGroup.getObjectByName('world-hit-sphere');
  const hit=sphere?ray.intersectObject(sphere,false):[];
  if(camDistOverride){ world_camera.position.z=saved; world_camera.updateMatrixWorld(); }
  if(!hit.length) return null;
  return vector3ToLatLng(world_globeGroup.worldToLocal(hit[0].point.clone()));
}

/** Survol souris : indique ce qui est cliquable, sans rien charger. */
function worldHover(clientX,clientY){
  const canvas=document.getElementById('world-canvas');
  const p=worldPointAt(clientX,clientY);
  if(!p){ worldSetHover(null); if(canvas) canvas.style.cursor='grab'; return; }
  const props=findCountryAt(p.lat,p.lng);
  worldSetHover(props);
  if(canvas) canvas.style.cursor=props?'pointer':'grab';
}

function worldSetHover(props){
  const iso=props?(props.iso||props.ISO_A3||props.ISO_A2||null):null;
  const name=props?(props.name||props.ADMIN||props.NAME||''):'';
  if(iso===world_hoverIso) return;
  world_hoverIso=iso;
  const el=document.getElementById('world-hover');
  if(!el) return;
  el.textContent=name;
  el.style.opacity=name?'1':'0';
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

  // Les marqueurs d'abord : un objet posé sur un pays doit répondre à sa place, pas
  // ouvrir la fiche du pays. La tolérance de visée suit le zoom pour rester à peu
  // près constante à l'écran — un marqueur reste visable au doigt de loin comme de près.
  if(world_markerPoints){
    raycaster.params.Points.threshold=0.05*worldDragScale();
    const markerHits=raycaster.intersectObject(world_markerPoints);
    for(const hit of markerHits){
      // Trié par distance, donc le premier marqueur tourné vers la caméra est bien
      // celui du dessus ; ceux de la face cachée sont invisibles, donc injoignables.
      if(hit.index!=null&&globeMarkerFacesCamera(hit.index)){ showGlobeMarkerInfo(hit.index); return; }
    }
  }

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
  body.innerHTML='<div class="world-loading">Chargement…</div>';
  world_currentCountryData=null;
  // Le contour du pays choisi passe en violet : sans ça, on ne sait pas si on a
  // touché celui qu'on visait.
  worldHighlightCountries([countryName]);

  try{
    const isoParam = isoCode ? `?iso=${encodeURIComponent(isoCode)}` : '';
    const data=await apiCall('/country/'+encodeURIComponent(countryName)+isoParam);
    world_currentCountryData=data;
    let html='';
    if(data.population) html+=`<div class="wi-row">${icon('me',{size:14})}<span><b>${data.population.toLocaleString('fr')}</b> habitants</span></div>`;
    if(data.capital) html+=`<div class="wi-row">${icon('manage',{size:14})}<span>Capitale : <b>${escapeHtml(data.capital)}</b></span></div>`;
    if(data.region){
      html+=`<div class="wi-row">${icon('globe',{size:14})}<span>${escapeHtml(data.region)}`
        +`${data.subregion?' — '+escapeHtml(data.subregion):''}</span></div>`;
    }
    if(data.languages && data.languages.length) html+=`<div class="wi-row">${icon('chat',{size:14})}<span>${escapeHtml(data.languages.join(', '))}</span></div>`;
    if(data.current_weather) html+=`<div style="margin-top:8px">🌤️ ${escapeHtml(data.current_weather)}</span></div>`;
    if(data.recent_activity) html+=`<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(139,92,246,.15)">${data.recent_activity}</div>`;
    if(data.capital_lat!=null && data.capital_lng!=null){
      html+=`<button onclick="showCapitalBuildings()" class="world-act">Voir les bâtiments de la capitale</button>`;
    }
    if(data.region){
      html+=`<button onclick="showWorldRegionInfo('${escapeHtml(data.region).replace(/'/g,"\\'")}')"`
        +` class="world-act ghost">Voir tout le continent</button>`;
    }
    body.innerHTML=html || '<div style="color:rgba(139,92,246,.4)">Aucune information disponible.</div>';
  }catch(e){
    body.innerHTML='<div style="color:#f87171">Informations indisponibles pour ce pays.</div>';
  }
}

/** Vue d'ensemble d'un continent, avec tous ses pays surlignés d'un coup. */
async function showWorldRegionInfo(region){
  const panel=document.getElementById('world-info-panel');
  const title=document.getElementById('world-info-title');
  const body=document.getElementById('world-info-body');
  panel.style.display='block';
  title.textContent=region;
  body.innerHTML='<div class="world-loading">Chargement…</div>';
  try{
    const d=await apiCall('/geo/region/'+encodeURIComponent(region));
    const t=d.totals||{};
    const names=(d.countries||[]).map(c=>c.name);
    const shown=worldHighlightCountries(names);
    const fr=n=>Number(n||0).toLocaleString('fr-FR');
    let html='';
    html+=`<div class="wi-row">${icon('globe',{size:14})}<span><b>${fr(t.countries)}</b> pays</span></div>`;
    html+=`<div class="wi-row">${icon('me',{size:14})}<span><b>${fr(t.population)}</b> habitants</span></div>`;
    html+=`<div class="wi-row">${icon('manage',{size:14})}<span><b>${fr(t.area_km2)}</b> km²</span></div>`;
    const top=(d.countries||[]).slice(0,5);
    if(top.length){
      html+='<div class="wi-sep">Les plus peuplés</div><div class="wi-list">';
      for(const c of top){
        html+=`<button class="wi-item" onclick="showWorldCountryInfo('${escapeHtml(c.name).replace(/'/g,"\\'")}','${escapeHtml(c.iso||'')}')">`
          +`<span>${escapeHtml(c.name)}</span><span class="n">${fr(c.population)}</span></button>`;
      }
      html+='</div>';
    }
    // Les noms de REST Countries et ceux du fond de carte ne coïncident pas toujours :
    // le dire plutôt que de laisser croire que le continent est incomplet.
    if(shown && shown<(names.length||0)){
      html+=`<div class="wi-note">${shown} pays sur ${names.length} tracés sur le globe `
        +`(certains noms diffèrent entre les deux sources).</div>`;
    }
    body.innerHTML=html;
  }catch(e){
    body.innerHTML='<div class="world-err">Informations indisponibles pour ce continent.</div>';
  }
}

let world_lastFrameAt=0;

function worldLoop(now){
  const modal=document.getElementById('world-modal');
  if(!modal || modal.style.display==='none'){ world_animating=false; world_lastFrameAt=0; return; }
  // Tout est rapporté à une image de 60 Hz. Sans ça, la rotation et son
  // amortissement dépendent de la fréquence de l'écran : deux fois plus rapides sur
  // un téléphone à 120 Hz, au ralenti sur une machine chargée.
  const t=now||performance.now();
  const dt=world_lastFrameAt?Math.min(100,t-world_lastFrameAt):16.67;
  world_lastFrameAt=t;
  const f=dt/16.67;

  if(world_autoRotate){
    world_rotationY+=0.0008*f;
  }else if(Math.abs(world_spinVelocityY)>WORLD_SPIN_FLOOR){
    // Inertie amortie : le lancer se poursuit puis s'éteint en une seconde et demie.
    // Sans frottement, le globe ne s'arrêtait jamais seul et il fallait connaître un
    // appui long de deux secondes pour le figer — on ne pouvait pas lire un pays.
    world_rotationY+=world_spinVelocityY*f;
    world_spinVelocityY*=Math.pow(WORLD_FRICTION,f);
  }else{
    world_spinVelocityY=0;
  }
  if(world_globeGroup){ world_globeGroup.rotation.y=world_rotationY; world_globeGroup.rotation.x=world_rotationX; }
  // Amorti exponentiel vers la distance visée : molette, pincement et clavier ne
  // touchent qu'à la cible, ce qui donne un zoom qui glisse au lieu de sauter, sans
  // interférer avec la rotation (qui, elle, reste pilotée par le glissement).
  if(world_camera && Math.abs(world_camDistTarget-world_camDist)>0.0008){
    world_camDist+=(world_camDistTarget-world_camDist)*Math.min(1,0.18*f);
    world_camera.position.z=world_camDist;
  }
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
  // La couche affichée n'a aucune raison de survivre au panneau : ses données sont
  // périssables (un avion de la minute passée ne vaut rien) et sa géométrie occupe
  // de la mémoire vidéo. L'état du contrôle est remis à zéro avec elle.
  disposeGlobeMarkers();
  worldClearHighlight();
  worldSetHover(null);
  world_pointers.clear();
  world_pinchStartDist=null;
  world_activeLayer=null;
  world_layerBusy=false;
  paintGlobeLayerButtons();
  setGlobeLayerStatus('');
  // Libération immédiate de la mémoire GPU à la fermeture : le panneau peut être
  // réouvert des dizaines de fois dans une session, et tout est reconstruit à
  // l'ouverture de toute façon (les sommets des frontières, eux, restent en cache).
  world_highlight=null; // appartenait au groupe, détruit juste en dessous
  disposeWorldNode(world_globeGroup); world_globeGroup=null;
  disposeWorldNode(world_starfield); world_starfield=null;
  if(world_renderer) world_renderer.renderLists.dispose();
}
