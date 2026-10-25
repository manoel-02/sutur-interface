// ── JEU D'ICÔNES SUTUR ──────────────────────────────────────────────────────
//
// Les emoji ont été retirés du chrome de l'interface. Ils ne sont pas dessinés par
// nous : chaque plateforme les rend à sa façon, ils arrivent en couleur pleine au
// milieu d'une interface monochrome, et leur style ne ressemble à rien d'autre dans
// l'application. Ils restent les bienvenus dans le texte d'une conversation, où ils
// sont du contenu — pas dans la navigation, où ils sont de la signalétique.
//
// La grammaire vient du logo de Sutur : un noyau plein, un arc en orbite. Chaque
// icône est construite avec ces deux éléments, sur une grille de 24, traits de 1,6,
// extrémités arrondies. C'est ce qui fait qu'elles se reconnaissent comme une
// famille plutôt que comme un assortiment.
//
// Usage :
//   <svg class="i"><use href="#i-home"/></svg>          (markup statique)
//   el.innerHTML = icon('home')                          (interface construite en JS)
//   icon('home', {size:18, label:'Accueil'})

const SUTUR_ICONS = {
  // Navigation — le noyau est toujours présent, sa position dit la section.
  home:     '<circle cx="12" cy="13" r="2.4" fill="currentColor" stroke="none"/><path d="M4 11.2 12 4.6l8 6.6"/><path d="M5.8 10v8.2a1 1 0 0 0 1 1h10.4a1 1 0 0 0 1-1V10"/>',
  ai:       '<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="8.4" stroke-dasharray="3.4 3.1"/><circle cx="19.2" cy="8.4" r="1.5"/><circle cx="5.2" cy="15.4" r="1.5"/>',
  manage:   '<path d="M4.5 19.5h15"/><path d="M7.5 19.5v-5.2"/><path d="M12 19.5V8.6"/><path d="M16.5 19.5v-8"/><circle cx="12" cy="5.4" r="2.1" fill="currentColor" stroke="none"/>',
  me:       '<circle cx="12" cy="8.4" r="3.6"/><path d="M5 19.4a7 7 0 0 1 14 0"/>',

  // Barre de saisie.
  mic:      '<rect x="9.2" y="3.4" width="5.6" height="10.4" rx="2.8"/><path d="M6 11.6a6 6 0 0 0 12 0"/><path d="M12 17.6v3"/>',
  camera:   '<path d="M3.6 8.4h3.2l1.5-2.2h7.4l1.5 2.2h3.2a1 1 0 0 1 1 1v8.4a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1V9.4a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.4" r="3.3"/>',
  document: '<path d="M6.4 3.4h7.1L18.6 8.5v12.1a1 1 0 0 1-1 1H6.4a1 1 0 0 1-1-1V4.4a1 1 0 0 1 1-1Z"/><path d="M13.3 3.6v5.1h5.1"/><path d="M8.6 13.4h6.8M8.6 16.8h4.6"/>',
  send:     '<path d="M12 19.4V5.2"/><path d="m6.4 10.8 5.6-5.6 5.6 5.6"/>',
  stop:     '<rect x="7.4" y="7.4" width="9.2" height="9.2" rx="1.8" fill="currentColor" stroke="none"/>',

  // Conversation et système.
  chat:     '<path d="M20.4 12.4c0 4-3.8 7.2-8.4 7.2a9.8 9.8 0 0 1-2.9-.4l-5 1.4 1.5-4.2a6.7 6.7 0 0 1-1.9-4.6c0-4 3.7-7.2 8.3-7.2s8.4 3.2 8.4 7.8Z"/><circle cx="12" cy="12.2" r="1.3" fill="currentColor" stroke="none"/>',
  settings: '<circle cx="12" cy="12" r="2.8"/><path d="M12 3.4v2.3M12 18.3v2.3M20.6 12h-2.3M5.7 12H3.4M18.1 5.9l-1.6 1.6M7.5 16.5l-1.6 1.6M18.1 18.1l-1.6-1.6M7.5 7.5 5.9 5.9"/>',
  close:    '<path d="m6.6 6.6 10.8 10.8M17.4 6.6 6.6 17.4"/>',
  back:     '<path d="M19 12H5.6"/><path d="m11.4 5.4-6 6.6 6 6.6"/>',
  refresh:  '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20.2 4.6v4.2h-4.2"/>',
  check:    '<path d="m5.4 12.6 4.4 4.4 8.8-9.6"/>',
  alert:    '<path d="M12 4.4 21 19.6H3Z"/><path d="M12 10.2v4"/><circle cx="12" cy="16.9" r="1" fill="currentColor" stroke="none"/>',

  // Globe et couches live.
  globe:    '<circle cx="12" cy="12" r="8.4"/><path d="M3.8 12h16.4"/><ellipse cx="12" cy="12" rx="3.6" ry="8.4"/>',
  plane:    '<path d="M3.4 13.6 21 8.2l-1.3 3.1-7.4 3.3-1.9 5.2-1.6-.5.4-4-3.6 1.6-.4 2.1-1.2-.4Z" stroke-linejoin="round"/>',
  quake:    '<circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/><path d="M7.9 16.1a5.8 5.8 0 0 1 0-8.2"/><path d="M16.1 7.9a5.8 5.8 0 0 1 0 8.2"/><path d="M5 19a9.9 9.9 0 0 1 0-14"/><path d="M19 5a9.9 9.9 0 0 1 0 14"/>',
  launch:   '<path d="M4.6 19.4c3.4-9.4 8.4-14 14.8-14.8C18.6 11 14 16 4.6 19.4Z"/><circle cx="14.2" cy="9.8" r="1.9" fill="currentColor" stroke="none"/><path d="M4.6 19.4 8 16"/>',

  // Connexions et état.
  link:     '<path d="M10.2 13.8a3.6 3.6 0 0 0 5.2 0l2.9-3a3.7 3.7 0 0 0-5.2-5.2l-1.3 1.3"/><path d="M13.8 10.2a3.6 3.6 0 0 0-5.2 0l-2.9 3a3.7 3.7 0 0 0 5.2 5.2l1.3-1.3"/>',
  pc:       '<rect x="2.8" y="4.6" width="18.4" height="11.6" rx="1.6"/><path d="M8.4 19.4h7.2M12 16.4v3"/>',
  bell:     '<path d="M6.6 10.6a5.4 5.4 0 0 1 10.8 0c0 4 1.6 5.6 1.6 5.6H5s1.6-1.6 1.6-5.6Z"/><path d="M10.2 19a2 2 0 0 0 3.6 0"/>',
  lock:     '<rect x="5.2" y="10.4" width="13.6" height="9.4" rx="1.8"/><path d="M8.4 10.4V7.9a3.6 3.6 0 0 1 7.2 0v2.5"/>',
  search:   '<circle cx="10.9" cy="10.9" r="6.3"/><path d="m15.6 15.6 4.4 4.4"/>',
  pin:      '<path d="M12 21.2s6.4-6.1 6.4-10.6a6.4 6.4 0 1 0-12.8 0C5.6 15.1 12 21.2 12 21.2Z"/><circle cx="12" cy="10.4" r="2.4" fill="currentColor" stroke="none"/>',
};

// Marques des services. Tracés officiels, rendus en une seule couleur au repos et
// dans leur couleur de marque une fois connectés : on respecte la marque sans la
// laisser casser la cohérence de l'écran.
const SUTUR_BRANDS = {
  google:  { color: '#4285F4', path: '<path fill="currentColor" stroke="none" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"/><path fill="currentColor" stroke="none" opacity=".75" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z"/><path fill="currentColor" stroke="none" opacity=".55" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1Z"/><path fill="currentColor" stroke="none" opacity=".85" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"/>' },
  spotify: { color: '#1DB954', path: '<path fill="currentColor" stroke="none" d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm5.5 17.3a.75.75 0 0 1-1 .25c-2.8-1.7-6.3-2.1-10.4-1.15a.75.75 0 1 1-.33-1.46c4.5-1.03 8.4-.57 11.5 1.33.35.22.46.68.23 1.03Zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.2-1.97-8.08-2.54-11.87-1.39a.94.94 0 0 1-.54-1.8c4.33-1.31 9.7-.68 13.38 1.59.44.27.58.85.32 1.29Zm.13-3.4C15.26 8.36 8.9 8.15 5.24 9.26a1.12 1.12 0 1 1-.65-2.15c4.2-1.27 11.23-1.03 15.66 1.6a1.12 1.12 0 1 1-1.15 1.93Z"/>' },
  notion:  { color: '#ffffff', path: '<path fill="currentColor" stroke="none" d="M4.1 3.3 15.6 2.4c1.4-.12 1.76-.04 2.64.6l3.67 2.58c.6.44.8.56.8 1.04v14.1c0 .88-.32 1.4-1.44 1.48l-13.35.8c-.84.04-1.24-.08-1.68-.64L3.5 19c-.48-.64-.68-1.12-.68-1.68V4.7c0-.72.32-1.32 1.28-1.4Zm11.86.98L4.86 5.1c-.56.04-.68.32-.46.56l2.38 1.72c.4.28.64.36 1.2.32l10.74-.64c.24-.02.44-.3.2-.5l-2.1-1.52c-.24-.18-.56-.3-.86-.26ZM6.86 9.14v11.1c0 .6.3.82.98.78l11.8-.68c.68-.04.76-.46.76-.96V8.36c0-.5-.2-.76-.62-.72l-12.34.72c-.46.04-.58.28-.58.78Z"/>' },
  canva:   { color: '#00C4CC', path: '<circle cx="12" cy="12" r="11.2" fill="currentColor" stroke="none"/><path fill="var(--bg,#07070c)" stroke="none" d="M15.9 14.6c-.9 1.6-2.4 2.7-4 2.7-2 0-3.3-1.7-3.3-4.1 0-3.4 2.2-6.5 4.5-6.5 1 0 1.6.6 1.6 1.4 0 .5-.2 1-.5 1.3-.2.2-.4.1-.4-.1-.1-.6-.4-1-.9-1-1.3 0-2.6 2.3-2.6 4.6 0 1.4.6 2.3 1.6 2.3 1 0 2-.8 2.7-2 .2-.4.6-.2.4.2l.9 1.2Z"/>' },
  whatsapp:{ color: '#25D366', path: '<path fill="currentColor" stroke="none" d="M12.04 2a9.9 9.9 0 0 0-8.48 15l-1.3 4.76 4.88-1.28A9.9 9.9 0 1 0 12.04 2Zm5.8 14.03c-.25.7-1.44 1.33-2 1.38-.53.05-1.02.24-3.44-.72-2.9-1.14-4.73-4.1-4.87-4.29-.14-.19-1.16-1.54-1.16-2.94s.74-2.08 1-2.37c.26-.28.57-.35.76-.35h.54c.18 0 .42-.07.65.5.24.57.8 1.98.87 2.12.07.14.12.3.02.5-.1.18-.14.3-.28.46l-.42.49c-.14.14-.28.3-.12.58.14.28.64 1.06 1.38 1.72.95.84 1.75 1.1 2 1.24.24.14.39.12.53-.07.14-.19.6-.7.77-.95.16-.24.33-.2.55-.12.23.1 1.44.68 1.68.8.25.12.41.19.47.29.07.1.07.57-.18 1.27Z"/>' },
};

function icon(name, opts) {
  opts = opts || {};
  const size = opts.size || 20;
  const label = opts.label;
  const cls = 'i' + (opts.cls ? ' ' + opts.cls : '');
  const a11y = label
    ? ` role="img" aria-label="${String(label).replace(/"/g, '&quot;')}"`
    : ' aria-hidden="true"';
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24"${a11y}><use href="#i-${name}"/></svg>`;
}

function brandIcon(name, opts) {
  opts = opts || {};
  const b = SUTUR_BRANDS[name];
  if (!b) return '';
  const size = opts.size || 20;
  // `on` : la marque reprend sa couleur, ce qui rend l'état connecté lisible d'un
  // coup d'œil sans ajouter de pastille à côté.
  const color = opts.on ? b.color : 'currentColor';
  return `<svg class="brand${opts.on ? ' on' : ''}" width="${size}" height="${size}" viewBox="0 0 24 24"`
    + ` style="color:${color}" aria-hidden="true"><use href="#b-${name}"/></svg>`;
}

// Le sprite est injecté une fois : les icônes sont alors réutilisées par référence
// plutôt que redessinées à chaque insertion dans le DOM.
function injectIconSprite() {
  if (document.getElementById('sutur-sprite')) return;
  const parts = [];
  for (const [name, d] of Object.entries(SUTUR_ICONS)) {
    parts.push(`<symbol id="i-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor"`
      + ` stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</symbol>`);
  }
  for (const [name, b] of Object.entries(SUTUR_BRANDS)) {
    parts.push(`<symbol id="b-${name}" viewBox="0 0 24 24">${b.path}</symbol>`);
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'sutur-sprite';
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  svg.innerHTML = parts.join('');
  document.body.insertBefore(svg, document.body.firstChild);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectIconSprite);
} else {
  injectIconSprite();
}
