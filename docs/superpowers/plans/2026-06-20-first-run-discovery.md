# First-Run IP Config & Samsung TV Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the hardcoded default IP, auto-open the config dialog on first run, add SSDP-based Samsung TV discovery to the dialog, and pulse the gear button amber until an IP is configured.

**Architecture:** Three sequential tasks: (1) remote.js + index.html for first-run logic and gear highlight, (2) main.js for the SSDP IPC handler, (3) dialog-preload.js + ip-dialog.html for the discovery UI. Tasks 2 and 3 are decoupled from Task 1 but Task 3 depends on Task 2's IPC handler existing.

**Tech Stack:** Node.js built-in `dgram` (UDP/SSDP), `http` (already imported in main.js), Electron IPC, vanilla JS/HTML/CSS

## Global Constraints

- No new npm dependencies — use only Node built-ins
- Do not change `main.js`, `preload.js`, or any file under `app/` except where listed below
- Dialog window height: 180px → 280px (set in `main.js` `open-ip-dialog` handler)
- SSDP search target: `urn:samsung.com:device:RemoteControlReceiver:1`
- SSDP timeout: 4000ms; `fetchDeviceName` HTTP timeout: 2000ms
- Gear button highlight: CSS class `needs-config` on `#btn-settings`; amber colour `#ffd166`; pulse animation 1.5s ease-in-out infinite
- Clicking a discovered TV fills the IP input field — does not auto-save
- Browser/PWA path (no `window.electronAPI`): no discovery; `openSettings()` shows inline `ip-row` as before

---

## File Map

| File | Action | Change |
|---|---|---|
| `app/remote.js` | Modify | Remove default IP; add `setNeedsConfig`; guard `connect`; update `openSettings`/`applyIp`/`DOMContentLoaded` |
| `app/index.html` | Modify | Add `needs-config` CSS |
| `main.js` | Modify | Add `dgram`; add `fetchDeviceName`/`discoverTvs`; add `discover-tvs` IPC handler; dialog height 180→280 |
| `dialog-preload.js` | Modify | Add `discoverTvs: () => ipcRenderer.invoke('discover-tvs')` |
| `ip-dialog.html` | Replace | Add discovery section (status line + TV list + divider) above IP field |

---

## Task 1: Remove default IP, first-run auto-open, gear button highlight

**Files:**
- Modify: `app/remote.js`
- Modify: `app/index.html`

**Interfaces:**
- Produces:
  - `getIp(): string|null` — returns `localStorage.getItem('tvip')` or `null`
  - `setNeedsConfig(on: boolean): void` — toggles `needs-config` class on `#btn-settings`
  - `connect()` — no-ops when `getIp()` is falsy
  - `DOMContentLoaded` handler — calls `setNeedsConfig(true)` + `openSettings()` when no IP stored

- [ ] **Step 1: Update `getIp()` in `app/remote.js`**

Replace lines 38–40:
```js
function getIp() {
  return localStorage.getItem('tvip');
}
```

- [ ] **Step 2: Add `setNeedsConfig()` helper in `app/remote.js`**

Insert immediately after the `setStatus` function (after line 36):
```js
function setNeedsConfig(on) {
  const btn = document.getElementById('btn-settings');
  if (btn) btn.classList.toggle('needs-config', on);
}
```

- [ ] **Step 3: Guard `connect()` against a missing IP in `app/remote.js`**

Replace lines 42–43 (the start of `connect`):
```js
function connect() {
  if (!getIp()) return;
  if (ws) { ws.close(); ws = null; }
```

- [ ] **Step 4: Update `openSettings()` to pass empty string and clear highlight in `app/remote.js`**

Replace lines 87–107:
```js
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
```

- [ ] **Step 5: Update `applyIp()` to clear the highlight in `app/remote.js`**

Replace lines 109–118:
```js
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
```

- [ ] **Step 6: Update `DOMContentLoaded` to auto-open on first run in `app/remote.js`**

Replace lines 130–143:
```js
document.addEventListener('DOMContentLoaded', () => {
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
```

- [ ] **Step 7: Add `needs-config` CSS to `app/index.html`**

Insert before the closing `</style>` tag (after line 359):
```css
    @keyframes settings-pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.4; }
    }

    .btn-settings.needs-config {
      color: #ffd166;
      animation: settings-pulse 1.5s ease-in-out infinite;
    }
```

- [ ] **Step 8: Smoke-test Task 1**

```powershell
# Clear any stored IP so first-run triggers
# Open DevTools console in the running app and run:
#   localStorage.removeItem('tvip'); location.reload()
# Then restart the app:
npm start
```

Expected:
1. App opens, gear button (⚙) pulses amber immediately
2. IP config dialog opens automatically
3. Cancel the dialog → app stays disconnected, gear keeps pulsing
4. Right-click → "Set TV IP…" → save any IP → gear stops pulsing, app attempts connection

- [ ] **Step 9: Verify existing unit tests still pass**

```powershell
npm test
```

Expected: 9 tests pass, 0 failures.

- [ ] **Step 10: Commit**

```powershell
git add app/remote.js app/index.html
git commit -m "feat: remove default IP, auto-open config on first run, pulse gear until IP set"
```

---

## Task 2: SSDP discovery IPC handler

**Files:**
- Modify: `main.js`

**Interfaces:**
- Produces: `ipcMain.handle('discover-tvs', discoverTvs)` — returns `Promise<Array<{name: string, ip: string}>>`
- `discoverTvs()` resolves after 4000ms with all found Samsung TVs (may be empty array)
- `fetchDeviceName(location: string)` returns `Promise<string|null>` — TV friendly name or null

- [ ] **Step 1: Add `dgram` require to `main.js`**

Add one line after line 4 (`const path = require('path');`):
```js
const dgram = require('dgram');
```

- [ ] **Step 2: Add SSDP constants and `fetchDeviceName` to `main.js`**

Insert after the `registerShortcuts` function (after line 56, before the first `ipcMain.handle`):
```js
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
```

- [ ] **Step 3: Register the `discover-tvs` IPC handler in `main.js`**

Insert after `ipcMain.handle('set-numpad', ...)` (after line 97):
```js
ipcMain.handle('discover-tvs', discoverTvs);
```

- [ ] **Step 4: Smoke-test the IPC handler**

Start the app, then open DevTools console in the main window and run:
```js
window.electronAPI  // confirm electronAPI exists
```

Then from a Node REPL or by temporarily adding a log in main.js, confirm `discoverTvs()` resolves without throwing. (Full UI test happens in Task 3.)

```powershell
npm start
```

Expected: app starts normally, no errors in console about `dgram` or the new IPC handler.

- [ ] **Step 5: Commit**

```powershell
git add main.js
git commit -m "feat: add SSDP Samsung TV discovery IPC handler"
```

---

## Task 3: Discovery UI in IP dialog

**Files:**
- Modify: `dialog-preload.js`
- Replace: `ip-dialog.html`
- Modify: `main.js` (dialog window height only)

**Interfaces:**
- Consumes: `ipcRenderer.invoke('discover-tvs')` → `Promise<Array<{name: string, ip: string}>>` (from Task 2)
- `window.dialogAPI.discoverTvs()` exposed to dialog renderer

- [ ] **Step 1: Expose `discoverTvs` in `dialog-preload.js`**

Replace the entire file:
```js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dialogAPI', {
  save:        (ip) => ipcRenderer.send('ip-dialog-save', ip),
  cancel:      ()   => ipcRenderer.send('ip-dialog-cancel'),
  discoverTvs: ()   => ipcRenderer.invoke('discover-tvs'),
});
```

- [ ] **Step 2: Update dialog window height in `main.js`**

In the `ipcMain.handle('open-ip-dialog', ...)` handler (around line 63), change `height: 180` to `height: 280`:
```js
    const dlg = new BrowserWindow({
      width:     380,
      height:    280,
```

- [ ] **Step 3: Replace `ip-dialog.html` with the discovery-enabled version**

Replace the entire file with:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TV Remote Settings</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html {
      height: 100%;
      border-radius: 8px;
      overflow: hidden;
    }

    body {
      height: 100%;
      font-family: 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.95);
      background: transparent;
      display: flex;
      flex-direction: column;
      padding: 24px 24px 20px;
      gap: 10px;
      -webkit-app-region: drag;
    }

    button, input { -webkit-app-region: no-drag; }

    h1 {
      font-size: 14px;
      font-weight: 600;
      line-height: 20px;
    }

    /* ── Discovery ─────────────────────────────── */
    .discovery-status {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.45);
      font-style: italic;
    }

    .tv-list {
      display: flex;
      flex-direction: column;
      gap: 3px;
      max-height: 90px;
      overflow-y: auto;
    }

    .tv-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 10px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.07);
      cursor: pointer;
      text-align: left;
      font-family: inherit;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.95);
      transition: background 0.1s;
    }

    .tv-item:hover  { background: rgba(255, 255, 255, 0.09); }
    .tv-item:active { background: rgba(255, 255, 255, 0.04); }

    .tv-name { flex: 1; }

    .tv-ip {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.4);
      font-family: monospace;
    }

    .divider {
      height: 1px;
      background: rgba(255, 255, 255, 0.08);
    }

    /* ── IP field ──────────────────────────────── */
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    label {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.78);
    }

    input {
      height: 32px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-bottom-color: rgba(255, 255, 255, 0.45);
      border-radius: 4px;
      color: rgba(255, 255, 255, 0.95);
      font-family: inherit;
      font-size: 14px;
      padding: 0 12px;
      outline: none;
      transition: border-color 0.1s, background 0.1s;
    }

    input:focus {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.09);
      border-bottom-color: #60cdff;
    }

    /* ── Actions ───────────────────────────────── */
    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: auto;
    }

    button {
      height: 32px;
      min-width: 80px;
      padding: 0 16px;
      border-radius: 4px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 400;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background 0.1s;
    }

    .btn-cancel {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.09);
      color: rgba(255, 255, 255, 0.95);
    }
    .btn-cancel:hover  { background: rgba(255, 255, 255, 0.09); }
    .btn-cancel:active { background: rgba(255, 255, 255, 0.04); }

    .btn-save {
      background: #0067c0;
      border-color: rgba(255, 255, 255, 0.07);
      color: #fff;
    }
    .btn-save:hover  { background: #1975c9; }
    .btn-save:active { background: #0060b4; color: rgba(255,255,255,0.75); }
  </style>
</head>
<body>
  <h1>TV Remote Settings</h1>

  <div class="discovery-status" id="discovery-status">Searching for TVs…</div>
  <div class="tv-list"          id="tv-list"></div>
  <div class="divider"          id="divider" hidden></div>

  <div class="field">
    <label for="ip">TV IP address</label>
    <input id="ip" type="text" inputmode="decimal"
           placeholder="192.168.x.x" spellcheck="false" autocomplete="off">
  </div>
  <div class="actions">
    <button class="btn-cancel" id="btn-cancel">Cancel</button>
    <button class="btn-save"   id="btn-save">Save</button>
  </div>

  <script>
    const input = document.getElementById('ip');
    input.value = new URLSearchParams(location.search).get('ip') || '';
    input.focus();
    input.select();

    document.getElementById('btn-save').onclick   = () => window.dialogAPI.save(input.value.trim());
    document.getElementById('btn-cancel').onclick = () => window.dialogAPI.cancel();

    document.addEventListener('keydown', e => {
      if (e.key === 'Enter')  window.dialogAPI.save(input.value.trim());
      if (e.key === 'Escape') window.dialogAPI.cancel();
    });

    // TV discovery
    window.dialogAPI.discoverTvs().then(tvs => {
      const statusEl = document.getElementById('discovery-status');
      const listEl   = document.getElementById('tv-list');
      const divider  = document.getElementById('divider');

      if (tvs.length === 0) {
        statusEl.textContent = 'No TVs found';
      } else {
        statusEl.hidden = true;
        divider.hidden  = false;
        for (const tv of tvs) {
          const btn      = document.createElement('button');
          btn.className  = 'tv-item';
          const nameSpan = document.createElement('span');
          nameSpan.className   = 'tv-name';
          nameSpan.textContent = tv.name;
          const ipSpan = document.createElement('span');
          ipSpan.className   = 'tv-ip';
          ipSpan.textContent = tv.ip;
          btn.appendChild(nameSpan);
          btn.appendChild(ipSpan);
          btn.onclick = () => { input.value = tv.ip; input.focus(); };
          listEl.appendChild(btn);
        }
      }
    }).catch(() => {
      document.getElementById('discovery-status').textContent = 'Discovery unavailable';
    });
  </script>
</body>
</html>
```

- [ ] **Step 4: Smoke-test the full dialog**

```powershell
npm start
```

Clear IP via DevTools console: `localStorage.removeItem('tvip'); location.reload()`

Expected sequence:
1. Gear button pulses amber
2. IP config dialog opens (taller — 280px)
3. "Searching for TVs…" appears while discovery runs (~4s)
4. After 4s: either a list of discovered Samsung TVs or "No TVs found"
5. If TVs listed: click one → IP field fills with that TV's IP
6. Save → gear stops pulsing, app connects (or attempts to)
7. Cancel → gear stays pulsing, dialog closes, app stays disconnected

- [ ] **Step 5: Verify existing unit tests still pass**

```powershell
npm test
```

Expected: 9 tests pass, 0 failures.

- [ ] **Step 6: Commit**

```powershell
git add dialog-preload.js ip-dialog.html main.js
git commit -m "feat: add TV discovery UI to IP config dialog, show discovered Samsung TVs"
```

---

## Task 4: Rebuild installer and portable packages

**Files:**
- No source changes — this task runs `npm run dist` and installs the result

**Interfaces:**
- Consumes: all source changes from Tasks 1–3
- Produces: `dist/TV Remote Setup 1.0.0.exe` (NSIS installer), `dist/TV Remote 1.0.0.exe` (portable)

- [ ] **Step 1: Run the full dist build**

```powershell
npm run dist
```

Expected: completes without errors. May take 1–3 minutes.

- [ ] **Step 2: Verify both artifacts exist**

```powershell
Get-ChildItem dist | Where-Object { $_.Name -like "*.exe" } | Select-Object Name, Length
```

Expected: two `.exe` files each around 60–80 MB.

- [ ] **Step 3: Install and smoke-test**

Run `dist\TV Remote Setup 1.0.0.exe` (double-click in Explorer). Expected:
- Installs silently, no UAC prompt
- Launches from Start Menu shortcut or desktop shortcut
- On first run: gear pulses amber, IP config dialog opens with "Searching for TVs…"
- Dialog shows discovered TVs after ~4s (or "No TVs found" on a network with no Samsung TVs)

- [ ] **Step 4: Commit milestone**

```powershell
git status
git commit --allow-empty -m "chore: rebuild installer with first-run discovery feature"
```
