// ── Utilities (shared logic, no Electron dependency) ─────────────────────────

const KEY_MAP = {
  ArrowUp:    'KEY_UP',
  ArrowDown:  'KEY_DOWN',
  ArrowLeft:  'KEY_LEFT',
  ArrowRight: 'KEY_RIGHT',
  Enter:      'KEY_ENTER',
  ' ':        'KEY_ENTER',
  h:          'KEY_HOME',
  b:          'KEY_RETURN',
  m:          'KEY_MENU',
  '+':        'KEY_VOLUP',
  '-':        'KEY_VOLDOWN',
  '0':        'KEY_MUTE',
  PageUp:     'KEY_CHUP',
  PageDown:   'KEY_CHDOWN',
  p:          'KEY_POWER',
};

function buildKeyCommand(key) {
  return JSON.stringify({
    method: 'ms.remote.control',
    params: { Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' },
  });
}

function parseYouTubeVideoId(input) {
  if (!input) return null;
  input = input.trim();
  try {
    const url = new URL(input);
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1).split('?')[0];
      return id.length === 11 ? id : null;
    }
    if (url.hostname.endsWith('youtube.com')) {
      if (url.pathname.startsWith('/shorts/')) {
        const id = url.pathname.split('/')[2];
        return id && id.length === 11 ? id : null;
      }
      const v = url.searchParams.get('v');
      return v && v.length === 11 ? v : null;
    }
  } catch (_) {}
  return input.length === 11 ? input : null;
}

function getRegion() {
  return localStorage.getItem('tvregion') || 'US';
}

function catalogAppsForRegion(region) {
  return APP_CATALOG
    .filter(a => a.available.length === 0 || a.available.includes(region))
    .map(a => ({
      id:       a.id,
      name:     a.name,
      icon:     a.icon,
      appId:    a.appIds[region] || a.appIds.default,
      deepLink: a.deepLink || false,
    }));
}

function loadMediaApps() {
  try {
    const raw = localStorage.getItem('mediaApps');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  const region  = getRegion();
  const cat     = catalogAppsForRegion(region);
  const catMap  = new Map(cat.map(a => [a.id, a]));
  const defs    = REGION_DEFAULTS[region] || [];
  return defs.map(id => catMap.get(id)).filter(Boolean);
}

function saveMediaApps(apps) {
  localStorage.setItem('mediaApps', JSON.stringify(apps));
}

// ── Samsung DB ────────────────────────────────────────────────────────────────

let _samsungDb = null;

async function ensureSamsungDb() {
  if (_samsungDb) return;
  try { _samsungDb = await fetch('/api/samsung-db').then(r => r.json()); }
  catch (_) { _samsungDb = []; }
}

function ccForRegion(region) {
  return Object.entries(CC_TO_REGION)
    .filter(([, rid]) => rid === region)
    .map(([cc]) => cc);
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

let ws = null;

function getIp() { return localStorage.getItem('tvip'); }

function setStatus(state) {
  const dot = document.getElementById('status-dot');
  if (dot) dot.className = 'status-dot' + (state ? ' ' + state : '');
}

function setNeedsConfig(on) {
  document.getElementById('btn-settings')?.classList.toggle('needs-config', on);
}

function connect() {
  if (!getIp()) return;
  if (ws) { ws.close(); ws = null; }
  const ip     = getIp();
  const token  = localStorage.getItem('tvtoken');
  const params = new URLSearchParams({ ip, name: btoa('TVRemote') });
  if (token) params.set('token', token);
  // Route through the desktop proxy — avoids the TV's self-signed cert being
  // rejected by mobile browsers (Electron handles cert bypass server-side).
  const url = `ws://${window.location.host}/tv?${params}`;
  ws = new WebSocket(url);
  ws.onopen    = () => setStatus('connecting');
  ws.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === 'ms.channel.connect') {
        if (msg.data?.token) localStorage.setItem('tvtoken', msg.data.token);
        setStatus('ok');
      }
    } catch (_) {}
  };
  ws.onerror = () => setStatus('err');
  ws.onclose = () => { setStatus('err'); ws = null; };
}

function flash(key) {
  const btn = document.querySelector(`[data-key="${key}"]`);
  if (!btn) return;
  btn.classList.remove('btn-flash');
  void btn.offsetWidth;
  btn.classList.add('btn-flash');
}

function sendKey(key) {
  flash(key);
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(buildKeyCommand(key));
}

// App launch goes through the desktop server proxy (TV REST API has no CORS headers).
function launchApp(appId, metaTag) {
  const ip = getIp();
  if (!ip) return;
  fetch('/api/launch', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ip, appId, metaTag: metaTag ?? null }),
  }).catch(() => {});
}

// ── Settings panel ────────────────────────────────────────────────────────────

function toggleSettings() {
  const panel = document.getElementById('settings-panel');
  const btn   = document.getElementById('btn-settings');
  const open  = panel.hidden;
  panel.hidden = !open;
  btn.classList.toggle('open', open);
  if (open) {
    document.getElementById('tvip').value = getIp() || '';
    document.getElementById('discover-results').innerHTML = '';
    document.getElementById('region-select').value = getRegion();
  }
}

function applyIp() {
  const ip = document.getElementById('tvip').value.trim();
  if (!ip) return;
  if (ip !== getIp()) localStorage.removeItem('tvtoken');
  localStorage.setItem('tvip', ip);
  setNeedsConfig(false);
  connect();
  document.getElementById('settings-panel').hidden = true;
  document.getElementById('btn-settings').classList.remove('open');
}

async function discoverTvs() {
  const btn  = document.getElementById('discover-btn');
  const list = document.getElementById('discover-results');
  btn.textContent = 'Scanning…';
  btn.disabled    = true;
  list.innerHTML  = '';
  try {
    const tvs = await fetch('/api/discover').then(r => r.json());
    if (tvs.length === 0) {
      list.innerHTML = '<p style="font-size:11px;color:#555;padding:4px 0">No TVs found</p>';
    } else {
      for (const tv of tvs) {
        const b = document.createElement('button');
        b.className = 'discover-tv-btn';
        b.innerHTML = `<span>${tv.name}</span><span class="discover-tv-ip">${tv.ip}</span>`;
        b.onclick = () => {
          document.getElementById('tvip').value = tv.ip;
          applyIp();
        };
        list.appendChild(b);
      }
    }
  } catch (_) {
    list.innerHTML = '<p style="font-size:11px;color:#e74c3c;padding:4px 0">Scan failed</p>';
  } finally {
    btn.textContent = 'Scan for TVs';
    btn.disabled    = false;
  }
}

// ── Numpad ────────────────────────────────────────────────────────────────────

function toggleNumpad() {
  const panel = document.getElementById('numpad');
  if (!panel) return;
  panel.hidden = !panel.hidden;
  flash('KEY_123');
}

// ── Pinned apps ───────────────────────────────────────────────────────────────

function renderPinnedApps() {
  const container = document.getElementById('pinned-apps');
  if (!container) return;
  container.innerHTML = '';
  for (const app of loadMediaApps().slice(0, 3)) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-icon pinned-app-btn';
    btn.title     = app.name;
    btn.textContent = app.icon;
    btn.onclick = () => {
      if (app.deepLink) showYouTubeDialog(app.appId);
      else launchApp(app.appId);
    };
    container.appendChild(btn);
  }
}

// ── App modal ─────────────────────────────────────────────────────────────────

let _apps     = [];
let _editMode = false;

function openAppModal() {
  _apps     = loadMediaApps();
  _editMode = false;
  document.getElementById('btn-edit').classList.remove('active');
  document.getElementById('app-search').hidden = true;
  renderAppList();
  document.getElementById('app-modal').hidden = false;
}

function closeAppModal() {
  document.getElementById('app-modal').hidden = true;
  renderPinnedApps();
}

function toggleEditMode() {
  _editMode = !_editMode;
  document.getElementById('btn-edit').classList.toggle('active', _editMode);
  const searchEl = document.getElementById('app-search');
  searchEl.hidden = !_editMode;
  if (_editMode) {
    document.getElementById('search-input').value = '';
    ensureSamsungDb().then(() => onSearchInput(''));
  } else {
    document.getElementById('search-results').innerHTML = '';
  }
  renderAppList();
}

function renderAppList() {
  const container = document.getElementById('app-list');
  container.innerHTML = '';
  for (let i = 0; i < _apps.length; i++) {
    const app = _apps[i];
    const row = document.createElement('div');
    row.className = 'app-row';

    if (_editMode) {
      const moveBtns = document.createElement('div');
      moveBtns.className = 'app-row-move';

      const up   = document.createElement('button');
      up.className   = 'btn-move';
      up.textContent = '↑';
      up.disabled    = (i === 0);
      up.onclick = () => { [_apps[i - 1], _apps[i]] = [_apps[i], _apps[i - 1]]; saveMediaApps(_apps); renderAppList(); };

      const down = document.createElement('button');
      down.className   = 'btn-move';
      down.textContent = '↓';
      down.disabled    = (i === _apps.length - 1);
      down.onclick = () => { [_apps[i], _apps[i + 1]] = [_apps[i + 1], _apps[i]]; saveMediaApps(_apps); renderAppList(); };

      moveBtns.appendChild(up);
      moveBtns.appendChild(down);
      row.appendChild(moveBtns);
    }

    const launchBtn = document.createElement('button');
    launchBtn.className = 'app-row-launch';
    launchBtn.innerHTML = `<span class="app-row-icon">${app.icon}</span><span class="app-row-name">${app.name}</span>`;
    if (!_editMode) {
      launchBtn.onclick = () => {
        if (app.deepLink) { closeAppModal(); showYouTubeDialog(app.appId); }
        else { launchApp(app.appId); closeAppModal(); }
      };
    }
    row.appendChild(launchBtn);

    if (_editMode) {
      const removeBtn = document.createElement('button');
      removeBtn.className   = 'btn-remove';
      removeBtn.textContent = '×';
      removeBtn.onclick = () => {
        _apps.splice(i, 1);
        saveMediaApps(_apps);
        renderAppList();
        onSearchInput(document.getElementById('search-input').value);
      };
      row.appendChild(removeBtn);
    }

    container.appendChild(row);
  }
}

function onSearchInput(query) {
  const container = document.getElementById('search-results');
  container.innerHTML = '';

  if (!_samsungDb) {
    container.innerHTML = '<p style="padding:8px 2px;color:var(--dim);font-size:13px">Loading…</p>';
    ensureSamsungDb().then(() => onSearchInput(query));
    return;
  }

  const region     = getRegion();
  const regionCCs  = new Set(ccForRegion(region));
  const q          = (query || '').trim().toLowerCase();
  let matches      = _samsungDb.filter(a => a.regions.some(cc => regionCCs.has(cc)));
  if (q.length > 0) matches = matches.filter(a => a.name.toLowerCase().includes(q));

  const addedAppIds    = new Set(_apps.map(a => a.appId));
  const catalog        = catalogAppsForRegion(region);
  const catalogByAppId = new Map(catalog.map(a => [a.appId, a]));

  for (const dbApp of matches) {
    const appId   = String(dbApp.id);
    const isAdded = addedAppIds.has(appId);
    const catApp  = catalogByAppId.get(appId);
    const icon    = catApp?.icon || '📺';

    const btn = document.createElement('button');
    btn.className = 'search-result-btn';
    btn.disabled  = isAdded;
    btn.innerHTML = `
      <span class="app-row-icon">${icon}</span>
      <span>${dbApp.name}</span>
      ${isAdded ? '<span class="search-added">Added</span>' : ''}
    `;
    if (!isAdded) {
      btn.onclick = () => {
        const app = catApp || {
          id: 'db-' + appId, name: dbApp.name, icon: '📺', appId, deepLink: false,
        };
        _apps.push(app);
        saveMediaApps(_apps);
        renderAppList();
        onSearchInput(query);
      };
    }
    container.appendChild(btn);
  }
}

function resetToDefaults() {
  const region = getRegion();
  const cat    = catalogAppsForRegion(region);
  const catMap = new Map(cat.map(a => [a.id, a]));
  const defs   = REGION_DEFAULTS[region] || [];
  _apps        = defs.map(id => catMap.get(id)).filter(Boolean);
  saveMediaApps(_apps);
  renderAppList();
  onSearchInput(document.getElementById('search-input').value);
}

// ── YouTube deep-link popup ───────────────────────────────────────────────────

function showYouTubeDialog(appId) {
  const overlay   = document.getElementById('yt-overlay');
  const input     = document.getElementById('yt-url-input');
  const errEl     = document.getElementById('yt-err');
  const playBtn   = document.getElementById('yt-play-btn');
  const cancelBtn = document.getElementById('yt-cancel-btn');

  input.value  = '';
  errEl.hidden = true;
  overlay.classList.add('visible');
  setTimeout(() => input.focus(), 40);

  function submit() {
    const videoId = parseYouTubeVideoId(input.value);
    if (!videoId) { errEl.hidden = false; return; }
    launchApp(appId, videoId);
    close();
  }

  function close() {
    overlay.classList.remove('visible');
    playBtn.onclick   = null;
    cancelBtn.onclick = null;
    input.onkeydown   = null;
  }

  playBtn.onclick   = submit;
  cancelBtn.onclick = close;
  input.onkeydown   = e => {
    if (e.key === 'Enter')  { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.preventDefault(); close();  }
  };
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Populate region selector
  const regionSel = document.getElementById('region-select');
  REGIONS.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.label;
    regionSel.appendChild(opt);
  });
  regionSel.value = getRegion();
  regionSel.addEventListener('change', () => {
    localStorage.setItem('tvregion', regionSel.value);
    renderPinnedApps();
    if (!document.getElementById('app-modal').hidden) {
      _apps = loadMediaApps();
      renderAppList();
      if (_editMode) onSearchInput(document.getElementById('search-input').value);
    }
  });

  renderPinnedApps();

  setStatus('err');
  if (!getIp()) {
    setNeedsConfig(true);
    toggleSettings();
  } else {
    connect();
  }

  document.getElementById('status-dot').addEventListener('click', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) toggleSettings();
  });

  document.getElementById('tvip').addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); applyIp(); }
    if (e.key === 'Escape') { e.preventDefault(); toggleSettings(); }
  });

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const key = KEY_MAP[e.key];
    if (key) { e.preventDefault(); sendKey(key); }
  });
});
