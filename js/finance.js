// ── FINANCES ─────────────────────────────────────────────────────────────

function fmtAmount(amount,currency){
  const sym=CURRENCY_SYMBOLS[currency]||currency;
  return currency==='XOF'?`${Math.round(amount).toLocaleString()} ${sym}`:`${sym}${amount.toFixed(2)}`;
}

async function loadFinance(){
  const month=new Date().toISOString().slice(0,7);
  try{
    const [sumData,txData]=await Promise.all([
      apiCall(`/finance/summary?month=${month}`),
      apiCall(`/finance/transactions?month=${month}&limit=30`)
    ]);
    renderFinanceSummary(sumData);
    renderFinanceList(txData.transactions||[]);
  }catch(e){
    document.getElementById('finance-summary').innerHTML='<div style="color:#f87171;text-align:center;padding:12px">Erreur de chargement</div>';
  }
}

function renderFinanceSummary(data){
  const balances=data.balance||{};
  const income=data.income||{};
  const expenses=data.expenses||{};
  const currencies=Object.keys({...income,...expenses});
  
  let balanceHtml=currencies.map(cur=>{
    const bal=balances[cur]||0;
    const color=bal>=0?'#4ade80':'#f87171';
    return `<div style="text-align:center;padding:0 10px">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">${cur}</div>
      <div style="font-size:20px;font-weight:700;color:${color}">${fmtAmount(Math.abs(bal),cur)}</div>
      <div style="font-size:10px;color:${color}">${bal>=0?'▲ excédent':'▼ déficit'}</div>
    </div>`;
  }).join('<div style="width:1px;background:var(--border)"></div>');

  let statsHtml=currencies.map(cur=>`
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)">
      <span style="font-size:13px;color:var(--text-muted)">💰 Revenus ${cur}</span>
      <span style="font-size:13px;color:#4ade80;font-weight:600">${fmtAmount(income[cur]||0,cur)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)">
      <span style="font-size:13px;color:var(--text-muted)">💸 Dépenses ${cur}</span>
      <span style="font-size:13px;color:#f87171;font-weight:600">${fmtAmount(expenses[cur]||0,cur)}</span>
    </div>`).join('');

  const topCats=(data.top_categories||[]).map(([cat,amt])=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
      <span style="font-size:12px;color:var(--text-secondary)">${cat}</span>
      <span style="font-size:12px;color:var(--gold);font-weight:600">${amt.toLocaleString()}</span>
    </div>`).join('');

  document.getElementById('finance-summary').innerHTML=`
    <div style="background:var(--surface);border:1px solid var(--border-gold);border-radius:14px;padding:14px;margin-bottom:10px">
      <div style="font-size:10px;color:var(--gold);letter-spacing:2px;margin-bottom:10px">SOLDE ${data.month||''}</div>
      <div style="display:flex;justify-content:center;gap:0;margin-bottom:14px">${balanceHtml||'<span style="color:var(--text-muted);font-size:13px">Aucune donnée</span>'}</div>
      ${statsHtml}
      ${topCats?`<div style="margin-top:10px"><div style="font-size:10px;color:var(--text-muted);letter-spacing:1px;margin-bottom:6px">TOP CATÉGORIES</div>${topCats}</div>`:''}
    </div>
    ${data.analysis?`<div style="background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.15);border-radius:12px;padding:12px;font-size:13px;color:var(--text-primary);line-height:1.65">🤖 ${data.analysis}</div>`:''}`;
}

function renderFinanceList(txs){
  if(!txs.length){
    document.getElementById('finance-list').innerHTML='<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:12px">Aucune transaction ce mois</div>';
    return;
  }
  document.getElementById('finance-list').innerHTML=txs.map(tx=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:6px">
      <div style="flex:1">
        <div style="font-size:13px;color:var(--text-primary);font-weight:500">${tx.description||tx.category}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${tx.category} · ${tx.date}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:14px;font-weight:700;color:${tx.type==='income'?'#4ade80':'#f87171'}">${tx.type==='income'?'+':'-'}${fmtAmount(tx.amount,tx.currency)}</span>
        <button onclick="deleteTransaction('${tx.id}')" style="background:none;border:none;color:rgba(248,113,113,.4);cursor:pointer;font-size:14px;padding:2px">✕</button>
      </div>
    </div>`).join('');
}

async function addTransaction(){
  const type=document.getElementById('tx-type').value;
  const currency=document.getElementById('tx-currency').value;
  const amount=parseFloat(document.getElementById('tx-amount').value);
  const category=document.getElementById('tx-category').value;
  const description=document.getElementById('tx-desc').value.trim();
  const msg=document.getElementById('tx-msg');
  if(!amount||amount<=0){msg.style.color='#f87171';msg.textContent='Montant invalide';return}
  if(!description){msg.style.color='#f87171';msg.textContent='Ajoute une description';return}
  try{
    await apiCall('/finance/transaction','POST',{type,currency,amount,category,description});
    msg.style.color='#4ade80';msg.textContent='✅ Enregistré !';
    document.getElementById('tx-amount').value='';
    document.getElementById('tx-desc').value='';
    setTimeout(()=>{msg.textContent='';loadFinance()},1200);
  }catch(e){msg.style.color='#f87171';msg.textContent='Erreur d\'enregistrement'}
}

async function deleteTransaction(id){
  try{
    await apiCall(`/finance/transaction/${id}`,'DELETE');
    loadFinance();
  }catch(e){}
}

async function askFinance(){
  const q=document.getElementById('finance-q').value.trim();
  if(!q)return;
  const ansDiv=document.getElementById('finance-answer');
  ansDiv.style.display='block';ansDiv.textContent='Analyse en cours...';
  try{
    const data=await apiCall('/finance/ask','POST',{question:q});
    ansDiv.textContent=data.answer||'Pas de réponse';
  }catch(e){ansDiv.textContent='Erreur lors de l\'analyse'}
}

function previewCSV(input){
  const file=input.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const text=e.target.result;
    // Détecter le séparateur
    const firstLine=text.split('\n')[0];
    const sep=firstLine.includes(';')?';':firstLine.includes('\t')?'\t':',';
    // Parser
    const lines=text.trim().split('\n');
    csvHeaders=lines[0].split(sep).map(h=>h.trim().replace(/"/g,''));
    csvRows=lines.slice(1).filter(l=>l.trim()).map(l=>{
      const vals=l.split(sep).map(v=>v.trim().replace(/"/g,''));
      const obj={};
      csvHeaders.forEach((h,i)=>obj[h]=vals[i]||'');
      return obj;
    });
    // Afficher le preview
    document.getElementById('csv-preview').style.display='block';
    document.getElementById('csv-info').textContent=`✅ ${csvRows.length} transactions détectées · ${csvHeaders.length} colonnes`;
    // Peupler les selects
    const selects=['csv-col-date','csv-col-amount','csv-col-desc'];
    selects.forEach(id=>{
      const sel=document.getElementById(id);
      sel.innerHTML=csvHeaders.map(h=>`<option value="${h}">${h}</option>`).join('');
    });
    // Auto-détecter les colonnes
    const dateGuess=csvHeaders.find(h=>/date|jour|time/i.test(h))||csvHeaders[0];
    const amountGuess=csvHeaders.find(h=>/mont|amount|debit|credit|sum|solde/i.test(h))||csvHeaders[1];
    const descGuess=csvHeaders.find(h=>/lib|desc|label|detail|intit/i.test(h))||csvHeaders[2];
    document.getElementById('csv-col-date').value=dateGuess;
    document.getElementById('csv-col-amount').value=amountGuess;
    document.getElementById('csv-col-desc').value=descGuess;
    // Aperçu table
    const preview=csvRows.slice(0,5);
    document.getElementById('csv-table-preview').innerHTML=`
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <tr>${csvHeaders.map(h=>`<th style="padding:4px;border:1px solid var(--border);color:var(--gold);text-align:left">${h}</th>`).join('')}</tr>
        ${preview.map(r=>`<tr>${csvHeaders.map(h=>`<td style="padding:4px;border:1px solid var(--border);color:var(--text-secondary)">${r[h]||''}</td>`).join('')}</tr>`).join('')}
      </table>`;
  };
  reader.readAsText(file,'UTF-8');
}

async function importCSV(){
  const dateCol=document.getElementById('csv-col-date').value;
  const amountCol=document.getElementById('csv-col-amount').value;
  const descCol=document.getElementById('csv-col-desc').value;
  const currency=document.getElementById('csv-currency').value;
  const status=document.getElementById('csv-status');
  if(!csvRows.length){status.textContent='Aucune donnée à importer';return}
  status.style.color='var(--gold)';status.textContent='Import en cours...';
  try{
    const data=await apiCall('/finance/import-csv','POST',{
      rows:csvRows,
      currency,
      mapping:{date:dateCol,amount:amountCol,description:descCol}
    });
    status.style.color='#4ade80';
    status.textContent=`✅ ${data.imported} transactions importées${data.errors?' ('+data.errors+' erreurs)':''}`;
    setTimeout(()=>loadFinance(),1500);
  }catch(e){
    status.style.color='#f87171';
    status.textContent='Erreur import: '+(e.message||'inconnue');
  }
}
