const { app, BrowserWindow, globalShortcut, Menu, ipcMain, session } = require('electron');
const http = require('http');
const fs   = require('fs');
const path = require('path');

const APP_DIR   = path.join(__dirname, 'app');
const HTTP_PORT = 3000;
const WIN_W     = 260;
const WIN_H     = 680;

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

ipcMain.handle('open-ip-dialog', (event, currentIp) => {
  const mainWin = BrowserWindow.fromWebContents(event.sender);
  return new Promise(resolve => {
    const dlg = new BrowserWindow({
      width:     380,
      height:    180,
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

app.whenReady().then(() => {
  // cert_verify_proc_builtin rejects Samsung TV's self-signed cert before
  // certificate-error can intercept it — bypass at the session level instead
  session.defaultSession.setCertificateVerifyProc((_req, cb) => cb(0));

  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
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
