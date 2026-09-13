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
  const sources=[
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js', // secours si le premier CDN est bloqué/indisponible
  ];
  const tryLoad=(i)=>new Promise((resolve,reject)=>{
    if(i>=sources.length){reject(new Error('Three.js indisponible (tous les CDN ont échoué)'));return;}
    const script=document.createElement('script');
    script.src=sources[i];
    script.onload=()=>{threeLoaded=true;resolve();};
    script.onerror=()=>{
      console.warn(`[globe] échec du CDN Three.js (${sources[i]}), tentative suivante...`);
      tryLoad(i+1).then(resolve,reject);
    };
    document.head.appendChild(script);
  });
  threeLoadingPromise=tryLoad(0).catch(e=>{threeLoadingPromise=null;throw e;});
  return threeLoadingPromise;
}

function lerp(a,b,t){return a+(b-a)*t;}

// ── Bruit simplex 3D — algorithme standard (Stefan Gustavson, domaine public),
// utilisé pour donner à la masse organique son mouvement fluide et continu,
// jamais répétitif, jamais figé. Validé séparément avant intégration : lisse
// en tout point testé, plage de valeurs correcte. ──────────────────────────
class SimplexNoise3D{
  constructor(seed=42){
    this.p=new Uint8Array(256);
    let s=seed;
    const rand=()=>{s=(s*16807)%2147483647;return (s-1)/2147483646;};
    for(let i=0;i<256;i++)this.p[i]=i;
    for(let i=255;i>0;i--){const j=Math.floor(rand()*(i+1));[this.p[i],this.p[j]]=[this.p[j],this.p[i]];}
    this.perm=new Uint8Array(512);
    for(let i=0;i<512;i++)this.perm[i]=this.p[i&255];
  }
  grad(hash,x,y,z){
    const h=hash&15;
    const u=h<8?x:y, v=h<4?y:(h===12||h===14?x:z);
    return ((h&1)===0?u:-u)+((h&2)===0?v:-v);
  }
  noise(x,y,z){
    const F3=1/3, G3=1/6;
    const s=(x+y+z)*F3;
    const i=Math.floor(x+s), j=Math.floor(y+s), k=Math.floor(z+s);
    const t=(i+j+k)*G3;
    const X0=i-t, Y0=j-t, Z0=k-t;
    const x0=x-X0, y0=y-Y0, z0=z-Z0;
    let i1,j1,k1,i2,j2,k2;
    if(x0>=y0){
      if(y0>=z0){i1=1;j1=0;k1=0;i2=1;j2=1;k2=0;}
      else if(x0>=z0){i1=1;j1=0;k1=0;i2=1;j2=0;k2=1;}
      else{i1=0;j1=0;k1=1;i2=1;j2=0;k2=1;}
    }else{
      if(y0<z0){i1=0;j1=0;k1=1;i2=0;j2=1;k2=1;}
      else if(x0<z0){i1=0;j1=1;k1=0;i2=0;j2=1;k2=1;}
      else{i1=0;j1=1;k1=0;i2=1;j2=1;k2=0;}
    }
    const x1=x0-i1+G3, y1=y0-j1+G3, z1=z0-k1+G3;
    const x2=x0-i2+2*G3, y2=y0-j2+2*G3, z2=z0-k2+2*G3;
    const x3=x0-1+3*G3, y3=y0-1+3*G3, z3=z0-1+3*G3;
    const ii=i&255, jj=j&255, kk=k&255;
    let n0=0,n1=0,n2=0,n3=0;
    let t0=0.6-x0*x0-y0*y0-z0*z0;
    if(t0>=0){t0*=t0;n0=t0*t0*this.grad(this.perm[ii+this.perm[jj+this.perm[kk]]],x0,y0,z0);}
    let t1=0.6-x1*x1-y1*y1-z1*z1;
    if(t1>=0){t1*=t1;n1=t1*t1*this.grad(this.perm[ii+i1+this.perm[jj+j1+this.perm[kk+k1]]],x1,y1,z1);}
    let t2=0.6-x2*x2-y2*y2-z2*z2;
    if(t2>=0){t2*=t2;n2=t2*t2*this.grad(this.perm[ii+i2+this.perm[jj+j2+this.perm[kk+k2]]],x2,y2,z2);}
    let t3=0.6-x3*x3-y3*y3-z3*z3;
    if(t3>=0){t3*=t3;n3=t3*t3*this.grad(this.perm[ii+1+this.perm[jj+1+this.perm[kk+1]]],x3,y3,z3);}
    return 32*(n0+n1+n2+n3);
  }
}
const symbioteNoise=new SimplexNoise3D(7);

function buildOrganicCore(n){
  // Masse centrale — remplissage plus dense du volume (pas juste la coquille de
  // surface) pour une vraie sensation de matière/substance plutôt qu'un nuage
  // épars. Couleurs éclaircies pour plus de présence visuelle.
  const positions=[],origins=[],dirs=[],colors=[];
  for(let i=0;i<n;i++){
    const theta=Math.random()*Math.PI*2;
    const phi=Math.acos(Math.random()*2-1);
    const shell=0.4+Math.random()*0.6; // remplit davantage le volume, pas que la surface
    const dx=Math.sin(phi)*Math.cos(theta), dy=Math.cos(phi), dz=Math.sin(phi)*Math.sin(theta);
    const r=0.85*shell;
    positions.push(dx*r,dy*r,dz*r);
    origins.push(dx*r,dy*r,dz*r);
    dirs.push(dx,dy,dz);
    // Dégradé violet vif (cœur) -> magenta lumineux (surface), plus lumineux qu'avant
    const t=shell;
    colors.push(lerp(0.5,0.85,t),lerp(0.22,0.35,t),lerp(0.75,1.0,t));
  }
  return {positions,origins,dirs,colors};
}

function buildHighlights(n){
  // Points de lumière denses juste sous la surface — donne l'aspect "brillant,
  // presque humide" façon matière organique vivante, pas un dégradé plat.
  const positions=[],origins=[],dirs=[],colors=[];
  for(let i=0;i<n;i++){
    const theta=Math.random()*Math.PI*2;
    const phi=Math.acos(Math.random()*2-1);
    const shell=0.85+Math.random()*0.18; // concentré près de la surface externe
    const dx=Math.sin(phi)*Math.cos(theta), dy=Math.cos(phi), dz=Math.sin(phi)*Math.sin(theta);
    const r=0.85*shell;
    positions.push(dx*r,dy*r,dz*r);
    origins.push(dx*r,dy*r,dz*r);
    dirs.push(dx,dy,dz);
    colors.push(0.95,0.9,1.0); // quasi blanc — reflets lumineux
  }
  return {positions,origins,dirs,colors};
}

function buildTendrils(count,perTendril){
  // Tentacules façon symbiote — partent de la surface du cœur et s'étendent
  // vers l'extérieur, chacune ondulant selon le bruit perpendiculairement à
  // son axe. La portée réagit à l'écoute (s'étend) et à la réflexion (s'agite).
  const positions=[],baseDirs=[],tendrilIdx=[],alongIdx=[],colors=[];
  const golden=Math.PI*(3-Math.sqrt(5));
  for(let tI=0;tI<count;tI++){
    const y=1-(tI/(count-1))*2;
    const rad=Math.sqrt(1-y*y);
    const theta=golden*tI;
    const bx=Math.cos(theta)*rad, by=y, bz=Math.sin(theta)*rad;
    for(let i=0;i<perTendril;i++){
      const along=i/(perTendril-1);
      positions.push(bx*(0.85+along*0.9),by*(0.85+along*0.9),bz*(0.85+along*0.9));
      baseDirs.push(bx,by,bz);
      tendrilIdx.push(tI);
      alongIdx.push(along);
      // Dégradé magenta lumineux (base) -> or vif (pointe)
      colors.push(lerp(0.85,0.95,along),lerp(0.3,0.75,along),lerp(0.95,0.3,along));
    }
  }
  return {positions,baseDirs,tendrilIdx,alongIdx,colors};
}

function buildStarfield(n,spread){
  // Champ d'étoiles ambiant — l'aspect "fin fond de la galaxie" demandé,
  // séparé de la masse elle-même pour tourner à une vitesse différente (parallaxe).
  const pts=[];
  for(let i=0;i<n;i++){
    const r=spread*(0.5+Math.random()*0.5);
    const theta=Math.random()*Math.PI*2;
    const phi=Math.acos(Math.random()*2-1);
    pts.push(
      r*Math.sin(phi)*Math.cos(theta),
      r*Math.sin(phi)*Math.sin(theta),
      r*Math.cos(phi)*0.4-0.6
    );
  }
  return pts;
}

function makePoints(positionsArray,color,size,opacity,vertexColorsArray){
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(positionsArray),3));
  const matOpts={
    color,size,transparent:true,opacity,
    sizeAttenuation:true,blending:THREE.AdditiveBlending,depthWrite:false
  };
  if(vertexColorsArray){
    geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(vertexColorsArray),3));
    matOpts.vertexColors=true;
  }
  const mat=new THREE.PointsMaterial(matOpts);
  return new THREE.Points(geo,mat);
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

async function initGlobe3D(){
  try{
    if(!window.WebGLRenderingContext)throw new Error('WebGL non supporté');
    await ensureThreeJS();
    const canvas3d=document.getElementById('globe3d');
    if(!canvas3d)throw new Error('canvas 3D introuvable');

    three_scene=new THREE.Scene();
    three_camera=new THREE.PerspectiveCamera(45,1,0.1,100);
    three_camera.position.z=2.9;

    three_renderer=new THREE.WebGLRenderer({canvas:canvas3d,alpha:true,antialias:true});
    three_renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));

    three_group=new THREE.Group();

    // Masse organique centrale — cœur en mouvement perpétuel, jamais figée,
    // densifiée et éclaircie pour une vraie sensation de matière/substance.
    const core=buildOrganicCore(1900);
    coreOrigins=core.origins;
    coreDirs=core.dirs;
    three_core=makePoints(core.positions,0x8b5cf6,0.038,0.92,core.colors);

    // Reflets lumineux quasi-blancs près de la surface — aspect "brillant,
    // presque humide" façon matière organique vivante plutôt qu'un dégradé plat.
    const highlights=buildHighlights(260);
    highlightOrigins=highlights.origins;
    highlightDirs=highlights.dirs;
    three_highlights=makePoints(highlights.positions,0xffffff,0.022,0.55,highlights.colors);

    // Tentacules — s'étendent depuis la surface, ondulent en continu, réagissent
    // à l'écoute (s'étendent), à la réflexion (s'agitent) et au toucher (fouettent).
    const tendrils=buildTendrils(7,42);
    tendrilBaseDirs=tendrils.baseDirs;
    tendrilAlong=tendrils.alongIdx;
    tendrilIdxArr=tendrils.tendrilIdx;
    three_tendrils=makePoints(tendrils.positions,0xd4af37,0.028,0.85,tendrils.colors);

    three_stars=makePoints(buildStarfield(900,3.2),0xffffff,0.018,0.55);

    const burstData=buildBurst(220);
    three_burstVelocities=burstData.velocities;
    three_burst=makePoints(burstData.positions,0xffffff,0.032,0);

    three_group.add(three_core,three_highlights,three_tendrils);
    three_scene.add(three_group);
    three_scene.add(three_stars); // hors du groupe : tourne indépendamment (parallaxe)
    three_scene.add(three_burst); // hors du groupe : l'explosion ne doit pas hériter de sa rotation

    // ── Effet galactique au clic/tap — déclenche aussi une réaction "fouet"
    // sur les tentacules, comme si la masse réagissait vivement au contact ──
    canvas3d.style.cursor='pointer';
    canvas3d.style.touchAction='manipulation';
    canvas3d.addEventListener('click',()=>{
      burstActive=true;
      burstStartTime=performance.now();
      touchReactPhase=1.0;
    });

    use3DGlobe=true;
    document.getElementById('globe3d').style.display='block';
    resizeGlobe3D();
  }catch(e){
    console.warn('Masse organique 3D indisponible, repli sur le rendu 2D existant:',e.message);
    use3DGlobe=false;
    // Une seule nouvelle tentative après un court délai — couvre le cas fréquent sur
    // mobile où le tout premier chargement de page tente de charger le CDN avant que
    // le réseau soit pleinement prêt. Pas de boucle infinie : si ça échoue encore,
    // le repli 2D (maintenant un vrai nuage de particules, pas l'ancien anneau) reste
    // parfaitement présentable pour le reste de la session.
    if(!window._globe3dRetried){
      window._globe3dRetried=true;
      setTimeout(()=>{ if(!use3DGlobe) initGlobe3D(); },4000);
    }
  }
}

function resizeGlobe3D(){
  if(!use3DGlobe||!three_renderer)return;
  three_renderer.setSize(GW,GH,false);
  three_camera.aspect=1;
  three_camera.updateProjectionMatrix();
}

function renderGlobe3D(t){
  if(!use3DGlobe||!three_core)return;
  const m=GMODES[gMode];
  const tSec=t*0.016; // approx secondes, à raison de ~60 images/seconde
  const col=new THREE.Color(m.col);

  // ── Intensité du bruit selon le mode — le cœur "respire" toujours, mais
  // plus ou moins vite/fort selon ce que Sutur fait réellement ─────────────
  let noiseFreq=1.15, noiseAmp=0.15, noiseSpeed=0.15;
  if(gMode===1){ noiseFreq=1.5; noiseAmp=0.24; noiseSpeed=0.4; }             // réflexion : turbulence accrue
  if(gMode===2){ noiseAmp=0.14+ttsAmplitude*0.4; noiseSpeed=0.15+ttsAmplitude*0.5; } // parole : pulse avec la vraie voix
  if(gMode===3){ noiseAmp=0.32; noiseSpeed=0.7; }                            // alerte : agitation
  if(gMode===4){ noiseAmp=0.15+micAmplitude*0.25; }                          // écoute : frémit avec le micro
  noiseAmp*=1+touchReactPhase*0.6; // léger sursaut du cœur lui-même au contact

  // ── Déformation du cœur — chaque particule se déplace le long de SA propre
  // direction radiale selon le bruit à sa position d'origine + le temps, ce qui
  // donne une ondulation cohérente et organique plutôt qu'un scintillement confus.
  const posAttr=three_core.geometry.attributes.position;
  const n=coreOrigins.length/3;
  for(let i=0;i<n;i++){
    const ox=coreOrigins[i*3],oy=coreOrigins[i*3+1],oz=coreOrigins[i*3+2];
    const dx=coreDirs[i*3],dy=coreDirs[i*3+1],dz=coreDirs[i*3+2];
    const nv=symbioteNoise.noise(ox*noiseFreq+tSec*noiseSpeed,oy*noiseFreq+tSec*noiseSpeed*.6,oz*noiseFreq);
    const disp=nv*noiseAmp;
    posAttr.setXYZ(i,ox+dx*disp,oy+dy*disp,oz+dz*disp);
  }
  posAttr.needsUpdate=true;
  three_core.material.color.copy(col);

  // ── Reflets lumineux — suivent le cœur avec un bruit plus rapide et léger,
  // pour ce scintillement "humide" qui donne l'impression d'une vraie matière ─
  const posAttrH=three_highlights.geometry.attributes.position;
  const nH=highlightOrigins.length/3;
  for(let i=0;i<nH;i++){
    const ox=highlightOrigins[i*3],oy=highlightOrigins[i*3+1],oz=highlightOrigins[i*3+2];
    const dx=highlightDirs[i*3],dy=highlightDirs[i*3+1],dz=highlightDirs[i*3+2];
    const nv=symbioteNoise.noise(ox*noiseFreq*1.4+tSec*(noiseSpeed*1.6),oy*noiseFreq*1.4+tSec*(noiseSpeed*1.6)*.6,oz*noiseFreq*1.4);
    const disp=nv*noiseAmp*1.1;
    posAttrH.setXYZ(i,ox+dx*disp,oy+dy*disp,oz+dz*disp);
  }
  posAttrH.needsUpdate=true;

  // ── Réaction au toucher — un clic/tap fait "fouetter" les tentacules,
  // plus vite et plus fort, façon symbiote qui réagit au contact. Décroît
  // ensuite tout seul vers la normale sur environ 1,4 seconde. ──────────────
  touchReactPhase=Math.max(0,touchReactPhase-1/60/1.4);
  const touchBoost=1+touchReactPhase*2.8;
  const touchSpeedBoost=1+touchReactPhase*2.2;

  // ── Tentacules — portée réactive (l'écoute les fait s'étendre, comme si Sutur
  // "tendait l'oreille"), ondulation perpendiculaire à leur axe façon symbiote ──
  let reach=1.0;
  if(gMode===4)reach=1.0+micAmplitude*1.3;
  if(gMode===1)reach=1.18;
  if(gMode===2)reach=1.0+ttsAmplitude*0.3;
  reach*=1+touchReactPhase*0.15; // s'étend aussi légèrement au contact

  const posAttrT=three_tendrils.geometry.attributes.position;
  const nT=tendrilBaseDirs.length/3;
  for(let i=0;i<nT;i++){
    const bx=tendrilBaseDirs[i*3],by=tendrilBaseDirs[i*3+1],bz=tendrilBaseDirs[i*3+2];
    const along=tendrilAlong[i],tIdx=tendrilIdxArr[i];
    const baseR=0.85+along*0.9*reach;
    const w1=symbioteNoise.noise(tIdx*2.3+along*3+tSec*0.5*touchSpeedBoost,tIdx*1.1,0);
    const w2=symbioteNoise.noise(0,tIdx*2.3+along*3+tSec*0.45*touchSpeedBoost,tIdx*1.7);
    const wobble=0.1*along*(gMode===1?1.6:1)*touchBoost;
    posAttrT.setXYZ(i,bx*baseR+w1*wobble,by*baseR+w2*wobble,bz*baseR+w1*wobble*.7);
  }
  posAttrT.needsUpdate=true;
  three_tendrils.material.color.copy(col);

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
      const posAttrB=three_burst.geometry.attributes.position;
      for(let i=0;i<posAttrB.count;i++){
        posAttrB.setXYZ(i,
          three_burstVelocities[i*3]*progress*2.4,
          three_burstVelocities[i*3+1]*progress*2.4,
          three_burstVelocities[i*3+2]*progress*2.4
        );
      }
      posAttrB.needsUpdate=true;
      three_burst.material.opacity=(1-progress)*0.9;
      three_burst.material.color.setHSL(0.75-progress*0.2,1,0.55+progress*0.3);
    }
  }

  // ── Signal d'accueil — bref éclat quand le mode vocal vient de s'ouvrir ────
  greetPulse=Math.max(0,greetPulse-1/60*0.8);
  const greetBoost=1+greetPulse*0.25;

  // ── Mouvement d'ensemble — flottement lent, jamais parfaitement figé,
  // comme un organisme qui dérive doucement dans l'espace ────────────────────
  three_group.rotation.y=Math.sin(tSec*.18)*.22+tSec*0.03;
  three_group.rotation.x=Math.sin(tSec*.13)*.08;
  three_group.position.y=Math.sin(tSec*.3)*.04;
  const breathe=(1+Math.sin(tSec*.25)*.02+(gMode===2?ttsAmplitude*.06:0))*greetBoost;
  three_group.scale.setScalar(breathe);

  // ── Champ d'étoiles galactique — tourne lentement, indépendant de la masse ──
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

let _cloud2DParticles=null;
function buildCloud2DParticles(n){
  // Distribution sphérique projetée en 2D, densifiée vers le centre — même esprit
  // que la masse organique 3D (buildOrganicCore), en beaucoup plus simple puisque
  // ce repli 2D n'a pas besoin d'un vrai volume, juste de donner l'impression d'un
  // nuage de matière vivante vu de face.
  const pts=[];
  for(let i=0;i<n;i++){
    const u=Math.random(),v=Math.random();
    const r=Math.pow(Math.random(),0.65); // plus dense vers le centre qu'une distribution uniforme
    const theta=u*Math.PI*2;
    const depth=Math.random(); // simule la profondeur -> taille/opacité variables
    pts.push({
      baseAngle:theta, baseR:r,
      phase:Math.random()*Math.PI*2,
      speed:0.4+Math.random()*0.8,
      depth, size:0.6+depth*1.8,
    });
  }
  return pts;
}

function drawGlobe(t){
  gctx.clearRect(0,0,GW,GH);
  // Quand le visage 3D est actif, TOUT le rendu se fait dans renderGlobe3D() —
  // ce canvas 2D ne sert plus que de repli si la 3D n'a pas pu se charger.
  if(use3DGlobe)return;
  if(!_cloud2DParticles)_cloud2DParticles=buildCloud2DParticles(260);

  const cx=GW/2,cy=GH/2;
  const m=GMODES[gMode];
  const R=GW*.36;
  const liveAmp=gMode===4?micAmplitude:(gMode===2?ttsAmplitude:0);
  const agitation=gMode===3?1.8:gMode===1?1.4:1; // alerte/réflexion : nuage plus agité
  const pulse=1+.05*Math.sin(t*.03)+liveAmp*.35;

  // Halo doux derrière le nuage, pour donner du volume sans revenir à un anneau net
  const halo=gctx.createRadialGradient(cx,cy,0,cx,cy,R*1.6*pulse);
  halo.addColorStop(0,`rgba(${m.glow},.16)`);
  halo.addColorStop(1,'transparent');
  gctx.fillStyle=halo;gctx.beginPath();gctx.arc(cx,cy,R*1.6*pulse,0,Math.PI*2);gctx.fill();

  // ── Nuage de particules — vivant, jamais figé, jamais un simple anneau statique
  for(const p of _cloud2DParticles){
    const wobble=Math.sin(t*.02*p.speed*agitation+p.phase)*0.12;
    const r=(p.baseR+wobble)*R*pulse;
    const angle=p.baseAngle+Math.sin(t*.01*p.speed+p.phase)*0.15;
    const px=cx+Math.cos(angle)*r;
    const py=cy+Math.sin(angle)*r*.82; // légèrement aplati, cohérent avec la vue 3D de face
    const alpha=(0.25+p.depth*0.55)*(gMode===4?0.7+micAmplitude*0.6:1);
    gctx.beginPath();
    gctx.arc(px,py,p.size*(gMode===2?1+ttsAmplitude*0.6:1),0,Math.PI*2);
    gctx.fillStyle=p.depth>0.75?`rgba(255,255,255,${alpha*.8})`:`rgba(${m.glow},${alpha})`;
    gctx.fill();
  }

  // ── Label mode, discret, sous le nuage — pas de "SUTUR"/"by OrbixLabs" ici,
  // déjà affichés dans l'en-tête, jamais dupliqués dans l'avatar lui-même.
  gctx.textAlign='center';
  gctx.font=`500 ${Math.round(R*.16)}px system-ui`;
  gctx.fillStyle=`rgba(${m.glow},.55)`;
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
  document.getElementById('hmod').textContent=['SUTUR','RÉFLEXION','PAROLE','ALERTE','ÉCOUTE'][n];
}
