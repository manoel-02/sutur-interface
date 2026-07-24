// ── GMAIL INTELLIGENT ────────────────────────────────────────────────────

async function sendDraftEmail(draft){
  try{
    const to=draft.to||prompt('Adresse email du destinataire :');
    if(!to){addMsg('ai','Envoi annulé — adresse manquante.');return}
    await apiCall('/google/gmail/send','POST',{to,subject:draft.subject||'',body:draft.body||''});
    addMsg('ai','✅ Email envoyé avec succès à '+to+' !',true);
  }catch(e){
    addMsg('ai','❌ Échec de l\'envoi. Vérifie que Gmail est connecté dans Config > Connexions.',true);
  }
}

function toggleAutoReply(){
  autoReplyEnabled = !autoReplyEnabled;
  const btn = document.getElementById('auto-reply-btn');
  if(btn){
    btn.textContent = autoReplyEnabled ? '⚡ Auto-réponse ON' : 'Auto-réponse OFF';
    btn.style.background = autoReplyEnabled ? 'rgba(248,113,113,.15)' : '';
    btn.style.borderColor = autoReplyEnabled ? 'rgba(248,113,113,.35)' : '';
    btn.style.color = autoReplyEnabled ? '#f87171' : '';
  }
  addMsg('ai', autoReplyEnabled
    ? '⚡ Mode auto-réponse activé — je répondrai automatiquement aux emails URGENTS en ton nom.'
    : '✋ Mode auto-réponse désactivé — je te proposerai les réponses avant envoi.', false);
}

async function loadSmartEmails(){
  const status = document.getElementById('email-status');
  const list = document.getElementById('email-list');
  status.textContent = '📡 Récupération des emails...';
  list.innerHTML = '<div style="color:var(--gold);font-size:12px;text-align:center;padding:16px">Analyse en cours...</div>';
  try{
    const data = await apiCall('/google/gmail?max_results=10');
    const emails = data.emails || [];
    if(!emails.length){
      status.textContent = '';
      list.innerHTML = '<div style="color:rgba(120,80,255,.35);font-size:12px;text-align:center;padding:16px">Aucun email non lu</div>';
      return;
    }
    status.textContent = `${emails.length} emails trouvés — analyse en cours...`;
    list.innerHTML = emails.map(e=>`
      <div onclick="analyzeEmail('${e.id}')" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:8px;cursor:pointer;transition:all .2s" onmouseover="this.style.borderColor='rgba(139,92,246,.4)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
          <div style="font-size:12px;color:var(--text-primary);font-weight:500;flex:1;margin-right:8px">${(e.subject||'Sans sujet').substring(0,50)}</div>
          <div style="font-size:10px;color:var(--text-muted);white-space:nowrap">${e.id.substring(0,8)}...</div>
        </div>
        <div style="font-size:11px;color:var(--gold);margin-bottom:3px">📧 ${(e.from||'').substring(0,40)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${(e.snippet||'').substring(0,80)}...</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px;text-align:right">Cliquer pour analyser →</div>
      </div>`).join('');
    status.textContent = `${emails.length} emails — clique sur un pour l'analyser`;
  }catch(e){
    status.textContent = '';
    list.innerHTML = '<div style="color:#f87171;font-size:12px;text-align:center;padding:16px">Google non connecté ou erreur</div>';
  }
}

async function analyzeEmail(emailId){
  const detail = document.getElementById('email-detail');
  const content = document.getElementById('email-analysis-content');
  const status = document.getElementById('email-status');
  const replyEditor = document.getElementById('reply-editor');
  const replyStatus = document.getElementById('reply-status');
  detail.style.display = 'block';
  replyEditor.style.display = 'none';
  replyStatus.textContent = '';
  content.innerHTML = '<div style="color:var(--gold);font-size:12px;text-align:center;padding:12px">🧠 Analyse IA en cours...</div>';
  status.textContent = 'Analyse de l\'email...';
  try{
    const data = await apiCall('/google/gmail/analyze','POST',{
      email_id: emailId,
      auto_reply: autoReplyEnabled
    });
    currentEmailData = data;
    const a = data.analysis || {};
    const urgence = a.urgence || 'INFO';
    const style = URGENCE_COLORS[urgence] || URGENCE_COLORS['INFO'];
    document.getElementById('email-detail-title').textContent = `${style.icon} ANALYSE — ${urgence}`;
    content.innerHTML = `
      <div style="background:${style.bg};border:1px solid ${style.border};border-radius:10px;padding:10px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:13px;font-weight:600;color:${style.color}">${style.icon} ${urgence}</span>
          <span style="font-size:10px;color:var(--text-muted)">Score: ${a.urgence_score||'?'}/10 · ${a.delai||'?'}</span>
        </div>
        <div style="font-size:12px;color:var(--text-secondary)"><strong>De:</strong> ${(data.email?.from||'').substring(0,60)}</div>
        <div style="font-size:12px;color:var(--text-secondary)"><strong>Sujet:</strong> ${data.email?.subject||''}</div>
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:10px;color:var(--gold);letter-spacing:1px;margin-bottom:5px">📋 COMPTE RENDU</div>
        <div style="font-size:13px;color:var(--text-primary);line-height:1.6">${a.compte_rendu||''}</div>
      </div>
      ${a.points_cles?.length ? `
      <div style="margin-bottom:10px">
        <div style="font-size:10px;color:var(--gold);letter-spacing:1px;margin-bottom:5px">🎯 POINTS CLÉS</div>
        ${a.points_cles.map(p=>`<div style="padding:3px 0 3px 10px;border-left:2px solid var(--violet-light);font-size:12px;color:var(--text-secondary);margin-bottom:3px">${p}</div>`).join('')}
      </div>` : ''}
      ${a.action_requise ? `
      <div style="background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.2);border-radius:8px;padding:8px;margin-bottom:10px">
        <div style="font-size:10px;color:var(--gold);letter-spacing:1px;margin-bottom:3px">⚡ ACTION REQUISE</div>
        <div style="font-size:12px;color:var(--text-primary)">${a.action_requise}</div>
      </div>` : ''}
      <div style="margin-bottom:6px">
        <div style="font-size:10px;color:var(--gold);letter-spacing:1px;margin-bottom:5px">✉️ RÉPONSE SUGGÉRÉE</div>
        <div style="font-size:12px;color:var(--text-secondary);background:var(--surface-2,rgba(255,255,255,.03));border-radius:8px;padding:10px;line-height:1.6;white-space:pre-wrap;max-height:150px;overflow-y:auto">${a.reponse_suggeree||''}</div>
      </div>`;

    if(data.auto_sent){
      replyStatus.style.color = '#4ade80';
      replyStatus.textContent = '✅ Réponse envoyée automatiquement (email URGENT)';
      addMsg('ai', `📬 J'ai répondu automatiquement à l'email urgent de **${data.email?.from?.split('<')[0].trim()}** — Sujet: "${data.email?.subject}".\n\n${a.compte_rendu}`, true);
    }
    status.textContent = `Analyse terminée — ${urgence}`;
  }catch(e){
    content.innerHTML = '<div style="color:#f87171;font-size:12px;text-align:center">Erreur analyse — vérifie la connexion Google</div>';
    status.textContent = '';
  }
}

async function sendSuggestedReply(){
  if(!currentEmailData) return;
  const a = currentEmailData.analysis || {};
  const status = document.getElementById('reply-status');
  status.style.color = 'var(--gold)'; status.textContent = 'Envoi en cours...';
  try{
    await apiCall('/google/gmail/reply','POST',{
      email_id: currentEmailData.email?.id || '',
      body: a.reponse_suggeree || '',
      to: currentEmailData.email?.from || '',
      subject: currentEmailData.email?.subject || ''
    });
    status.style.color = '#4ade80';
    status.textContent = '✅ Réponse envoyée !';
    addMsg('ai', `✅ Email envoyé à **${currentEmailData.email?.from?.split('<')[0].trim()}**.`, false);
  }catch(e){
    status.style.color = '#f87171';
    status.textContent = 'Erreur envoi';
  }
}

function editAndSend(){
  const editor = document.getElementById('reply-editor');
  const a = currentEmailData?.analysis || {};
  document.getElementById('reply-text').value = a.reponse_suggeree || '';
  editor.style.display = editor.style.display === 'none' ? 'block' : 'none';
}

async function sendEditedReply(){
  if(!currentEmailData) return;
  const body = document.getElementById('reply-text').value.trim();
  const status = document.getElementById('reply-status');
  if(!body){ status.textContent = 'Le message est vide'; return; }
  status.style.color = 'var(--gold)'; status.textContent = 'Envoi...';
  try{
    await apiCall('/google/gmail/reply','POST',{
      email_id: currentEmailData.email?.id || '',
      body,
      to: currentEmailData.email?.from || '',
      subject: currentEmailData.email?.subject || ''
    });
    status.style.color = '#4ade80';
    status.textContent = '✅ Réponse envoyée !';
    document.getElementById('reply-editor').style.display = 'none';
  }catch(e){
    status.style.color = '#f87171';
    status.textContent = 'Erreur envoi';
  }
}
