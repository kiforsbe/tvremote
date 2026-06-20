const { app, BrowserWindow, globalShortcut, Menu } = require('electron');
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

// Allow Samsung TV's self-signed WSS certificate
app.on('certificate-error', (event, _wc, _url, _err, _cert, cb) => {
  event.preventDefault();
  cb(true);
});

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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width:     WIN_W,
    height:    WIN_H,
    resizable: false,
    frame:     false,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
    },
  });

  win.loadFile(path.join(APP_DIR, 'index.html'));
  startHttpServer();
  registerShortcuts(win);
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  app.quit();
});
