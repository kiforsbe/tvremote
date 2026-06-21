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

const MEDIA_APPS_CATALOG = [
  { id: 'youtube',     name: 'YouTube',     icon: '▶',  appId: '111299001912', deepLink: true  },
  { id: 'netflix',     name: 'Netflix',     icon: 'N',  appId: '11101200001',  deepLink: false },
  { id: 'prime',       name: 'Prime',       icon: '📦', appId: '3201910019365',deepLink: false },
  { id: 'disney',      name: 'Disney+',     icon: '🏰', appId: '3201901017640',deepLink: false },
  { id: 'spotify',     name: 'Spotify',     icon: '🎵', appId: '3201606009684',deepLink: false },
  { id: 'max',         name: 'Max',         icon: 'M',  appId: '3201601007230',deepLink: false },
  { id: 'appletv',     name: 'Apple TV+',   icon: '',  appId: '3201807016597',deepLink: false },
  { id: 'applemusic',  name: 'Apple Music', icon: '🎶', appId: '3201908019066',deepLink: false },
  { id: 'hulu',        name: 'Hulu',        icon: '🟢', appId: '3201601007625',deepLink: false },
  { id: 'paramount',   name: 'Paramount+',  icon: '⛰', appId: '3201711015986',deepLink: false },
  { id: 'peacock',     name: 'Peacock',     icon: '🦚', appId: '3202005022341',deepLink: false },
  { id: 'tubi',        name: 'Tubi',        icon: '📺', appId: '3201504901843',deepLink: false },
  { id: 'pluto',       name: 'Pluto TV',    icon: '🪐', appId: '3202008022518',deepLink: false },
  { id: 'crunchyroll', name: 'Crunchyroll', icon: '🍥', appId: '3201611010411',deepLink: false },
];

function loadMediaApps() {
  try {
    const raw = localStorage.getItem('mediaApps');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return MEDIA_APPS_CATALOG.slice(0, 3);
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
      if (e.shiftKey && app.deepLink) { showYouTubeInput(btn, app.appId); }
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
      if (e.shiftKey && app.deepLink) { showYouTubeInput(appBtn, app.appId); }
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

function showYouTubeInput(anchorEl, appId) {
  const existing = document.getElementById('yt-input-row');
  if (existing) existing.remove();

  const row = document.createElement('div');
  row.id = 'yt-input-row';
  row.className = 'yt-input-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'yt-input';
  input.placeholder = 'YouTube URL or video ID';

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'yt-input-actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn yt-confirm-btn';
  confirmBtn.textContent = '▶';

  const err = document.createElement('span');
  err.className = 'yt-input-err';
  err.hidden = true;
  err.textContent = 'Not a valid YouTube URL or ID';

  const submit = () => {
    const videoId = parseYouTubeVideoId(input.value);
    if (!videoId) { err.hidden = false; return; }
    launchApp(appId, videoId);
    row.remove();
  };

  confirmBtn.onclick = submit;
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  submit();
    if (e.key === 'Escape') row.remove();
  });

  actionsDiv.appendChild(input);
  actionsDiv.appendChild(confirmBtn);
  row.appendChild(actionsDiv);
  row.appendChild(err);

  const parent = anchorEl.closest('.drawer-app-row') || anchorEl.closest('.pinned-apps');
  if (parent) parent.after(row);
  else        anchorEl.after(row);
  input.focus();
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

  let _ignoreMouse = true;
  let _closeTimer = null;
  document.addEventListener('mousemove', e => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const shouldIgnore = !el || el === document.body || el.tagName === 'HTML';
    if (shouldIgnore !== _ignoreMouse) {
      _ignoreMouse = shouldIgnore;
      window.electronAPI?.setIgnoreMouseEvents(shouldIgnore);
      if (shouldIgnore) {
        if (_closeTimer) clearTimeout(_closeTimer);
        _closeTimer = setTimeout(closeDrawer, 150);
      } else {
        if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }
      }
    }
  });

  manageBtn.addEventListener('click', () => {
    if (!window.electronAPI?.openAppManager) return;
    window.electronAPI.openAppManager(JSON.stringify(_mediaApps), getIp()).then(result => {
      if (result) setMediaApps(JSON.parse(result));
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
  module.exports = {
    KEY_MAP,
    buildKeyCommand,
    MEDIA_APPS_CATALOG,
    loadMediaApps,
    saveMediaApps,
    buildAppLaunchCommand,
    parseYouTubeVideoId,
    reorderApp,
    moveApp,
  };
}
