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

// catalog.js is loaded before this script in index.html —
// APP_CATALOG, REGION_DEFAULTS, CC_TO_REGION are available as globals.

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
  const region   = getRegion();
  const cat      = catalogAppsForRegion(region);
  const catMap   = new Map(cat.map(a => [a.id, a]));
  const defaults = REGION_DEFAULTS[region] || [];
  return defaults.map(id => catMap.get(id)).filter(Boolean);
}

function saveMediaApps(apps) {
  localStorage.setItem('mediaApps', JSON.stringify(apps));
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

function reorderApp(apps, id, dir) {
  const idx = apps.findIndex(a => a.id === id);
  if (idx === -1) return apps.slice();
  if (dir === 'up'   && idx === 0)               return apps.slice();
  if (dir === 'down' && idx === apps.length - 1) return apps.slice();
  const next = apps.slice();
  const swap = dir === 'up' ? idx - 1 : idx + 1;
  [next[idx], next[swap]] = [next[swap], next[idx]];
  return next;
}

function moveApp(apps, fromIdx, toIdx) {
  if (fromIdx === toIdx || fromIdx + 1 === toIdx) return apps.slice();
  const next = apps.slice();
  const [item] = next.splice(fromIdx, 1);
  next.splice(fromIdx < toIdx ? toIdx - 1 : toIdx, 0, item);
  return next;
}

function buildKeyCommand(key) {
  return JSON.stringify({
    method: 'ms.remote.control',
    params: {
      Cmd: 'Click',
      DataOfCmd: key,
      Option: 'false',
      TypeOfRemote: 'SendRemoteKey'
    }
  });
}

function buildTextCommand(text) {
  const utf8 = unescape(encodeURIComponent(text)); // UTF-8 bytes as a binary string
  return JSON.stringify({
    method: 'ms.remote.control',
    params: { Cmd: btoa(utf8), DataOfCmd: 'base64', TypeOfRemote: 'SendInputString' },
  });
}

let ws = null;

function setStatus(state) {
  const dot = document.getElementById('status-dot');
  if (dot) dot.className = 'status-dot' + (state ? ' ' + state : '');
}

function getIp() {
  return localStorage.getItem('tvip');
}

function setNeedsConfig(on) {
  const btn = document.getElementById('btn-settings');
  if (btn) btn.classList.toggle('needs-config', on);
}

function connect() {
  if (!getIp()) return;
  if (ws) { ws.close(); ws = null; }
  const ip    = getIp();
  const token = localStorage.getItem('tvtoken');
  const query = token ? `&token=${token}` : '';
  const url   =
    `wss://${ip}:8002/api/v2/channels/samsung.remote.control?name=${btoa('TVRemote')}${query}`;
  ws = new WebSocket(url);
  ws.onopen = () => setStatus('connecting');
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
  void btn.offsetWidth; // force reflow so animation restarts on rapid presses
  btn.classList.add('btn-flash');
}

function sendKey(key) {
  flash(key);
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(buildKeyCommand(key));
}

function launchApp(appId, metaTag) {
  const ip = getIp();
  if (!ip) return;
  window.electronAPI?.launchApp(ip, appId, metaTag ?? null);
}

let _mediaApps = [];

function setMediaApps(apps) {
  _mediaApps = apps;
  saveMediaApps(apps);
  renderPinnedApps();
  renderDrawer();
}

function renderPinnedApps() {
  const container = document.getElementById('pinned-apps');
  if (!container) return;
  container.innerHTML = '';
  for (const app of _mediaApps.slice(0, 3)) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-icon pinned-app-btn';
    btn.title = app.name;
    btn.textContent = app.icon;
    btn.onclick = e => {
      if (e.shiftKey && app.deepLink) { showYouTubeDialog(app.appId); }
      else { launchApp(app.appId); }
    };
    container.appendChild(btn);
  }
}

function renderDrawer() {
  const container = document.getElementById('drawer-apps');
  if (!container) return;
  container.innerHTML = '';
  if (_mediaApps.length === 0) {
    const p = document.createElement('p');
    p.className = 'drawer-empty';
    p.textContent = 'No apps — tap ⚙ Manage';
    container.appendChild(p);
    return;
  }
  for (let i = 0; i < _mediaApps.length; i++) {
    const app = _mediaApps[i];
    const row = document.createElement('div');
    row.className = 'drawer-app-row';
    row.draggable = true;
    row.dataset.idx = i;

    const handle = document.createElement('span');
    handle.className = 'drawer-grab-handle';
    handle.textContent = '⠿';

    const appBtn = document.createElement('button');
    appBtn.className = 'drawer-app-btn';
    appBtn.title = app.name;
    const iconEl = document.createElement('span');
    iconEl.className = 'app-icon';
    iconEl.textContent = app.icon;
    const nameEl = document.createElement('span');
    nameEl.className = 'app-name';
    nameEl.textContent = app.name;
    appBtn.appendChild(iconEl);
    appBtn.appendChild(nameEl);
    appBtn.onclick = e => {
      if (e.shiftKey && app.deepLink) { showYouTubeDialog(app.appId); }
      else { launchApp(app.appId); }
    };

    row.appendChild(handle);
    row.appendChild(appBtn);
    container.appendChild(row);
  }
}

function setupDrawerDragDrop() {
  const container = document.getElementById('drawer-apps');
  if (!container) return;
  let _dragIdx = null;

  container.addEventListener('dragstart', e => {
    const row = e.target.closest('.drawer-app-row');
    if (!row) return;
    _dragIdx = Number(row.dataset.idx);
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  container.addEventListener('dragover', e => {
    e.preventDefault();
    const row = e.target.closest('.drawer-app-row');
    container.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    if (!row || _dragIdx === null) return;
    const rect = row.getBoundingClientRect();
    const cls = e.clientY < rect.top + rect.height / 2 ? 'drag-over-top' : 'drag-over-bottom';
    row.classList.add(cls);
  });

  container.addEventListener('drop', e => {
    e.preventDefault();
    const row = e.target.closest('.drawer-app-row');
    if (!row || _dragIdx === null) return;
    const targetIdx = Number(row.dataset.idx);
    const rect = row.getBoundingClientRect();
    const toIdx = e.clientY < rect.top + rect.height / 2 ? targetIdx : targetIdx + 1;
    const newApps = moveApp(_mediaApps, _dragIdx, toIdx);
    _dragIdx = null;
    setMediaApps(newApps);
  });

  container.addEventListener('dragend', () => {
    _dragIdx = null;
    container.querySelectorAll('.dragging, .drag-over-top, .drag-over-bottom').forEach(el => {
      el.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom');
    });
  });
}

function openDrawer() {
  document.getElementById('remote-container').classList.add('drawer-open');
  document.getElementById('drawer-tab').textContent = '›';
}

function closeDrawer() {
  document.getElementById('remote-container').classList.remove('drawer-open');
  document.getElementById('drawer-tab').textContent = '‹';
}

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
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
}

// Live mode: typed characters become individual TV key commands.
function charToTvKey(ch) {
  if (/^[a-z]$/i.test(ch)) return 'KEY_' + ch.toUpperCase();
  if (/^[0-9]$/.test(ch))  return 'KEY_' + ch;
  if (ch === ' ')          return 'KEY_SPACE';
  return null;
}

const LIVE_NAV_KEYS = {
  Enter: 'KEY_ENTER', ArrowUp: 'KEY_UP', ArrowDown: 'KEY_DOWN',
  ArrowLeft: 'KEY_LEFT', ArrowRight: 'KEY_RIGHT', Backspace: 'KEY_BACKSPACE',
};

function sendText(text) {
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(buildTextCommand(text));
}

function showTextDialog() {
  const overlay   = document.getElementById('txt-overlay');
  const input     = document.getElementById('txt-input');
  const sendBtn   = document.getElementById('txt-send-btn');
  const cancelBtn = document.getElementById('txt-cancel-btn');
  const modeBtns  = overlay.querySelectorAll('[data-mode]');
  const hint      = document.getElementById('txt-hint');

  let mode = 'text';
  try { mode = localStorage.getItem('txtmode') === 'live' ? 'live' : 'text'; } catch (_) {}

  function setMode(m) {
    mode = m;
    try { localStorage.setItem('txtmode', m); } catch (_) {}
    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    sendBtn.hidden = m === 'live';
    cancelBtn.textContent = m === 'live' ? 'Done' : 'Cancel';
    hint.textContent = m === 'live'
      ? 'Each keystroke is sent to the TV as a key press.'
      : 'Edit freely, then Send to type the whole string on the TV.';
    input.value = '';
    input.focus();
  }

  overlay.classList.add('visible');
  setMode(mode);
  setTimeout(() => input.focus(), 40);

  function submit() {
    sendText(input.value);
    close();
  }

  function close() {
    overlay.classList.remove('visible');
    sendBtn.onclick   = null;
    cancelBtn.onclick = null;
    input.onkeydown   = null;
    input.oninput     = null;
    modeBtns.forEach(b => { b.onclick = null; });
  }

  modeBtns.forEach(b => { b.onclick = () => setMode(b.dataset.mode); });
  sendBtn.onclick   = submit;
  cancelBtn.onclick = close;
  input.onkeydown   = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (mode === 'text') {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      return;
    }
    const nav = LIVE_NAV_KEYS[e.key];
    if (nav) { e.preventDefault(); sendKey(nav); }
  };
  // Live mode characters come via input events (soft keyboards report key
  // "Unidentified" on keydown). Backspace and Enter are handled in keydown.
  input.oninput = e => {
    if (mode !== 'live') return;
    if (e.data) for (const ch of e.data) { const k = charToTvKey(ch); if (k) sendKey(k); }
    input.value = '';
  };
}

function toggleNumpad() {
  const panel = document.getElementById('numpad');
  if (!panel) return;
  const willOpen = panel.hidden;
  panel.hidden = !willOpen;
  flash('KEY_123');
  if (window.electronAPI?.setNumpad) window.electronAPI.setNumpad(willOpen);
}

function openSettings() {
  if (window.electronAPI) {
    window.electronAPI.openIpDialog(getIp() || '').then(ip => {
      if (ip) {
        localStorage.setItem('tvip', ip);
        setNeedsConfig(false);
        connect();
      }
    });
    return;
  }
  // iPhone / browser fallback — inline row
  const row  = document.getElementById('ip-row');
  const gear = document.getElementById('btn-settings');
  if (row.hidden) {
    document.getElementById('tvip').value = getIp() || '';
    row.hidden = false;
    gear.classList.add('open');
    document.getElementById('tvip').focus();
    document.getElementById('tvip').select();
  } else {
    row.hidden = true;
    gear.classList.remove('open');
  }
}

function applyIp() {
  const ip = document.getElementById('tvip').value.trim();
  if (ip) {
    if (ip !== getIp()) localStorage.removeItem('tvtoken');
    localStorage.setItem('tvip', ip);
    setNeedsConfig(false);
    connect();
  }
  document.getElementById('ip-row').hidden = true;
  document.getElementById('btn-settings').classList.remove('open');
}

function openCertPage() {
  if (!getIp()) return;
  window.open(`https://${getIp()}:8002`, '_blank');
}

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const key = KEY_MAP[e.key];
  if (key) { e.preventDefault(); sendKey(key); }
});

document.addEventListener('DOMContentLoaded', () => {
  _mediaApps = loadMediaApps();
  renderPinnedApps();
  renderDrawer();
  setupDrawerDragDrop();

  const drawerTab       = document.getElementById('drawer-tab');
  const manageBtn       = document.getElementById('drawer-manage-btn');

  drawerTab.addEventListener('click', () => {
    if (document.getElementById('remote-container').classList.contains('drawer-open')) closeDrawer();
    else openDrawer();
  });

  drawerTab.addEventListener('mouseenter', openDrawer);

  const _containerEl = document.getElementById('remote-container');

  // Report container bounds to main process so the poller can call
  // setIgnoreMouseEvents synchronously without an IPC round-trip on mousedown.
  function _sendBounds() {
    const r = _containerEl.getBoundingClientRect();
    window.electronAPI?.setInteractiveBounds({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }
  _sendBounds();
  new ResizeObserver(_sendBounds).observe(_containerEl);

  // Drawer auto-close: hide when cursor leaves the interactive area.
  let _closeTimer = null;
  let _prevNear   = true;
  document.addEventListener('mousemove', e => {
    const r = _containerEl.getBoundingClientRect();
    const inContainer = e.clientX >= r.left && e.clientX <= r.right &&
                        e.clientY >= r.top  && e.clientY <= r.bottom;
    const el   = inContainer ? null : document.elementFromPoint(e.clientX, e.clientY);
    const near = inContainer || (el && el !== document.body && el.tagName !== 'HTML');
    if (near !== _prevNear) {
      _prevNear = near;
      if (!near) {
        if (_closeTimer) clearTimeout(_closeTimer);
        _closeTimer = setTimeout(closeDrawer, 150);
      } else {
        if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }
      }
    }
  });

  manageBtn.addEventListener('click', () => {
    if (!window.electronAPI?.openAppManager) return;
    window.electronAPI.openAppManager(JSON.stringify(_mediaApps), getIp(), getRegion()).then(result => {
      if (result) {
        const { apps, region } = JSON.parse(result);
        if (region) localStorage.setItem('tvregion', region);
        setMediaApps(apps);
      }
    });
  });

  setStatus('err');
  if (!getIp()) {
    setNeedsConfig(true);
    openSettings();
  } else {
    connect();
  }

  const dot = document.getElementById('status-dot');
  if (dot) dot.addEventListener('click', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) openSettings();
  });

  const ipInput = document.getElementById('tvip');
  if (ipInput) ipInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); applyIp(); }
    if (e.key === 'Escape') { e.preventDefault(); toggleIpRow(); }
  });
});

// Exported for Jest — browser ignores this (module is undefined)
if (typeof module !== 'undefined' && module.exports) {
  const { APP_CATALOG, REGION_DEFAULTS } = require('./catalog.js');
  global.APP_CATALOG = APP_CATALOG;
  global.REGION_DEFAULTS = REGION_DEFAULTS;
  module.exports = {
    KEY_MAP,
    buildKeyCommand,
    buildTextCommand,
    charToTvKey,
    MEDIA_APPS_CATALOG: APP_CATALOG,
    loadMediaApps,
    saveMediaApps,
    parseYouTubeVideoId,
    reorderApp,
    moveApp,
  };
}
