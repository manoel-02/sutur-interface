// ── COUCHE RÉSEAU ─────────────────────────────────────────────────────────
// Wrapper unique pour tous les appels au backend Sutur. Chaque échec est CLASSÉ
// (hors-ligne, réseau, délai dépassé, session, limite, serveur) pour que
// l'interface puisse dire précisément ce qui s'est passé et quoi faire ensuite,
// au lieu d'un « erreur » générique. Aucun appel ne peut rester suspendu
// indéfiniment : chacun a un délai maximum.

const API_DEFAULT_TIMEOUT_MS=120000; // large : certaines opérations (analyse, génération de documents) sont longues

class ApiError extends Error{
  constructor(message,{kind='unknown',status=0}={}){
    super(message);
    this.name='ApiError';
    this.kind=kind;     // offline | network | timeout | auth | forbidden | notfound | ratelimit | server | client | parse
    this.status=status;
  }
}

function classifyHttpStatus(status){
  if(status===401)return 'auth';
  if(status===403)return 'forbidden';
  if(status===404)return 'notfound';
  if(status===429)return 'ratelimit';
  if(status>=500)return 'server';
  return 'client';
}

async function apiCall(path,method='GET',body=null,opts={}){
  const timeout=opts.timeout??API_DEFAULT_TIMEOUT_MS;
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeout);
  const fetchOpts={method,headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},signal:ctrl.signal};
  if(body)fetchOpts.body=JSON.stringify(body);
  try{
    const r=await fetch(API_URL+path,fetchOpts);
    if(!r.ok){
      const errText=await r.text().catch(()=>'Erreur serveur');
      let cleanMsg=errText;
      try{
        const parsed=JSON.parse(errText);
        if(parsed&&parsed.detail)cleanMsg=typeof parsed.detail==='string'?parsed.detail:JSON.stringify(parsed.detail);
      }catch(_){/* la réponse n'est pas du JSON — on garde le texte brut */}
      throw new ApiError(cleanMsg,{kind:classifyHttpStatus(r.status),status:r.status});
    }
    try{
      return await r.json();
    }catch(_){
      throw new ApiError('Réponse inattendue du serveur.',{kind:'parse',status:r.status});
    }
  }catch(e){
    if(e instanceof ApiError)throw e;
    if(e&&e.name==='AbortError')throw new ApiError('Le serveur met trop de temps à répondre.',{kind:'timeout'});
    const offline=typeof navigator!=='undefined'&&navigator.onLine===false;
    throw new ApiError(offline?'Pas de connexion internet.':'Impossible de joindre le serveur.',{kind:offline?'offline':'network'});
  }finally{
    clearTimeout(timer);
  }
}

// Message clair pour l'utilisateur selon la nature de l'échec — jamais « Error ».
function describeApiError(e){
  const kind=e&&e.kind;
  switch(kind){
    case 'offline':   return 'Pas de connexion internet.';
    case 'network':   return 'Impossible de joindre Sutur. Vérifie ta connexion.';
    case 'timeout':   return 'Sutur met plus de temps que prévu à répondre.';
    case 'auth':      return 'Ta session n\'est plus valide.';
    case 'ratelimit': return (e.message&&e.message.length<160)?e.message:'Trop de demandes en peu de temps.';
    case 'server':    return 'Sutur a rencontré un problème côté serveur.';
    default:          return (e&&e.message&&e.message.length<200)?e.message:'Une erreur inattendue est survenue.';
  }
}
