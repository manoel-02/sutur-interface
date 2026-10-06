// ── RENDU MARKDOWN ────────────────────────────────────────────────────────
// Fonction pure (aucune dépendance au DOM) : texte brut -> HTML sûr.
// Règle de sécurité : TOUT texte est échappé avant d'être mis en forme ; le seul
// HTML produit est celui construit ici (jamais du HTML venant du texte). Les liens
// n'acceptent que http(s). Tolère le texte INCOMPLET du streaming : un bloc de
// code non fermé, un gras non terminé… s'affichent proprement puis se complètent.

function mdEscape(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Mise en forme dans une ligne : code, liens, gras, italique, barré.
function mdInline(raw){
  const slots=[];
  const hold=h=>{slots.push(h);return '\u0000'+(slots.length-1)+'\u0000';};
  let t=String(raw);
  // 1. code en ligne — protégé de toute autre transformation
  t=t.replace(/`([^`\n]+)`/g,(m,c)=>hold('<code>'+mdEscape(c)+'</code>'));
  // 2. liens [texte](https://...)
  t=t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,(m,label,url)=>
    hold('<a href="'+mdEscape(url)+'" target="_blank" rel="noopener noreferrer">'+mdEscape(label)+'</a>'));
  // 3. URLs brutes (la ponctuation finale reste hors du lien)
  t=t.replace(/https?:\/\/[^\s<>()]+/g,(url)=>{
    const m=url.match(/[.,;:!?'"]+$/);
    const trail=m?m[0]:'';
    const clean=trail?url.slice(0,-trail.length):url;
    return hold('<a href="'+mdEscape(clean)+'" target="_blank" rel="noopener noreferrer">'+mdEscape(clean)+'</a>')+mdEscape(trail);
  });
  // 4. échapper le reste, puis gras / italique / barré
  t=mdEscape(t);
  t=t.replace(/\*\*\*(?!\s)([^\n]*?[^\s])\*\*\*/g,'<strong><em>$1</em></strong>');
  t=t.replace(/\*\*(?!\s)([^\n]*?[^\s])\*\*/g,'<strong>$1</strong>');
  t=t.replace(/\*(?![\s*])([^*\n]*[^\s*])\*/g,'<em>$1</em>');
  t=t.replace(/~~(?!\s)([^\n]*?[^\s])~~/g,'<del>$1</del>');
  // 5. restaurer les blocs protégés
  return t.replace(/\u0000(\d+)\u0000/g,(m,i)=>slots[+i]);
}

function mdSplitRow(line){
  let t=line.trim();
  if(t.startsWith('|'))t=t.slice(1);
  if(t.endsWith('|'))t=t.slice(0,-1);
  return t.split('|').map(c=>c.trim());
}

function mdRenderTable(headerLine,sepLine,rowLines){
  const heads=mdSplitRow(headerLine);
  const aligns=mdSplitRow(sepLine).map(c=>{
    const l=c.startsWith(':'),r=c.endsWith(':');
    return l&&r?'center':r?'right':l?'left':'';
  });
  const cell=(tag,txt,i)=>'<'+tag+(aligns[i]?' style="text-align:'+aligns[i]+'"':'')+'>'+mdInline(txt)+'</'+tag+'>';
  let h='<div class="md-table-wrap"><table><thead><tr>'+heads.map((c,i)=>cell('th',c,i)).join('')+'</tr></thead><tbody>';
  rowLines.forEach(l=>{h+='<tr>'+mdSplitRow(l).map((c,i)=>cell('td',c,i)).join('')+'</tr>';});
  return h+'</tbody></table></div>';
}

function mdRenderList(items){
  let html='';
  const stack=[];
  items.forEach((it,idx)=>{
    while(stack.length&&it.indent<stack[stack.length-1].indent){html+='</li></'+stack.pop().tag+'>';}
    const tag=it.ordered?'ol':'ul';
    if(!stack.length||it.indent>stack[stack.length-1].indent){
      const start=it.ordered&&it.num!==1&&idx===0?' start="'+it.num+'"':'';
      html+='<'+tag+start+'>';
      stack.push({indent:it.indent,tag});
    }else{
      html+='</li>';
    }
    html+='<li>'+mdInline(it.text);
  });
  while(stack.length){html+='</li></'+stack.pop().tag+'>';}
  return html;
}

function mdRenderCode(lang,code,closed){
  const l=mdEscape(lang||'code');
  return '<div class="md-code'+(closed?'':' md-code-open')+'"><div class="md-code-head"><span class="md-code-lang">'+l+
    '</span><button type="button" class="md-copy" data-md-copy aria-label="Copier le code">Copier</button></div><pre><code>'+
    mdEscape(code)+'</code></pre></div>';
}

function renderMarkdown(text){
  if(!text)return '';
  const lines=String(text).replace(/\u0000/g,'').replace(/\r\n?/g,'\n').split('\n');
  const out=[];
  let para=[];
  let i=0;
  const flush=()=>{if(para.length){out.push('<p>'+para.map(mdInline).join('<br>')+'</p>');para=[];}};
  const isTableSep=l=>/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)&&l.includes('-')&&(l.includes('|')||false);

  while(i<lines.length){
    const line=lines[i];
    let m;

    // bloc de code (même non fermé : cas du streaming)
    m=line.match(/^\s*```\s*([\w+#.\-]*)\s*$/);
    if(m){
      flush();
      const code=[];let closed=false;i++;
      while(i<lines.length){
        if(/^\s*```\s*$/.test(lines[i])){closed=true;i++;break;}
        code.push(lines[i]);i++;
      }
      out.push(mdRenderCode(m[1],code.join('\n'),closed));
      continue;
    }

    if(/^\s*$/.test(line)){flush();i++;continue;}

    // titres : # -> h3 … pour ne jamais fabriquer un h1/h2 concurrent de ceux de la page
    m=line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if(m){flush();const lvl=Math.min(m[1].length+2,6);out.push('<h'+lvl+' class="md-h">'+mdInline(m[2])+'</h'+lvl+'>');i++;continue;}

    // séparateur
    if(/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)){flush();out.push('<hr>');i++;continue;}

    // tableau
    if(line.includes('|')&&i+1<lines.length&&isTableSep(lines[i+1])){
      flush();
      const rows=[];
      const head=line,sep=lines[i+1];
      i+=2;
      while(i<lines.length&&lines[i].includes('|')&&!/^\s*$/.test(lines[i])){rows.push(lines[i]);i++;}
      out.push(mdRenderTable(head,sep,rows));
      continue;
    }

    // citation
    if(/^\s*>\s?/.test(line)){
      flush();
      const q=[];
      while(i<lines.length&&/^\s*>\s?/.test(lines[i])){q.push(lines[i].replace(/^\s*>\s?/,''));i++;}
      out.push('<blockquote>'+q.map(mdInline).join('<br>')+'</blockquote>');
      continue;
    }

    // liste (à puces ou numérotée, imbriquée par indentation)
    m=line.match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/);
    if(m){
      flush();
      const items=[];
      while(i<lines.length){
        const lm=lines[i].match(/^(\s*)([-*•]|(\d+)[.)])\s+(.*)$/);
        if(!lm)break;
        items.push({indent:lm[1].replace(/\t/g,'  ').length,ordered:!!lm[3],num:lm[3]?parseInt(lm[3],10):0,text:lm[4]});
        i++;
      }
      out.push(mdRenderList(items));
      continue;
    }

    para.push(line);i++;
  }
  flush();
  return out.join('');
}

if(typeof module!=='undefined')module.exports={renderMarkdown,mdInline,mdEscape};
