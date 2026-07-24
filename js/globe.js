// ── VISAGE 3D & ARRIÈRE-PLAN ─────────────────────────────────────────────
// Rendu Three.js du visage (contour, structure faciale, réactivité audio),
// avec repli 2D automatique si WebGL/Three.js indisponible.

function rsz(){BW=bgc.width=bgc.offsetWidth||window.innerWidth;BH=bgc.height=bgc.offsetHeight||window.innerHeight}

function spawnShooter(){const s=SHOOTERS.find(s=>!s.active);if(!s)return;s.active=true;s.x=Math.random()*.7;s.y=Math.random()*.4;const a=Math.PI/4+Math.random()*.5,sp=.004+Math.random()*.004;s.vx=Math.cos(a)*sp;s.vy=Math.sin(a)*sp;s.max=s.life=40+Math.random()*25}

function drawBg(t){
  bc.clearRect(0,0,BW,BH);
  bc.fillStyle='#03010f';bc.fillRect(0,0,BW,BH);
  // Nébuleuses
  [[.75,.2,.4,'rgba(70,15,130,.2)'],[.1,.8,.3,'rgba(50,10,100,.15)'],[.9,.7,.25,'rgba(90,30,160,.12)']].forEach(([fx,fy,fr,c])=>{
    const g=bc.createRadialGradient(fx*BW,fy*BH,0,fx*BW,fy*BH,fr*BH);
    g.addColorStop(0,c);g.addColorStop(1,'transparent');
    bc.fillStyle=g;bc.fillRect(0,0,BW,BH);
  });
  // Étoiles
  STARS.forEach(s=>{
    const b=.2+.6*Math.sin(t*s.tw+s.a);
    bc.beginPath();bc.arc(s.x*BW,s.y*BH,s.r,0,Math.PI*2);
    bc.fillStyle=`rgba(255,255,255,${b})`;bc.fill();
  });
  // Étoiles filantes
  stTimer++;if(stTimer>100){stTimer=0;spawnShooter()}
  SHOOTERS.forEach(s=>{
    if(!s.active)return;
    const p=s.life/s.max;
    bc.beginPath();bc.moveTo(s.x*BW,s.y*BH);bc.lineTo((s.x-s.vx*50*.1)*BW,(s.y-s.vy*50*.1)*BH);
    bc.strokeStyle=`rgba(255,255,255,${p*.6})`;bc.lineWidth=1.2;bc.stroke();
    bc.beginPath();bc.arc(s.x*BW,s.y*BH,1.5*p,0,Math.PI*2);
    bc.fillStyle=`rgba(200,180,255,${p})`;bc.fill();
    s.x+=s.vx;s.y+=s.vy;s.life--;
    if(s.life<=0||s.x>1.1||s.y>1.1)s.active=false;
  });
  // Planète bas gauche
  bc.save();bc.translate(BW*-.05,BH*.95);bc.rotate(-.35);
  bc.beginPath();bc.ellipse(0,0,BW*.2,BW*.05,0,0,Math.PI*2);
  bc.strokeStyle='rgba(201,162,39,.15)';bc.lineWidth=2;bc.stroke();
  bc.restore();
  bc.beginPath();bc.arc(BW*-.02,BH*1.02,BW*.18,0,Math.PI*2);
  bc.fillStyle='rgba(45,10,80,.55)';bc.fill();
}

function ensureThreeJS(){
  if(threeLoaded && window.THREE)return Promise.resolve();
  if(threeLoadingPromise)return threeLoadingPromise;
  threeLoadingPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.onload=()=>{threeLoaded=true;resolve();};
    script.onerror=()=>{threeLoadingPromise=null;reject(new Error('Three.js indisponible'));};
    document.head.appendChild(script);
  });
  return threeLoadingPromise;
}

function lerp(a,b,t){return a+(b-a)*t;}

function headRadiusAtY(y){
  // Rayon horizontal du contour de tête selon la hauteur y (-1=menton, 1=sommet du crâne).
  // Silhouette plus anguleuse et marquée : crâne large et net, tempes saillantes,
  // resserrement franc vers une mâchoire nette, pointe de menton affirmée.
  if(y>0.8) return lerp(0.36,0.46,(1-y)/0.2);
  if(y>0.5) return lerp(0.46,0.6,(0.8-y)/0.3);
  if(y>0.1) return lerp(0.6,0.57,(0.5-y)/0.4);
  if(y>-0.3) return lerp(0.57,0.42,(0.1-y)/0.4);
  if(y>-0.68) return lerp(0.42,0.15,(-0.3-y)/0.38);
  return Math.max(0,lerp(0.15,0,(-0.68-y)/0.32));
}

function buildHeadOutlineLine(steps){
  // Contour en UNE boucle continue (pas des points isolés) — trace le côté droit du
  // sommet au menton, puis le côté gauche du menton au sommet, pour former une seule
  // ligne fermée exploitable par THREE.LineLoop. Bien plus "concret" qu'un pointillé.
  const pts=[];
  for(let i=0;i<=steps;i++){
    const y=lerp(1,-1,i/steps);
    pts.push(headRadiusAtY(y),y,0);
  }
  for(let i=steps;i>=0;i--){
    const y=lerp(1,-1,i/steps);
    pts.push(-headRadiusAtY(y),y,0);
  }
  return pts;
}

function buildNoseLine(){
  // Arête du nez — ligne nette du front jusqu'à une aile marquée, silhouette lisible
  // même à petite taille plutôt qu'un losange abstrait.
  return [
    0,0.22,0.12,
    -0.01,0.0,0.115,
    -0.025,-0.14,0.11,
    -0.06,-0.25,0.1,
    0,-0.21,0.105,
    0.06,-0.25,0.1,
    0.025,-0.14,0.11,
    0.01,0.0,0.115,
    0,0.22,0.12,
  ];
}

function buildBrowLine(side){
  // Arcade — longue et légèrement relevée vers l'extérieur, pour un regard plus
  // intense/affirmé plutôt qu'un petit trait discret.
  return [
    side*0.05,0.36,0.1,
    side*0.16,0.38,0.09,
    side*0.29,0.36,0.075,
    side*0.44,0.29,0.05,
  ];
}

function buildCheekLine(side){
  // Ligne de pommette — accompagne la courbe du crâne côté tempe/joue.
  return [
    side*0.52,0.32,0.045,
    side*0.58,0.08,0.035,
    side*0.5,-0.16,0.045,
  ];
}

function buildJawLine(side){
  // Ligne de mâchoire — suit le resserrement net vers le menton.
  return [
    side*0.46,-0.24,0.05,
    side*0.3,-0.5,0.045,
    side*0.1,-0.68,0.04,
  ];
}

function buildForeheadLine(){
  // Ligne haute frontale — apporte de la richesse structurelle sur le haut du visage.
  return [
    -0.3,0.62,0.05,
    -0.12,0.68,0.07,
    0.12,0.68,0.07,
    0.3,0.62,0.05,
  ];
}

function buildAmbientGlow(){
  // Quelques points larges juste derrière le visage — l'aide à se fondre dans le
  // décor plutôt que de flotter comme un calque détaché.
  return [0,0.02,-0.35, -0.15,-0.1,-0.42, 0.15,0.15,-0.4, 0,-0.35,-0.38];
}

function buildHeadVolume(n){
  // Nuage de particules en coquille — biaisé vers 65-98% du rayon externe (plutôt
  // qu'un remplissage uniforme) pour une vraie sensation de forme/volume, avec une
  // répartition circulaire complète (pas juste x/z aléatoires) pour un galbe cohérent.
  const pts=[];
  let tries=0;
  while(pts.length<n*3 && tries<n*20){
    tries++;
    const y=lerp(1,-1,Math.random());
    const maxR=headRadiusAtY(y);
    if(maxR<=0){tries--;continue;}
    const shellBias=0.62+Math.random()*0.36;
    const angle=Math.random()*Math.PI*2;
    const x=Math.cos(angle)*maxR*shellBias;
    const z=Math.sin(angle)*maxR*shellBias*0.38;
    pts.push(x,y,z);
  }
  return pts;
}

function buildAlmondShape(steps,w,h,cx,cy){
  // Forme en amande (yeux) — deux arcs symétriques haut/bas se rejoignant aux coins.
  const pts=[];
  for(let i=0;i<=steps;i++){
    const a=lerp(0,Math.PI,i/steps);
    pts.push(cx+Math.cos(a)*w, cy+Math.sin(a)*h, 0.06);
  }
  for(let i=0;i<=steps;i++){
    const a=lerp(Math.PI,2*Math.PI,i/steps);
    pts.push(cx+Math.cos(a)*w, cy+Math.sin(a)*h*0.5, 0.06);
  }
  return pts;
}

function buildStarfield(n,spread){
  // Champ d'étoiles ambiant autour du visage — l'aspect "galactique" demandé,
  // séparé du visage lui-même pour tourner à une vitesse différente (parallaxe).
  const pts=[];
  for(let i=0;i<n;i++){
    const r=spread*(0.5+Math.random()*0.5);
    const theta=Math.random()*Math.PI*2;
    const phi=Math.acos(Math.random()*2-1);
    pts.push(
      r*Math.sin(phi)*Math.cos(theta),
      r*Math.sin(phi)*Math.sin(theta),
      r*Math.cos(phi)*0.4-0.6 // aplati en profondeur, la majorité derrière le visage
    );
  }
  return pts;
}

function makePoints(positionsArray,color,size,opacity){
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(positionsArray),3));
  const mat=new THREE.PointsMaterial({
    color,size,transparent:true,opacity,
    sizeAttenuation:true,blending:THREE.AdditiveBlending,depthWrite:false
  });
  return new THREE.Points(geo,mat);
}

function makeLine(positionsArray,color,opacity,closed){
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(positionsArray),3));
  const mat=new THREE.LineBasicMaterial({
    color,transparent:true,opacity,
    blending:THREE.AdditiveBlending,depthWrite:false
  });
  return closed?new THREE.LineLoop(geo,mat):new THREE.Line(geo,mat);
}

function buildBurst(n){
  // Particules d'explosion au clic/tap — partent toutes du centre, chacune avec sa
  // propre direction et vitesse aléatoires (répartition sphérique uniforme).
  const positions=[],velocities=[];
  for(let i=0;i<n;i++){
    const theta=Math.random()*Math.PI*2;
    const phi=Math.acos(Math.random()*2-1);
    const speed=0.4+Math.random()*0.9;
    velocities.push(Math.sin(phi)*Math.cos(theta)*speed,Math.sin(phi)*Math.sin(theta)*speed,Math.cos(phi)*speed);
    positions.push(0,0,0);
  }
  return {positions,velocities};
}

function buildMist(n,spread){
  // Nuage large autour du visage — invisible par défaut, monte en opacité en réflexion.
  const pts=[];
  for(let i=0;i<n;i++){
    const r=spread*(0.3+Math.random()*0.7);
    const theta=Math.random()*Math.PI*2;
    const phi=Math.acos(Math.random()*2-1);
    pts.push(r*Math.sin(phi)*Math.cos(theta), r*Math.cos(phi)*0.7, r*Math.sin(phi)*Math.sin(theta));
  }
  return pts;
}

async function initGlobe3D(){
  try{
    if(!window.WebGLRenderingContext)throw new Error('WebGL non supporté');
    await ensureThreeJS();
    const canvas3d=document.getElementById('globe3d');
    if(!canvas3d)throw new Error('canvas 3D introuvable');

    three_scene=new THREE.Scene();
    three_camera=new THREE.PerspectiveCamera(45,1,0.1,100);
    three_camera.position.z=2.7;

    three_renderer=new THREE.WebGLRenderer({canvas:canvas3d,alpha:true,antialias:true});
    three_renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));

    three_faceGroup=new THREE.Group();

    // Contour en trait continu (pas en points isolés) — bien plus "concret" et lisible,
    // en particulier à petite taille sur mobile. Un halo de particules douces juste
    // derrière lui donne l'effet de lueur/glow qu'une simple ligne WebGL ne peut pas
    // produire seule (l'épaisseur de trait n'est pas fiable d'un navigateur à l'autre).
    three_headGlow=makePoints(buildHeadOutlineLine(90),0x8b5cf6,0.09,0.28);
    three_head=makeLine(buildHeadOutlineLine(90),0xffffff,1,true);
    three_headVolume=makePoints(buildHeadVolume(560),0x8b5cf6,0.015,0.4);
    three_eyeL=makePoints(buildAlmondShape(16,0.14,0.06,-0.22,0.22),0xd4af37,0.034,0.95);
    three_eyeR=makePoints(buildAlmondShape(16,0.14,0.06,0.22,0.22),0xd4af37,0.034,0.95);
    three_mouth=makePoints(buildAlmondShape(16,0.16,0.04,0,-0.42),0xd4af37,0.026,0.85);
    three_stars=makePoints(buildStarfield(900,3.2),0xffffff,0.018,0.55);
    three_thinkMist=makePoints(buildMist(350,1.4),0xc9a227,0.02,0);

    // Lignes structurelles — donnent au visage sa lisibilité (nez, arcades, pommettes,
    // mâchoire, front), dans le même esprit "circuit" que le visage de référence.
    three_nose=makeLine(buildNoseLine(),0x8b5cf6,0.6,false);
    three_browL=makeLine(buildBrowLine(-1),0x8b5cf6,0.55,false);
    three_browR=makeLine(buildBrowLine(1),0x8b5cf6,0.55,false);
    three_cheekL=makeLine(buildCheekLine(-1),0x8b5cf6,0.42,false);
    three_cheekR=makeLine(buildCheekLine(1),0x8b5cf6,0.42,false);
    three_jawL=makeLine(buildJawLine(-1),0x8b5cf6,0.45,false);
    three_jawR=makeLine(buildJawLine(1),0x8b5cf6,0.45,false);
    three_forehead=makeLine(buildForeheadLine(),0x8b5cf6,0.4,false);

    // Lueur ambiante juste derrière le visage — l'aide à se fondre dans le décor
    // plutôt que de flotter comme un calque détaché.
    three_ambientGlow=makePoints(buildAmbientGlow(),0x8b5cf6,1.6,0.16);

    const burstData=buildBurst(220);
    three_burstVelocities=burstData.velocities;
    three_burst=makePoints(burstData.positions,0xffffff,0.032,0);

    three_faceGroup.add(three_ambientGlow,three_headGlow,three_head,three_headVolume,
      three_eyeL,three_eyeR,three_mouth,three_thinkMist,
      three_nose,three_browL,three_browR,three_cheekL,three_cheekR,three_jawL,three_jawR,three_forehead);
    three_scene.add(three_faceGroup);
    three_scene.add(three_stars); // hors du groupe visage : tourne indépendamment
    three_scene.add(three_burst); // hors du groupe : l'explosion ne doit pas hériter de sa rotation

    // ── Effet galactique au clic/tap sur le visage — 'click' couvre à la fois la
    // souris (PC) et le tactile (mobile), les navigateurs émettent un click synthétique
    // sur tap. touch-action:manipulation évite le zoom accidentel au double-tap.
    canvas3d.style.cursor='pointer';
    canvas3d.style.touchAction='manipulation';
    canvas3d.addEventListener('click',()=>{
      burstActive=true;
      burstStartTime=performance.now();
    });

    use3DGlobe=true;
    document.getElementById('globe3d').style.display='block';
    resizeGlobe3D();
  }catch(e){
    console.warn('Visage 3D indisponible, repli sur le rendu 2D existant:',e.message);
    use3DGlobe=false;
  }
}

function resizeGlobe3D(){
  if(!use3DGlobe||!three_renderer)return;
  three_renderer.setSize(GW,GH,false);
  three_camera.aspect=1;
  three_camera.updateProjectionMatrix();
}

function renderGlobe3D(t){
  if(!use3DGlobe||!three_faceGroup)return;
  const m=GMODES[gMode];
  const tSec=t*0.016; // approx secondes, à raison de ~60 images/seconde

  // Couleur réactive au mode en cours — même mapping que le rendu 2D existant.
  // Le contour principal (three_head) reste blanc fixe — un noyau net et lumineux,
  // toujours visible — pendant que la couleur du mode vit dans le halo et les
  // lignes structurelles autour de lui, pour une meilleure hiérarchie visuelle.
  const col=new THREE.Color(m.col);
  three_headGlow.material.color.copy(col);
  three_headVolume.material.color.copy(col);
  three_nose.material.color.copy(col);
  three_browL.material.color.copy(col);
  three_browR.material.color.copy(col);
  three_cheekL.material.color.copy(col);
  three_cheekR.material.color.copy(col);
  three_jawL.material.color.copy(col);
  three_jawR.material.color.copy(col);
  three_forehead.material.color.copy(col);
  three_ambientGlow.material.color.copy(col);

  // ── Bouche : réagit VRAIMENT au volume du TTS en train de parler ──────────
  const mouthOpen=gMode===2?(0.15+ttsAmplitude*2.2):0.15;
  three_mouth.scale.set(1,mouthOpen,1);
  three_mouth.material.color.setStyle(gMode===2?'#4ade80':'#c9a227');

  // ── Yeux : réagissent VRAIMENT au niveau du micro en écoute, + clignement idle ─
  eyeBlinkPhase-=1/60;
  if(eyeBlinkPhase<=0 && gMode!==4){
    eyeBlinkPhase=0.14; // durée du clignement
    nextBlinkAt=2.5+Math.random()*4;
  }
  nextBlinkAt-=1/60;
  const blinking=eyeBlinkPhase>0;
  const listenPulse=gMode===4?(1+micAmplitude*1.8):1;
  const eyeYScale=blinking?0.08:listenPulse;
  three_eyeL.scale.set(1,eyeYScale,1);
  three_eyeR.scale.set(1,eyeYScale,1);
  const eyeColor=gMode===4?'#00d4ff':gMode===3?'#f87171':'#d4af37';
  three_eyeL.material.color.setStyle(eyeColor);
  three_eyeR.material.color.setStyle(eyeColor);

  // ── Brume galactique — apparaît seulement en mode RÉFLEXION, transition douce ─
  const targetMistOpacity=gMode===1?0.4:0;
  three_thinkMist.material.opacity+=(targetMistOpacity-three_thinkMist.material.opacity)*0.05;
  three_thinkMist.rotation.y+=0.0012;
  three_thinkMist.material.color.setStyle(m.col);

  // ── Explosion galactique au clic/tap — particules qui jaillissent du centre,
  // couleur qui glisse du violet vers l'or puis le blanc, puis disparaît ──────
  if(burstActive){
    const elapsed=(performance.now()-burstStartTime)/1000;
    const duration=1.1;
    if(elapsed>duration){
      burstActive=false;
      three_burst.material.opacity=0;
    }else{
      const progress=elapsed/duration;
      const posAttr=three_burst.geometry.attributes.position;
      for(let i=0;i<posAttr.count;i++){
        posAttr.setXYZ(i,
          three_burstVelocities[i*3]*progress*2.4,
          three_burstVelocities[i*3+1]*progress*2.4,
          three_burstVelocities[i*3+2]*progress*2.4
        );
      }
      posAttr.needsUpdate=true;
      three_burst.material.opacity=(1-progress)*0.9;
      three_burst.material.color.setHSL(0.75-progress*0.2,1,0.55+progress*0.3);
    }
  }

  // ── Signal d'accueil — bref éclat quand le mode vocal vient de s'ouvrir,
  // comme si Sutur venait de te remarquer. Décroît tout seul vers 0. ────────
  greetPulse=Math.max(0,greetPulse-1/60*0.8);
  const greetBoost=1+greetPulse*0.25;
  const greetGlow=greetPulse*0.4;

  // ── Mouvement d'ensemble façon assistant attentif : léger flottement, tourne
  // doucement comme s'il te regardait, jamais parfaitement figé ──────────────
  three_faceGroup.rotation.y=Math.sin(tSec*.25)*.18;
  three_faceGroup.rotation.x=Math.sin(tSec*.18)*.06-0.05;
  three_faceGroup.position.y=Math.sin(tSec*.4)*.03;
  const breathe=(1+Math.sin(tSec*.3)*.015+(gMode===2?ttsAmplitude*.05:0))*greetBoost;
  three_faceGroup.scale.setScalar(breathe);
  three_head.material.opacity=0.9+greetGlow;
  three_headVolume.material.opacity=0.35+greetGlow*.5;

  // ── Champ d'étoiles galactique — tourne lentement, indépendant du visage ──
  three_stars.rotation.y+=0.0006;
  three_stars.rotation.x+=0.0002;

  three_renderer.render(three_scene,three_camera);
}

function resizeGlobe(){
  const isMobile=window.innerWidth<600;
  if(voiceModeActive){
    GW=GH=isMobile?240:280;
  }else{
    GW=GH=isMobile?160:200;
  }
  gc.width=GW;gc.height=GH;
  const stack=document.getElementById('globe-stack');
  if(stack){stack.style.width=GW+'px';stack.style.height=GH+'px';}
  resizeGlobe3D();
}

function drawGlobe(t){
  gctx.clearRect(0,0,GW,GH);
  // Quand le visage 3D est actif, TOUT le rendu se fait dans renderGlobe3D() —
  // ce canvas 2D ne sert plus que de repli si la 3D n'a pas pu se charger.
  // Avant cette correction, les halos/anneaux/texte ci-dessous continuaient à se
  // dessiner PAR-DESSUS le visage 3D à chaque image, le rendant difficile à voir.
  if(use3DGlobe)return;

  const cx=GW/2,cy=GH/2;
  const m=GMODES[gMode];
  const sp=m.speed;
  const R=GW*.38; // rayon globe
  const liveAmp=gMode===4?micAmplitude:(gMode===2?ttsAmplitude:0);
  const pulse=1+.04*Math.sin(t*.04)+liveAmp*.4;

  // ── Halos lumineux multicouches (comme sur la photo)
  [[R*3,.04],[R*2.2,.08],[R*1.5,.14],[R*1.1,.2]].forEach(([r,a])=>{
    const g=gctx.createRadialGradient(cx,cy,0,cx,cy,r*pulse);
    g.addColorStop(0,`rgba(${m.glow},${a})`);
    g.addColorStop(.6,`rgba(${m.glow},${a*.3})`);
    g.addColorStop(1,'transparent');
    gctx.fillStyle=g;gctx.beginPath();gctx.arc(cx,cy,r*pulse,0,Math.PI*2);gctx.fill();
  });

  // ── Anneau orbital doré principal (incliné comme sur la photo)
  gctx.save();gctx.translate(cx,cy);gctx.rotate(-.3);
  // Anneau doré brillant
  const ringR=R*1.15;const ringY=R*.38;
  gctx.beginPath();gctx.ellipse(0,0,ringR,ringY,0,0,Math.PI*2);
  const ringG=gctx.createLinearGradient(-ringR,0,ringR,0);
  ringG.addColorStop(0,'rgba(201,162,39,.1)');
  ringG.addColorStop(.3,'rgba(201,162,39,.8)');
  ringG.addColorStop(.5,'rgba(255,210,80,.95)');
  ringG.addColorStop(.7,'rgba(201,162,39,.8)');
  ringG.addColorStop(1,'rgba(201,162,39,.1)');
  gctx.strokeStyle=ringG;gctx.lineWidth=2;gctx.stroke();
  // Satellite doré sur l'anneau
  const sa=t*.013*sp;
  const sx=Math.cos(sa)*ringR,sy=Math.sin(sa)*ringY;
  // Halo satellite
  const shg=gctx.createRadialGradient(sx,sy,0,sx,sy,8);
  shg.addColorStop(0,'rgba(255,210,80,.5)');shg.addColorStop(1,'transparent');
  gctx.fillStyle=shg;gctx.fillRect(sx-8,sy-8,16,16);
  gctx.beginPath();gctx.arc(sx,sy,3.5,0,Math.PI*2);
  gctx.fillStyle='rgba(255,220,100,.95)';gctx.fill();
  gctx.restore();

  // ── Anneau violet secondaire (autre inclinaison)
  gctx.save();gctx.translate(cx,cy);gctx.rotate(.2);
  gctx.beginPath();gctx.ellipse(0,0,R*1.05,R*.32,0,0,Math.PI*2);
  const ring2G=gctx.createLinearGradient(-R,0,R,0);
  ring2G.addColorStop(0,`rgba(${m.glow},.05)`);
  ring2G.addColorStop(.4,`rgba(${m.glow},.6)`);
  ring2G.addColorStop(.6,`rgba(${m.glow},.6)`);
  ring2G.addColorStop(1,`rgba(${m.glow},.05)`);
  gctx.strokeStyle=ring2G;gctx.lineWidth=1.2;gctx.stroke();
  // Satellite violet
  const sb=-t*.017*sp;
  const sx2=Math.cos(sb)*R*1.05,sy2=Math.sin(sb)*R*.32;
  gctx.beginPath();gctx.arc(sx2,sy2,2.5,0,Math.PI*2);
  gctx.fillStyle=`rgba(${m.glow},.9)`;gctx.fill();
  gctx.restore();

  // ── Globe central (sphère) — repli 2D pur, on n'atteint ce point que si la 3D
  // n'a pas pu se charger (retour anticipé plus haut sinon).
  const sphereG=gctx.createRadialGradient(cx-R*.25,cy-R*.2,0,cx,cy,R*pulse);
  sphereG.addColorStop(0,'rgba(80,40,140,.7)');
  sphereG.addColorStop(.4,'rgba(30,10,70,.85)');
  sphereG.addColorStop(.8,'rgba(10,4,30,.95)');
  sphereG.addColorStop(1,'rgba(5,2,20,.98)');
  gctx.beginPath();gctx.arc(cx,cy,R*pulse,0,Math.PI*2);
  gctx.fillStyle=sphereG;gctx.fill();

  // Bordure lumineuse de la sphère
  const borderG=gctx.createLinearGradient(cx-R,cy-R,cx+R,cy+R);
  borderG.addColorStop(0,`rgba(${m.glow},.9)`);
  borderG.addColorStop(.5,`rgba(${m.glow},.4)`);
  borderG.addColorStop(1,`rgba(${m.glow},.1)`);
  gctx.strokeStyle=borderG;gctx.lineWidth=1.5;gctx.stroke();

  // Reflet/spéculaire sur la sphère
  const spec=gctx.createRadialGradient(cx-R*.3,cy-R*.3,0,cx-R*.2,cy-R*.2,R*.5);
  spec.addColorStop(0,'rgba(255,255,255,.12)');
  spec.addColorStop(1,'transparent');
  gctx.beginPath();gctx.arc(cx,cy,R*pulse,0,Math.PI*2);
  gctx.fillStyle=spec;gctx.fill();

  // ── Couronne pulsante externe
  const crPulse=R*pulse+5+3*Math.sin(t*.04);
  gctx.beginPath();gctx.arc(cx,cy,crPulse,0,Math.PI*2);
  gctx.strokeStyle=`rgba(${m.glow},${.12+.06*Math.sin(t*.035)})`;gctx.lineWidth=1;gctx.stroke();

  // ── Animations selon le mode
  if(gMode===1){ // RÉFLEXION — particules orbitantes
    for(let i=0;i<12;i++){
      const a=t*.07+i*(Math.PI/6);const pr=R+15+Math.sin(t*.05+i)*4;
      const px=cx+Math.cos(a)*pr*pulse,py=cy+Math.sin(a)*pr*.38*pulse;
      gctx.beginPath();gctx.arc(px,py,1.8,0,Math.PI*2);
      gctx.fillStyle=`rgba(201,162,39,${.3+.5*Math.sin(t*.09+i)})`;gctx.fill();
    }
  }
  if(gMode===2){ // PAROLE — ondes sonores réactives au volume réel du TTS
    for(let i=1;i<=5;i++){
      const wr=(R+i*10+(5+22*ttsAmplitude)*Math.sin(t*.06+i*.7))*pulse;
      const wa=(.2-i*.035)*(0.45+ttsAmplitude*1.3);
      gctx.beginPath();gctx.arc(cx,cy,wr,0,Math.PI*2);
      gctx.strokeStyle=`rgba(74,222,128,${Math.max(0,wa*Math.abs(Math.sin(t*.05+i)))})`;
      gctx.lineWidth=1+ttsAmplitude*2;gctx.stroke();
    }
  }
  if(gMode===4){ // ÉCOUTE — points qui pulsent au rythme du micro
    for(let i=0;i<8;i++){
      const a=(i/8)*Math.PI*2+t*.01;
      const dr=(R+16)*pulse;
      const px=cx+Math.cos(a)*dr,py=cy+Math.sin(a)*dr*.38;
      const dotR=2+micAmplitude*7;
      gctx.beginPath();gctx.arc(px,py,dotR,0,Math.PI*2);
      gctx.fillStyle=`rgba(0,212,255,${.3+micAmplitude*.6})`;gctx.fill();
    }
  }
  if(gMode===3){ // ALERTE — flash rouge pulsant
    const flashA=.08+.06*Math.abs(Math.sin(t*.12));
    for(let i=1;i<=3;i++){
      gctx.beginPath();gctx.arc(cx,cy,(R+i*14)*pulse,0,Math.PI*2);
      gctx.strokeStyle=`rgba(248,113,113,${flashA/i})`;gctx.lineWidth=1.5;gctx.stroke();
    }
  }

  // ── Texte central
  gctx.textAlign='center';
  const fontSize=Math.round(R*.52);
  gctx.font=`700 ${fontSize}px system-ui,-apple-system,sans-serif`;
  gctx.fillStyle='rgba(232,228,248,.96)';
  gctx.fillText('SUTUR',cx,cy+R*.08);
  const subSize=Math.round(R*.22);
  gctx.font=`${subSize}px system-ui`;
  gctx.fillStyle='rgba(201,162,39,.8)';
  gctx.fillText('by OrbixLabs',cx,cy+R*.36);

  // ── Label mode en dessous du globe
  gctx.font=`500 ${Math.round(R*.2)}px system-ui`;
  gctx.fillStyle=`rgba(${m.glow},.6)`;
  gctx.fillText(m.name,cx,GH-8);
}

function loop(t){
  drawBg(t);
  renderGlobe3D(gT);
  drawGlobe(gT);
  gT++;
  document.getElementById('htime').textContent=new Date().toLocaleTimeString('fr',{hour:'2-digit',minute:'2-digit'});
  requestAnimationFrame(loop);
}

function setGlobeMode(n){
  gMode=n;
  document.getElementById('hmod').textContent=['ORBIX','RÉFLEXION','PAROLE','ALERTE','ÉCOUTE'][n];
}
