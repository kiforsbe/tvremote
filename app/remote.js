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

function setStatus(text, state) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = state || '';
}

function connect() {
  if (ws) { ws.close(); ws = null; }
  const ip = document.getElementById('tvip').value.trim();
  if (!ip) return;
  setStatus('Connecting…');
  const url =
    `wss://${ip}:8002/api/v2/channels/samsung.remote.control?name=${btoa('TVRemote')}`;
  ws = new WebSocket(url);
  ws.onopen  = () => setStatus('Connected', 'ok');
  ws.onerror = () => setStatus('Error — see cert hint below', 'err');
  ws.onclose = () => { setStatus('Disconnected', 'err'); ws = null; };
}

function sendKey(key) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    setStatus('Not connected', 'err');
    return;
  }
  ws.send(buildKeyCommand(key));
}

function openCertPage() {
  const ip = document.getElementById('tvip').value.trim() || '192.168.50.122';
  window.open(`https://${ip}:8002`, '_blank');
}

document.addEventListener('keydown', e => {
  const key = KEY_MAP[e.key];
  if (key) { e.preventDefault(); sendKey(key); }
});

// Exported for Jest — browser ignores this (module is undefined)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KEY_MAP, buildKeyCommand };
}
