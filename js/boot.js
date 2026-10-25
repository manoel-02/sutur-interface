// ── SÉQUENCE DE DÉMARRAGE ───────────────────────────────────────────────────
//
// Ce que la séquence d'Iron Man a de bien n'est pas la lueur : c'est qu'elle
// énumère de vrais sous-systèmes qui passent en ligne, chacun avec son état. Sutur
// en a de vrais — le serveur, la base, le planificateur, les connecteurs, le PC
// relié — alors on montre les VRAIS, avec leur latence mesurée.
//
// Deux conséquences qui comptent plus que l'effet. D'abord, si un service est en
// panne, ça se voit à la seconde où l'application s'ouvre, au lieu de se découvrir
// au milieu d'une conversation. Ensuite, aucune attente n'est inventée : la
// séquence dure le temps des requêtes, et s'efface dès qu'elles sont revenues.

const BOOT_MIN_MS = 900;          // laisse le temps de lire ; en dessous ça clignote
const BOOT_MAX_MS = 6000;         // au-delà, on entre quand même : le chat n'attend pas
const BOOT_STAGGER_MS = 70;       // décalage d'apparition entre deux lignes

// Les sous-systèmes, dans l'ordre où ils comptent. `from` dit d'où vient l'état.
const BOOT_STEPS = [
  { id: 'core',      label: 'Noyau',            from: 'health' },
  { id: 'supabase',  label: 'Mémoire',          from: 'connector' },
  { id: 'scheduler', label: 'Planificateur',    from: 'scheduler' },
  { id: 'google',    label: 'Agenda et mail',   from: 'connector' },
  { id: 'spotify',   label: 'Musique',          from: 'connector' },
  { id: 'pc_agent',  label: 'PC relié',         from: 'connector' },
  { id: 'pushover',  label: 'Notifications',    from: 'connector' },
];

const BOOT_CLASS = { ok: 'ok', degraded: 'warn', needs_reconnect: 'warn',
                     not_connected: '', not_configured: '', error: 'bad' };

let bootRan = false;

function bootRow(step) {
  const row = document.createElement('div');
  row.className = 'boot-row live';
  row.id = 'boot-' + step.id;
  row.innerHTML = '<i class="dot"></i><span class="lbl"></span><span class="val">…</span>';
  row.querySelector('.lbl').textContent = step.label;
  return row;
}

function bootSet(id, state, value) {
  const row = document.getElementById('boot-' + id);
  if (!row) return;
  row.className = 'boot-row ' + (BOOT_CLASS[state] !== undefined ? BOOT_CLASS[state] : 'bad');
  row.querySelector('.val').textContent = value;
}

/** Un appel borné dans le temps qui ne lève jamais : {ok, data, ms, status}. */
async function bootProbe(path, timeoutMs) {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 7000);
  try {
    const res = await fetch(API_URL + path, {
      headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) return { ok: false, status: res.status, ms };
    return { ok: true, data: await res.json(), ms, status: res.status };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), aborted: e.name === 'AbortError' };
  } finally {
    clearTimeout(timer);
  }
}

function bootNote(text) {
  const el = document.getElementById('boot-note');
  if (el) el.textContent = text || '';
}

function bootFinish(overlay, startedAt) {
  const wait = Math.max(0, BOOT_MIN_MS - (performance.now() - startedAt));
  setTimeout(() => {
    overlay.classList.add('done');
    setTimeout(() => { overlay.style.display = 'none'; }, 520);
  }, wait);
}

async function runBootSequence() {
  const overlay = document.getElementById('boot');
  if (!overlay || bootRan) return;
  bootRan = true;

  // Sans session, il n'y a rien de réel à montrer : on n'invente pas une animation.
  if (!TOKEN || !API_URL) { overlay.style.display = 'none'; return; }

  const list = document.getElementById('boot-list');
  list.innerHTML = '';
  BOOT_STEPS.forEach((step, i) => {
    const row = bootRow(step);
    row.style.animationDelay = (i * BOOT_STAGGER_MS) + 'ms';
    list.appendChild(row);
  });

  const startedAt = performance.now();
  const giveUp = setTimeout(() => bootFinish(overlay, startedAt), BOOT_MAX_MS);
  document.getElementById('boot-skip').onclick = () => {
    clearTimeout(giveUp);
    overlay.classList.add('done');
    setTimeout(() => { overlay.style.display = 'none'; }, 520);
  };

  // Les trois requêtes partent ensemble : la séquence dure le temps de la plus
  // lente, pas la somme des trois.
  const [health, connectors, scheduler] = await Promise.all([
    bootProbe('/health'),
    bootProbe('/health/connectors', 12000),
    bootProbe('/scheduler/status'),
  ]);

  bootSet('core', health.ok ? 'ok' : 'error',
    health.ok ? health.ms + ' ms' : (health.status ? 'HTTP ' + health.status : 'injoignable'));

  bootSet('scheduler',
    scheduler.ok ? (scheduler.data && scheduler.data.appears_healthy === false ? 'error' : 'ok') : 'error',
    scheduler.ok ? scheduler.ms + ' ms' : '—');

  const byId = {};
  if (connectors.ok && connectors.data && Array.isArray(connectors.data.connectors)) {
    for (const c of connectors.data.connectors) byId[c.id] = c;
  }

  const LABEL = { not_connected: 'non relié', not_configured: 'non configuré',
                  needs_reconnect: 'à reconnecter', degraded: 'partiel', error: 'erreur' };

  for (const step of BOOT_STEPS) {
    if (step.from !== 'connector') continue;
    const c = byId[step.id];
    if (!c) {
      // Serveur pas encore à jour : on le dit, plutôt que d'afficher un faux vert.
      bootSet(step.id, 'not_connected', connectors.ok ? '—' : 'non vérifié');
      continue;
    }
    bootSet(step.id, c.state, c.state === 'ok' ? (c.ms || 0) + ' ms' : (LABEL[c.state] || c.state));
  }

  // Une seule phrase, celle qui demande une action. Le détail est dans les réglages.
  const todo = Object.values(byId).filter(c => c.state === 'needs_reconnect');
  const broken = Object.values(byId).filter(c => c.state === 'error');
  if (!health.ok) bootNote('Serveur injoignable. Sutur fonctionnera en mode dégradé.');
  else if (broken.length) bootNote(broken[0].name + ' ne répond pas.');
  else if (todo.length) bootNote(todo.length === 1
    ? todo[0].name + ' doit être reconnecté.'
    : todo.length + ' services doivent être reconnectés.');
  else if (scheduler.ok && scheduler.data && scheduler.data.appears_healthy === false)
    bootNote('Le planificateur est arrêté : rappels et mails programmés en pause.');
  else bootNote('');

  clearTimeout(giveUp);
  // Une anomalie mérite d'être lue : on laisse la séquence un peu plus longtemps.
  const linger = (todo.length || broken.length || !health.ok) ? 1400 : 0;
  setTimeout(() => bootFinish(overlay, startedAt), linger);
}
