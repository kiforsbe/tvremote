# Design: First-Run IP Config & Samsung TV Discovery

**Date:** 2026-06-20  
**Status:** Approved

## Overview

Remove the hardcoded default IP (`192.168.50.122`) from the TV remote app. On first run (no IP stored in `localStorage`), automatically open the IP configuration dialog. The dialog runs SSDP discovery to find Samsung TVs on the local network and presents them as selectable options above the manual IP input. If the user cancels without saving, the app stays disconnected and the gear (⚙) button pulses amber until an IP is configured.

---

## Architecture

Five files change; no new npm dependencies. Node's built-in `dgram` module handles UDP; `http` is already imported in `main.js`.

| File | Change |
|---|---|
| `app/remote.js` | Remove default IP fallback; guard `connect()`; auto-open dialog on first run; manage gear button highlight |
| `app/index.html` | Add `needs-config` CSS class + pulse animation for gear button |
| `main.js` | Add `discover-tvs` IPC handler (SSDP via `dgram` + HTTP XML fetch) |
| `dialog-preload.js` | Expose `discoverTvs()` to the dialog renderer |
| `ip-dialog.html` | Add discovery section; grow dialog from 180px to 280px height |

---

## Components

### 1. Remove default IP — `app/remote.js`

`getIp()` currently returns `localStorage.getItem('tvip') || '192.168.50.122'`. Remove the fallback so it returns `null` when nothing is stored.

`connect()` gets an early-return guard: if `!getIp()` return immediately (no WebSocket attempt with a null IP).

### 2. First-run auto-open + gear highlight — `app/remote.js` + `app/index.html`

In `DOMContentLoaded`:
- If `getIp()` is falsy: add `needs-config` class to `#btn-settings`, then call `openSettings()`.
- If `getIp()` is set: call `connect()` as before.

A helper `setNeedsConfig(bool)` toggles the `needs-config` class on `#btn-settings`. It is called with `false` wherever an IP is successfully saved:
- Electron path: inside the `.then(ip => { if (ip) { ... } })` block in `openSettings()`
- Browser path: inside `applyIp()`, after `localStorage.setItem('tvip', ip)`

`app/index.html` adds:

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

### 3. SSDP discovery — `main.js`

New IPC handler: `ipcMain.handle('discover-tvs', discoverTvs)`.

`discoverTvs()` returns `Promise<Array<{name: string, ip: string}>>`:

1. Creates a UDP4 socket via `dgram.createSocket('udp4')`.
2. On bind, sends an M-SEARCH multicast to `239.255.255.250:1900`:
   ```
   M-SEARCH * HTTP/1.1
   HOST: 239.255.255.250:1900
   MAN: "ssdp:discover"
   MX: 3
   ST: urn:samsung.com:device:RemoteControlReceiver:1
   ```
3. On each incoming message, extracts `rinfo.address` (the TV's IP) and the `LOCATION:` header URL. Deduplicates by IP.
4. For each unique IP, makes an HTTP GET to the LOCATION URL with a 2-second timeout and parses `<friendlyName>…</friendlyName>` from the XML response. Falls back to the raw IP string if the fetch fails or times out.
5. After 4 seconds, closes the socket and resolves with the collected `[{name, ip}]` array (may be empty).

`fetchDeviceName(location: string): Promise<string|null>` is a private helper that does the HTTP GET + XML parse. Uses Node's built-in `http` module (already imported).

### 4. Dialog preload — `dialog-preload.js`

Add one entry to the `contextBridge.exposeInMainWorld('dialogAPI', {...})` call:

```js
discoverTvs: () => ipcRenderer.invoke('discover-tvs'),
```

### 5. Updated IP dialog — `ip-dialog.html`

Dialog window height grows from 180px to 280px (set in `main.js` where the dialog `BrowserWindow` is created).

Layout (top to bottom):
1. **Title:** "TV Remote Settings" (unchanged)
2. **Discovery section:** starts as "Searching for TVs…" (italic, dimmed). After `discoverTvs()` resolves: a list of clickable TV rows (one per found TV, showing friendly name + IP), or "No TVs found" if empty. Clicking a row fills the IP input field and focuses it — does not auto-save.
3. **Manual IP field:** label + input (unchanged). Pre-filled from `?ip=` query param as before (will be empty on first run).
4. **Action buttons:** Cancel + Save (unchanged behaviour).

The dialog calls `window.dialogAPI.discoverTvs()` immediately on `DOMContentLoaded` and renders results when the promise resolves.

---

## Data Flow

```
DOMContentLoaded
  └─ getIp() == null?
       ├─ yes → setNeedsConfig(true) → openSettings()
       │           └─ electronAPI.openIpDialog(null)
       │                 └─ main: open BrowserWindow(280px)
       │                       └─ dialog: discoverTvs() [IPC → main → SSDP]
       │                             └─ returns [{name,ip}] after 4s
       │                 └─ user picks TV or types IP → Save
       │                 └─ resolve(ip) → localStorage.setItem → setNeedsConfig(false) → connect()
       └─ no  → connect()
```

---

## Error Handling

- SSDP socket errors: catch and resolve with empty array (discovery failure is non-fatal).
- `fetchDeviceName` timeout/error: fall back to raw IP string — TV still appears in list.
- User cancels first-run dialog: `resolve(null)` → no IP saved → `needs-config` stays active.
- `connect()` called with no IP: returns immediately — no broken WebSocket attempt.

---

## Out of Scope

- mDNS / Bonjour discovery
- Auto-saving when a discovered TV is clicked (click fills the field; Save is explicit)
- Re-running discovery after the dialog is open (single discovery run per dialog open)
- Browser / PWA path for discovery (SSDP requires Node; iPhone users still get the inline `ip-row` without discovery)
