// ── ÉTAT GLOBAL PARTAGÉ ──────────────────────────────────────────────────
// Chargé en premier : toutes les variables ici sont utilisées par plusieurs
// modules. Sutur n'utilise pas de bundler (scripts classiques), donc l'ordre
// de chargement dans index.html fait foi — ce fichier doit toujours être le
// premier <script> chargé.

const bgc=document.getElementById('bgc'),bc=bgc.getContext('2d');
let BW,BH;
const STARS=Array.from({length:150},()=>({x:Math.random(),y:Math.random(),r:.2+Math.random()*1.1,a:Math.random()*Math.PI*2,tw:.003+Math.random()*.012}));
const SHOOTERS=Array.from({length:3},()=>({active:false,x:0,y:0,vx:0,vy:0,life:0,max:0}));
let stTimer=0;
const gc=document.getElementById('globe');
const gctx=gc.getContext('2d');
let GW=200,GH=200,gMode=0,gT=0,voiceModeActive=false;
let threeLoaded=false,threeLoadingPromise=null,use3DGlobe=false;
let three_scene=null,three_camera=null,three_renderer=null;
let three_group=null,three_core=null,three_tendrils=null,three_stars=null;
let coreOrigins=null,coreDirs=null,tendrilBaseDirs=null,tendrilAlong=null,tendrilIdxArr=null;
let highlightOrigins=null,highlightDirs=null;
let three_burst=null,three_burstVelocities=null,burstActive=false,burstStartTime=0;
let three_highlights=null,touchReactPhase=0;
let greetPulse=0;
const GMODES=[
  {name:'VEILLE',col:'#8b5cf6',glow:'139,92,246',gold:'201,162,39',speed:1},
  {name:'RÉFLEXION',col:'#c9a227',glow:'201,162,39',gold:'139,92,246',speed:2.8},
  {name:'PAROLE',col:'#4ade80',glow:'74,222,128',gold:'201,162,39',speed:1.8},
  {name:'ALERTE',col:'#f87171',glow:'248,113,113',gold:'201,162,39',speed:3.5},
  {name:'ÉCOUTE',col:'#00d4ff',glow:'0,212,255',gold:'201,162,39',speed:1.4},
];
let gActive=false,gThink=false;
let micAmplitude=0,ttsAmplitude=0;
let micAudioCtx=null,micAnalyser=null,micDataArray=null,micRafId=null,micVisStream=null;
let ttsDecodeCtx=null,ttsPcm=null,ttsSampleRate=44100,ttsRafId=null;
let ttsAnalysisId=0;
let userGender='m', currentAvatarCtx='default';
const AVATAR_CONTEXTS={
  default:{label:'Assistant'},
  psy:{label:'Thérapeute',keywords:['stress','anxieux','anxiété','déprimé','triste','émotionnel','sentiment','ressens','mal','pleurer','peur','angoisse','soutien','écoute']},
  business:{label:'Conseiller',keywords:['finance','argent','budget','investissement','business','entreprise','vente','revenu','dépense','bénéfice','profit','stratégie']},
  tech:{label:'Ingénieur IA',keywords:['code','programmation','développement','ia','intelligence artificielle','algorithme','application','logiciel','bug','api','données']},
  health:{label:'Médecin',keywords:['santé','médecin','maladie','symptôme','douleur','médicament','traitement','docteur','hôpital','fatigue','sommeil']},
  coach:{label:'Coach',keywords:['motivation','objectif','sport','exercice','performance','succès','défi','améliorer','progresser','discipline']}
};
let TOKEN='',API_URL='',EL_KEY='',PASS='',history=[],busy=false,micActive=false,selApp='youtube',currentBrief='',userIsOwner=false,userLocation=null,currentUserName='',onboarding=false,onboardingStep='';
let voiceLoopActive=false,voiceRecognition=null,voiceLoopErrorCount=0,voiceNetworkBackoff=false;
let rdStreaming = false;
let rdStreamInterval = null;
let rdStatusInterval = null;
let rdFrameCount = 0;
let rdLastFrameTs = 0;
let rdConnected = false;
let rdConsecutiveFailures = 0;
const RD_LOCK_ACTIONS={
  unlock:{endpoint:'/remote/unlock',title:'DÉVERROUILLER LE PC',icon:'🔓',verb:'Déverrouillage',doneMsg:'PC déverrouillé'},
  lock:{endpoint:'/remote/lock',title:'VERROUILLER LE PC',icon:'🔒',verb:'Verrouillage',doneMsg:'PC verrouillé'},
  sleep:{endpoint:'/remote/sleep',title:'METTRE LE PC EN VEILLE',icon:'💤',verb:'Mise en veille',doneMsg:'PC en veille'}
};
let rdCurrentLockAction='unlock';
const SYS_ICONS = {
  ok: '✅', error: '❌', degraded: '⚠️',
  not_configured: '⚙️', configured: '✅',
  connected: '✅', not_connected: '⚪', healthy: '✅',
  critical: '🔴', warning: '🟡'
};
let currentPage=null;
let currentAudio=null;
let ttsPlaying=false;
let currentPhotoB64 = null;
let currentPhotoType = 'image/jpeg';
let permsRequested = false;
let currentDelegateReport = '';
let allContacts=[];
let focusTimer=null,focusSeconds=0,focusTotalSeconds=25*60,focusIsBreak=false,focusDuration=25;
let meetRecorder=null,meetChunks=[],meetStream=null,meetMode='mic',meetTimerInterval=null,meetSeconds=0,meetAnalyser=null,meetAnimFrame=null;
const CURRENCY_SYMBOLS={XOF:'FCFA',USD:'$',EUR:'€'};
let autoReplyEnabled = false;
let currentEmailData = null;
const URGENCE_COLORS = {
  'URGENT': {bg:'rgba(248,113,113,.12)',border:'rgba(248,113,113,.35)',color:'#f87171',icon:'🔴'},
  'IMPORTANT': {bg:'rgba(201,162,39,.08)',border:'rgba(201,162,39,.3)',color:'#c9a227',icon:'🟡'},
  'INFO': {bg:'rgba(74,222,128,.06)',border:'rgba(74,222,128,.2)',color:'#4ade80',icon:'🟢'},
  'SPAM': {bg:'rgba(120,80,255,.05)',border:'rgba(120,80,255,.15)',color:'rgba(160,151,196,.5)',icon:'⚫'},
};
let leafletLoaded=false,leafletLoadingPromise=null;
let agentsMapInstance=null,agentsMapMarkers=[];
let persistentMapInstance=null,persistentMapMarker=null;
let mapIsActive=false;
const VAPID_PUBLIC_KEY='BB205SQgaEeCyXLCW7K3l1szOowMkXs61Fxkc0oJCKA9L1tNAVjk4VhDzkZ6rWLmwUxFsYlDUoqmO1wsOjMAjvw';
let currentTrendCategory='general';
let csvRows=[], csvHeaders=[];
