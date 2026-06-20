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
  return localStorage.getItem('tvip') || '192.168.50.122';
}

function connect() {
  if (ws) { ws.close(); ws = null; }
  const ip = getIp();
  const url =
    `wss://${ip}:8002/api/v2/channels/samsung.remote.control?name=${btoa('TVRemote')}`;
  ws = new WebSocket(url);
  ws.onopen = () => setStatus('connecting');
  ws.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === 'ms.channel.connect') setStatus('ok');
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

function openSettings() {
  if (window.electronAPI) {
    window.electronAPI.openIpDialog(getIp()).then(ip => {
      if (ip) { localStorage.setItem('tvip', ip); connect(); }
    });
    return;
  }
  // iPhone / browser fallback — inline row
  const row  = document.getElementById('ip-row');
  const gear = document.getElementById('btn-settings');
  if (row.hidden) {
    document.getElementById('tvip').value = getIp();
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
  if (ip) { localStorage.setItem('tvip', ip); connect(); }
  document.getElementById('ip-row').hidden = true;
  document.getElementById('btn-settings').classList.remove('open');
}

function openCertPage() {
  window.open(`https://${getIp()}:8002`, '_blank');
}

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const key = KEY_MAP[e.key];
  if (key) { e.preventDefault(); sendKey(key); }
});

document.addEventListener('DOMContentLoaded', () => {
  setStatus('err');
  connect();

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
  module.exports = { KEY_MAP, buildKeyCommand };
}
