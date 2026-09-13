// ── CLIENT API ──────────────────────────────────────────────────────────
// Wrapper unique pour tous les appels au backend Sutur.

async function apiCall(path,method='GET',body=null){
  const opts={method,headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN}};
  if(body)opts.body=JSON.stringify(body);
  try{
    const r=await fetch(API_URL+path,opts);
    if(!r.ok){
      const errText=await r.text().catch(()=>'Erreur serveur');
      let cleanMsg=errText;
      try{
        const parsed=JSON.parse(errText);
        if(parsed&&parsed.detail)cleanMsg=typeof parsed.detail==='string'?parsed.detail:JSON.stringify(parsed.detail);
      }catch(_){/* la réponse n'est pas du JSON — on garde le texte brut */}
      throw new Error(cleanMsg);
    }
    return await r.json();
  }catch(e){
    throw e;
  }
}
