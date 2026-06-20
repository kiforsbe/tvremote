const KEY_MAP = {
  ArrowUp:    'KEY_UP',
  ArrowDown:  'KEY_DOWN',
  ArrowLeft:  'KEY_LEFT',
  ArrowRight: 'KEY_RIGHT',
  Enter:      'KEY_ENTER',
  ' ':        'KEY_ENTER',
  h:          'KEY_HOME',
  b:          'KEY_BACK',
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
  ws.onopen  = () => setStatus('ok');
  ws.onerror = () => setStatus('err');
  ws.onclose = () => { setStatus('err'); ws = null; };
}

function sendKey(key) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(buildKeyCommand(key));
}

function promptIp() {
  const ip = prompt('TV IP address:', getIp());
  if (ip && ip.trim()) {
    localStorage.setItem('tvip', ip.trim());
    connect();
  }
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
  connect();
  const dot = document.getElementById('status-dot');
  if (dot) {
    dot.addEventListener('click', () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) promptIp();
    });
  }
});

// Exported for Jest — browser ignores this (module is undefined)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KEY_MAP, buildKeyCommand };
}
