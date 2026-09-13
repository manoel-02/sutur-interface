// ── REPRÉSENTATION HOLOGRAPHIQUE DE LIEU ───────────────────────────────────
// Bâtiments et routes RÉELS (contours et, quand disponible, hauteur réelle
// venant d'OpenStreetMap) rendus en 3D filaire, dans le même style visuel que
// le reste de Sutur — pas une photo/Street View, une vraie géométrie stylisée.
let holomap_scene=null, holomap_camera=null, holomap_renderer=null, holomap_group=null;
let holomap_animating=false;

async function showHolographicLocation(mapData){
  const hasGeometry = mapData && ((mapData.buildings && mapData.buildings.length) || (mapData.roads && mapData.roads.length));
  if(!hasGeometry) return; // Rien à montrer -> la carte 2D classique suffit, pas la peine d'ouvrir le modal

  document.getElementById('holomap-modal').style.display='flex';
  document.getElementById('holomap-title').textContent='📍 '+(mapData.location_name||'Lieu').toUpperCase();
  document.getElementById('holomap-empty').style.display='none';

  try{
    await ensureThreeJS();
  }catch(e){
    document.getElementById('holomap-empty').style.display='flex';
    return;
  }

  const canvas=document.getElementById('holomap-canvas');
  const w=canvas.clientWidth||400, h=canvas.clientHeight||400;

  if(!holomap_renderer){
    holomap_scene=new THREE.Scene();
    holomap_camera=new THREE.PerspectiveCamera(50, w/h, 0.1, 1000);
    holomap_renderer=new THREE.WebGLRenderer({canvas, alpha:true, antialias:true});
  }
  holomap_renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  holomap_renderer.setSize(w,h,false);
  holomap_camera.aspect=w/h;
  holomap_camera.updateProjectionMatrix();

  if(holomap_group) holomap_scene.remove(holomap_group);
  holomap_group=new THREE.Group();

  // Étoiles de fond — cohérent avec le thème galactique déjà établi
  const starPos=[];
  for(let i=0;i<300;i++) starPos.push((Math.random()-0.5)*300,(Math.random()-0.5)*150,(Math.random()-0.5)*300);
  const starGeo=new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(starPos),3));
  holomap_group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({color:0xffffff,size:0.3,transparent:true,opacity:0.4})));

  // Grille au sol — juste un repère d'échelle, pas une vraie donnée
  const grid=new THREE.GridHelper(120,24,0x8b5cf6,0x2a1f4d);
  grid.material.transparent=true; grid.material.opacity=0.25;
  holomap_group.add(grid);

  const SCALE=6; // mètres réels -> unités 3D, pour un rendu à taille raisonnable dans le cadre

  // Bâtiments — extrusion du VRAI contour (données OSM), hauteur réelle si connue.
  // Doré = hauteur confirmée par une vraie donnée, violet = hauteur estimée par défaut
  // (on ne prétend jamais connaître une hauteur qu'on n'a pas vraiment).
  (mapData.buildings||[]).forEach(b=>{
    if(!b.points || b.points.length<3) return;
    const shape=new THREE.Shape();
    shape.moveTo(b.points[0][0]/SCALE, -b.points[0][1]/SCALE);
    for(let i=1;i<b.points.length;i++) shape.lineTo(b.points[i][0]/SCALE, -b.points[i][1]/SCALE);
    shape.closePath();
    const height=(b.height||12)/SCALE;
    let geo;
    try{ geo=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}); }
    catch(e){ return; } // contour dégénéré (points colinéaires...) -> on l'ignore plutôt que planter
    geo.rotateX(-Math.PI/2);
    const color=b.height_is_real?0xd4af37:0x8b5cf6;
    holomap_group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color,wireframe:true,transparent:true,opacity:0.85})));
    holomap_group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.05,side:THREE.DoubleSide})));
  });

  // Routes — tracé réel, ligne lumineuse au ras du sol
  (mapData.roads||[]).forEach(r=>{
    if(!r.points || r.points.length<2) return;
    const pts=r.points.map(p=>new THREE.Vector3(p[0]/SCALE, 0.05, -p[1]/SCALE));
    const geo=new THREE.BufferGeometry().setFromPoints(pts);
    holomap_group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({color:0x00d4ff,transparent:true,opacity:0.7})));
  });

  holomap_scene.add(holomap_group);
  holomap_camera.position.set(15,18,15);
  holomap_camera.lookAt(0,0,0);

  if(!holomap_animating){
    holomap_animating=true;
    holomapLoop();
  }
}

function holomapLoop(){
  const modal=document.getElementById('holomap-modal');
  if(!modal || modal.style.display==='none'){
    holomap_animating=false;
    return;
  }
  if(holomap_group) holomap_group.rotation.y+=0.003;
  if(holomap_renderer && holomap_scene && holomap_camera) holomap_renderer.render(holomap_scene, holomap_camera);
  requestAnimationFrame(holomapLoop);
}

function closeHolomap(){
  document.getElementById('holomap-modal').style.display='none';
}
