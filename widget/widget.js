// ── Widget Sutur — panneau léger séparé de l'application complète ──────────
// Partage la même session que l'app principale (même domaine, même clé de
// stockage 's_token') : pas besoin de se reconnecter séparément si déjà
// connecté dans le navigateur habituel.

const API_URL = 'https://uvicorn-appmain-production-95d3.up.railway.app';
let TOKEN = localStorage.getItem('s_token') || '';

async function apiCall(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Authorization': `Bearer ${TOKEN}` } };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(`${API_URL}${path}`, opts);
  if (!r.ok) throw new Error(`Erreur ${r.status}`);
  return r.json();
}

if (!TOKEN) {
  document.getElementById('widget-root').innerHTML =
    '<div class="panel open" style="width:260px"><div class="muted-msg">Pas connecté — ouvre d\'abord l\'application Sutur complète pour te connecter, puis relance ce raccourci.</div></div>';
}

// ── Navigation entre bulles et panneaux ─────────────────────────────────────
function toggleSubBubbles() {
  document.getElementById('sub-bubbles').classList.toggle('open');
}

function togglePanel(name) {
  const panel = document.getElementById(`panel-${name}`);
  const isOpen = panel.classList.contains('open');
  // Un seul panneau ouvert à la fois — ferme tout avant d'ouvrir le suivant.
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.sub-bubble').forEach(b => b.classList.remove('active'));
  if (!isOpen) {
    panel.classList.add('open');
    document.getElementById(`bubble-${name}`).classList.add('active');
    if (name === 'spotify') loadNowPlaying();
    if (name === 'chat') document.getElementById('chat-input').focus();
  }
}

function closePanel(name) {
  document.getElementById(`panel-${name}`).classList.remove('open');
  document.getElementById(`bubble-${name}`).classList.remove('active');
}

// ── Chat — réutilise le système asynchrone déjà construit (job + interrogation),
// exactement le même mécanisme que l'application complète, pour la même
// résilience si la fenêtre du widget est mise en arrière-plan. ─────────────
function addChatLine(role, text) {
  const log = document.getElementById('chat-log');
  const d = document.createElement('div');
  d.className = `chat-line ${role}`;
  d.textContent = text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

async function widgetSendChat() {
  const inp = document.getElementById('chat-input');
  const msg = inp.value.trim();
  if (!msg) return;
  inp.value = '';
  addChatLine('user', msg);
  const thinking = addChatLine('ai thinking', 'Sutur réfléchit...');

  try {
    const submitResp = await apiCall('/chat', 'POST', { message: msg, model: 'claude', history: [], thread_id: null });
    if (!submitResp || !submitResp.job_id) {
      thinking.textContent = 'Erreur de connexion.';
      thinking.classList.remove('thinking');
      return;
    }
    await pollWidgetChat(submitResp.job_id, thinking);
  } catch (e) {
    thinking.textContent = 'Erreur de connexion.';
    thinking.classList.remove('thinking');
  }
}

async function pollWidgetChat(jobId, lineEl) {
  try {
    const data = await apiCall(`/chat/result/${jobId}`, 'GET');
    if (!data || data.status === 'processing') {
      setTimeout(() => pollWidgetChat(jobId, lineEl), 2000);
      return;
    }
    lineEl.textContent = data.reply || data.detail || 'Erreur';
    lineEl.classList.remove('thinking');
  } catch (e) {
    // Comme dans l'application complète : une erreur pendant l'interrogation
    // n'est jamais définitive, la tâche continue d'exister côté serveur.
    setTimeout(() => pollWidgetChat(jobId, lineEl), 3000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('chat-input');
  if (inp) inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); widgetSendChat(); }
  });
});

// ── Spotify — lecture en cours, contrôles, recherche et lancement ───────────
let spotifyIsPlaying = false;

async function loadNowPlaying() {
  const el = document.getElementById('spotify-nowplaying');
  el.innerHTML = '<div class="muted-msg">Chargement...</div>';
  try {
    const data = await apiCall('/spotify/now-playing', 'GET');
    if (!data.playing && !data.track) {
      el.innerHTML = '<div class="muted-msg">Rien en cours de lecture</div>';
      spotifyIsPlaying = false;
    } else {
      el.innerHTML = `<div id="spotify-track">${escapeHtml(data.track || '')}</div><div id="spotify-artist">${escapeHtml(data.artist || '')}</div>`;
      spotifyIsPlaying = !!data.playing;
    }
    updatePlayPauseIcon();
  } catch (e) {
    el.innerHTML = '<div class="muted-msg">Spotify non connecté ou indisponible</div>';
  }
}

function updatePlayPauseIcon() {
  document.getElementById('spotify-playpause').textContent = spotifyIsPlaying ? '⏸' : '▶';
}

async function spotifyAction(action) {
  try {
    if (action === 'next') {
      await apiCall('/spotify/next', 'POST');
      setTimeout(loadNowPlaying, 500);
      return;
    } else if (action === 'previous') {
      await apiCall('/spotify/previous', 'POST');
      setTimeout(loadNowPlaying, 500);
      return;
    }
  } catch (e) { /* action non bloquante, ignorée silencieusement */ }
}

const spotifyPlayPauseBtn = document.getElementById('spotify-playpause');
if (spotifyPlayPauseBtn) {
  spotifyPlayPauseBtn.onclick = async () => {
    try {
      if (spotifyIsPlaying) {
        await apiCall('/spotify/pause', 'POST');
        spotifyIsPlaying = false;
      } else {
        await apiCall('/spotify/play', 'POST');
        spotifyIsPlaying = true;
      }
      updatePlayPauseIcon();
    } catch (e) { /* ignoré, l'utilisateur peut réessayer */ }
  };
}

async function spotifySearch() {
  const q = document.getElementById('spotify-search-input').value.trim();
  if (!q) return;
  const resultsEl = document.getElementById('spotify-results');
  resultsEl.innerHTML = '<div class="muted-msg">Recherche...</div>';
  try {
    const data = await apiCall(`/spotify/search?q=${encodeURIComponent(q)}`, 'GET');
    const tracks = data.tracks || [];
    if (!tracks.length) { resultsEl.innerHTML = '<div class="muted-msg">Aucun résultat</div>'; return; }
    resultsEl.innerHTML = '';
    tracks.forEach(t => {
      const d = document.createElement('div');
      d.className = 'spotify-result';
      d.innerHTML = `<div class="spotify-result-title">${escapeHtml(t.name)}</div><div class="spotify-result-artist">${escapeHtml(t.artist)}</div>`;
      d.onclick = async () => {
        try {
          await apiCall('/spotify/play', 'POST', { uri: t.uri });
          spotifyIsPlaying = true;
          setTimeout(loadNowPlaying, 500);
        } catch (e) { /* ignoré */ }
      };
      resultsEl.appendChild(d);
    });
  } catch (e) {
    resultsEl.innerHTML = '<div class="muted-msg">Recherche indisponible</div>';
  }
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
