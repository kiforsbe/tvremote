const { app, BrowserWindow, globalShortcut, Menu, ipcMain, session, screen } = require('electron');
const http = require('http');
const fs   = require('fs');
const path = require('path');
const dgram = require('dgram');

const APP_DIR   = path.join(__dirname, 'app');
const HTTP_PORT = 3000;
const WIN_W          = 400;
const WIN_H          = 680;
const WIN_H_NUMPAD   = 760;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.js':   'application/javascript',
};


function startHttpServer() {
  http.createServer((req, res) => {
    const rel  = req.url === '/' ? '/index.html' : req.url;
    const file = path.join(APP_DIR, path.normalize(rel));

    // Prevent directory traversal
    if (!file.startsWith(APP_DIR + path.sep) && file !== APP_DIR) {
      res.writeHead(403);
      return res.end();
    }

    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      });
      res.end(data);
    });
  }).listen(HTTP_PORT, '0.0.0.0', () => {
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
  'ST: urn:samsung.com:device:RemoteControlReceiver:1',
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
      const ip = rinfo.address;
      if (found.has(ip)) return;
      found.set(ip, { name: ip, ip });

      const locMatch = msg.toString().match(/^LOCATION:\s*(.+)$/im);
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
  const mainWin = BrowserWindow.fromWebContents(event.sender);
  return new Promise(resolve => {
    const dlg = new BrowserWindow({
      width:     380,
      height:    280,
      parent:    mainWin,
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

    const onSave = (_, ip) => { cleanup(); dlg.close(); resolve(ip); };
    const onCancel = ()    => { cleanup(); dlg.close(); resolve(null); };

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

ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (w) w.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.handle('open-app-manager', (_event, _appsJson) => {
  // stub — replaced in Task 6
  return null;
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

  const win = new BrowserWindow({
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

  win.setIgnoreMouseEvents(true, { forward: true });

  win.loadFile(path.join(APP_DIR, 'index.html'));
  startHttpServer();
  registerShortcuts(win);

  win.webContents.on('context-menu', () => {
    Menu.buildFromTemplate([
      { label: 'Set TV IP…',
        click: () => win.webContents.executeJavaScript('openSettings()').catch(() => {}) },
      { label: 'Reconnect',
        click: () => win.webContents.executeJavaScript('connect()').catch(() => {}) },
      { label: 'Accept TV Certificate',
        click: () => win.webContents.executeJavaScript('openCertPage()').catch(() => {}) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]).popup({ window: win });
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  app.quit();
});
