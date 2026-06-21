const { app, BrowserWindow, globalShortcut, Menu, ipcMain, session, screen } = require('electron');
const http      = require('http');
const fs        = require('fs');
const path      = require('path');
const dgram     = require('dgram');
const WebSocket = require('ws');

const APP_DIR   = path.join(__dirname, 'app');
const HTTP_PORT = 3000;
const WIN_W          = 400;
const WIN_H          = 680;
const WIN_H_NUMPAD   = 760;

let mainWin;            // set once in app.whenReady()
let _interactiveBounds; // set by renderer after layout, used by poller

// Poll cursor position in main process — avoids IPC round-trip latency that
// would cause setIgnoreMouseEvents(false) to arrive after mousedown.
function startIgnoreMousePoller(win) {
  let prev = true;
  setInterval(() => {
    if (!win || win.isDestroyed() || win.isMinimized() || !_interactiveBounds) return;
    const { x: mx, y: my } = screen.getCursorScreenPoint();
    const [wx, wy] = win.getPosition();
    const cx = mx - wx;
    const cy = my - wy;
    const b = _interactiveBounds;
    const inside = cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
    if (inside === prev) { prev = !inside; win.setIgnoreMouseEvents(!inside, { forward: true }); }
  }, 16);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.js':   'application/javascript',
};


function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;

    // ── TV discovery (SSDP runs server-side; browsers can't do UDP multicast) ─
    if (pathname === '/api/discover' && req.method === 'GET') {
      try {
        const tvs = await discoverTvs();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tvs));
      } catch (_) {
        res.writeHead(500); res.end('[]');
      }
      return;
    }

    // ── App launch proxy (TV REST API has no CORS headers) ─────────────────
    if (pathname === '/api/launch' && req.method === 'POST') {
      let body = '';
      await new Promise(resolve => { req.on('data', c => { body += c; }); req.on('end', resolve); });
      try {
        const { ip, appId, metaTag } = JSON.parse(body);
        const postBody = metaTag ? JSON.stringify({ id: metaTag }) : '';
        await new Promise(resolve => {
          const opts = {
            hostname: ip, port: 8001,
            path:    `/api/v2/applications/${encodeURIComponent(appId)}`,
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postBody) },
            timeout: 5000,
          };
          const tvReq = http.request(opts, tvRes => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: tvRes.statusCode }));
            resolve();
          });
          tvReq.on('timeout', () => tvReq.destroy());
          tvReq.on('error', err => {
            res.writeHead(502); res.end(JSON.stringify({ error: err.message })); resolve();
          });
          if (postBody) tvReq.write(postBody);
          tvReq.end();
        });
      } catch (_) {
        res.writeHead(400); res.end(JSON.stringify({ error: 'Bad request' }));
      }
      return;
    }

    // ── Static files — '/' serves the mobile UI ────────────────────────────
    const rel  = pathname === '/' ? '/mobile.html' : pathname;
    const file = path.join(APP_DIR, path.normalize(rel));

    if (!file.startsWith(APP_DIR + path.sep) && file !== APP_DIR) {
      res.writeHead(403); return res.end();
    }

    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });

  // WebSocket proxy: phone connects ws://desktop:3000/tv, we relay to wss://tv:8002.
  // This avoids the Samsung TV's self-signed cert being rejected by mobile browsers.
  const wss = new WebSocket.Server({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== '/tv') { socket.destroy(); return; }

    wss.handleUpgrade(request, socket, head, phoneWs => {
      const ip    = url.searchParams.get('ip');
      const name  = url.searchParams.get('name') || btoa('TVRemote');
      const token = url.searchParams.get('token');
      if (!ip) { phoneWs.close(1008, 'missing ip'); return; }

      const tvUrl = `wss://${ip}:8002/api/v2/channels/samsung.remote.control?name=${name}${token ? '&token=' + token : ''}`;
      const tvWs  = new WebSocket(tvUrl, { rejectUnauthorized: false });

      tvWs.on('message', data => { if (phoneWs.readyState === WebSocket.OPEN) phoneWs.send(data); });
      tvWs.on('close',   ()   => { if (phoneWs.readyState === WebSocket.OPEN) phoneWs.close(); });
      tvWs.on('error',   ()   => { if (phoneWs.readyState === WebSocket.OPEN) phoneWs.close(); });

      phoneWs.on('message', data => { if (tvWs.readyState === WebSocket.OPEN) tvWs.send(data); });
      phoneWs.on('close',   ()   => { if (tvWs.readyState   !== WebSocket.CLOSED) tvWs.close(); });
      phoneWs.on('error',   ()   => { if (tvWs.readyState   !== WebSocket.CLOSED) tvWs.close(); });
    });
  });

  server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`Remote available at http://<this-pc-ip>:${HTTP_PORT}`);
  });
}

function registerShortcuts(win) {
  const map = {
    MediaPlayPause: 'KEY_PLAY',
    VolumeUp:       'KEY_VOLUP',
    VolumeDown:     'KEY_VOLDOWN',
    VolumeMute:     'KEY_MUTE',
  };

  for (const [accel, key] of Object.entries(map)) {
    globalShortcut.register(accel, () => {
      win.webContents.executeJavaScript(`sendKey('${key}')`).catch(() => {});
    });
  }
}

// ── TV Discovery ────────────────────────────────────────────────────────────

const SSDP_ADDR    = '239.255.255.250';
const SSDP_PORT    = 1900;
const SSDP_TIMEOUT = 4000;

const SSDP_MSG = Buffer.from([
  'M-SEARCH * HTTP/1.1',
  `HOST: ${SSDP_ADDR}:${SSDP_PORT}`,
  'MAN: "ssdp:discover"',
  'MX: 3',
  'ST: ssdp:all',
  '', '',
].join('\r\n'));

function fetchDeviceName(location) {
  return new Promise((resolve, reject) => {
    try {
      const url     = new URL(location);
      const options = {
        hostname: url.hostname,
        port:     Number(url.port) || 80,
        path:     url.pathname + url.search,
        timeout:  2000,
      };
      const req = http.get(options, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          const m = data.match(/<friendlyName>([^<]+)<\/friendlyName>/);
          resolve(m ? m[1].trim() : null);
        });
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

function discoverTvs() {
  return new Promise(resolve => {
    const found   = new Map();  // ip → {name, ip}
    const fetches = [];

    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    sock.on('error', () => {
      try { sock.close(); } catch (_) {}
      resolve([...found.values()]);
    });

    sock.on('message', (msg, rinfo) => {
      const text = msg.toString();
      if (!/SERVER:[^\r\n]*Samsung/i.test(text)) return;
      const ip = rinfo.address;
      if (found.has(ip)) return;
      found.set(ip, { name: ip, ip });

      const locMatch = text.match(/^LOCATION:\s*(.+)$/im);
      if (locMatch) {
        const p = fetchDeviceName(locMatch[1].trim())
          .then(name => { if (name) found.set(ip, { name, ip }); })
          .catch(() => {});
        fetches.push(p);
      }
    });

    sock.bind(0, () => {
      try {
        sock.addMembership(SSDP_ADDR);
        sock.send(SSDP_MSG, 0, SSDP_MSG.length, SSDP_PORT, SSDP_ADDR);
      } catch (e) {
        try { sock.close(); } catch (_) {}
        resolve([]);
      }
    });

    setTimeout(async () => {
      try { sock.close(); } catch (_) {}
      await Promise.allSettled(fetches);
      resolve([...found.values()]);
    }, SSDP_TIMEOUT);
  });
}

ipcMain.handle('open-ip-dialog', (event, currentIp) => {
  const parentWin = BrowserWindow.fromWebContents(event.sender);
  return new Promise(resolve => {
    const dlg = new BrowserWindow({
      width:     380,
      height:    280,
      parent:    parentWin,
      modal:     true,
      frame:     false,
      resizable: false,
      backgroundColor: '#1f1f1f',
      webPreferences: {
        nodeIntegration:  false,
        contextIsolation: true,
        preload:          path.join(__dirname, 'dialog-preload.js'),
      },
    });

    try { dlg.setBackgroundMaterial('mica'); } catch (_) {}

    dlg.loadFile(path.join(__dirname, 'ip-dialog.html'), { query: { ip: currentIp } });

    const onSave   = (_, savedIp) => { cleanup(); dlg.close(); resolve(savedIp); };
    const onCancel = ()           => { cleanup(); dlg.close(); resolve(null); };

    function cleanup() {
      ipcMain.removeListener('ip-dialog-save',   onSave);
      ipcMain.removeListener('ip-dialog-cancel', onCancel);
    }

    ipcMain.once('ip-dialog-save',   onSave);
    ipcMain.once('ip-dialog-cancel', onCancel);
    dlg.on('closed', () => { cleanup(); resolve(null); });
  });
});

ipcMain.handle('set-numpad', (event, open) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (w) w.setSize(WIN_W, open ? WIN_H_NUMPAD : WIN_H);
});

ipcMain.handle('discover-tvs', discoverTvs);

ipcMain.handle('launch-app', (_event, ip, appId, metaTag) => {
  return new Promise(resolve => {
    const body = metaTag ? JSON.stringify({ id: metaTag }) : '';
    const options = {
      hostname: ip,
      port:     8001,
      path:     `/api/v2/applications/${encodeURIComponent(appId)}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = http.request(options, res => resolve({ status: res.statusCode }));
    req.on('error', err => resolve({ error: err.message }));
    if (body) req.write(body);
    req.end();
  });
});

ipcMain.on('set-interactive-bounds', (_, b) => { _interactiveBounds = b; });

ipcMain.on('window-minimize', event => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on('window-maximize', event => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (!w) return;
  w.isMaximized() ? w.unmaximize() : w.maximize();
});

ipcMain.handle('open-app-manager', (event, appsJson, ip, region) => {
  const parentWin = BrowserWindow.fromWebContents(event.sender);
  return new Promise(resolve => {
    const dlg = new BrowserWindow({
      width:     420,
      height:    596,
      minWidth:  320,
      minHeight: 420,
      parent:    parentWin,
      modal:     true,
      frame:     false,
      resizable: true,
      backgroundColor: '#1f1f1f',
      webPreferences: {
        nodeIntegration:  false,
        contextIsolation: true,
        preload:          path.join(__dirname, 'app-manager-preload.js'),
      },
    });

    try { dlg.setBackgroundMaterial('mica'); } catch (_) {}

    dlg.on('maximize',   () => dlg.webContents.send('window-state-changed', true));
    dlg.on('unmaximize', () => dlg.webContents.send('window-state-changed', false));

    dlg.loadFile(
      path.join(__dirname, 'app', 'app-manager.html'),
      { query: { apps: appsJson, ip: ip || '', region: region || 'US' } }
    );

    const onSave   = (_, json) => { cleanup(); resolve(json);  dlg.close(); };
    const onCancel = ()        => { cleanup(); resolve(null); dlg.close(); };

    function cleanup() {
      ipcMain.removeListener('app-manager-save',   onSave);
      ipcMain.removeListener('app-manager-cancel', onCancel);
    }

    ipcMain.once('app-manager-save',   onSave);
    ipcMain.once('app-manager-cancel', onCancel);
    dlg.on('closed', () => { cleanup(); resolve(null); });
  });
});

// Fetch basic TV device info (countryCode, modelName) from /api/v2/
ipcMain.handle('get-tv-info', (_event, ip) => new Promise(resolve => {
  const req = http.get({
    hostname: ip, port: 8001, path: '/api/v2/', timeout: 4000,
  }, res => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        resolve({
          countryCode: json.device?.countryCode || null,
          modelName:   json.device?.modelName   || null,
        });
      } catch (_) { resolve(null); }
    });
  });
  req.on('timeout', () => { req.destroy(); resolve(null); });
  req.on('error',   () => resolve(null));
}));

// POST-probe each appId to confirm installation.
// POST 200 = installed (and now launching), 404 = not installed.
// Probes sequentially — Samsung TVs reject concurrent POST requests.
// Sends KEY_HOME after probing to return the TV to the home screen.
ipcMain.handle('probe-tv-apps', async (_event, ip, appIds) => {
  const probe = appId => new Promise(resolve => {
    const options = {
      hostname: ip, port: 8001,
      path:     `/api/v2/applications/${encodeURIComponent(appId)}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': 0 },
      timeout:  4000,
    };
    const req = http.request(options, res => resolve(res.statusCode === 200 ? appId : null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error',   () => resolve(null));
    req.end();
  });

  const delay = ms => new Promise(r => setTimeout(r, ms));
  const available = [];
  for (const appId of (appIds || [])) {
    const result = await probe(appId);
    if (result) available.push(result);
    await delay(300);
  }

  // Navigate TV back to home screen after launching all those apps
  if (mainWin) {
    mainWin.webContents.executeJavaScript("sendKey('KEY_HOME')").catch(() => {});
  }

  return { available };
});

app.whenReady().then(() => {
  // cert_verify_proc_builtin rejects Samsung TV's self-signed cert before
  // certificate-error can intercept it — bypass at the session level instead
  session.defaultSession.setCertificateVerifyProc((_req, cb) => cb(0));

  Menu.setApplicationMenu(null);

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  // Remote body (180px) is right-aligned at win_x + 360 (400 - 40 padding).
  // To keep remote left edge at same screen position as old 260px centred window:
  // old remote left = (sw-260)/2 + 40 = (sw-180)/2
  // new win_x + 180 = (sw-180)/2  →  win_x = (sw-540)/2
  const winX = Math.round((sw - 540) / 2);
  const winY = Math.round((sh - WIN_H) / 2);

  mainWin = new BrowserWindow({
    x:           winX,
    y:           winY,
    width:       WIN_W,
    height:      WIN_H,
    resizable:   false,
    frame:       false,
    transparent: true,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload:          path.join(__dirname, 'preload.js'),
    },
  });

  mainWin.setIgnoreMouseEvents(true, { forward: true });
  startIgnoreMousePoller(mainWin);

  mainWin.loadFile(path.join(APP_DIR, 'index.html'));
  startHttpServer();
  registerShortcuts(mainWin);

  mainWin.webContents.on('context-menu', () => {
    Menu.buildFromTemplate([
      { label: 'Set TV IP…',
        click: () => mainWin.webContents.executeJavaScript('openSettings()').catch(() => {}) },
      { label: 'Reconnect',
        click: () => mainWin.webContents.executeJavaScript('connect()').catch(() => {}) },
      { label: 'Accept TV Certificate',
        click: () => mainWin.webContents.executeJavaScript('openCertPage()').catch(() => {}) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]).popup({ window: mainWin });
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  app.quit();
});
