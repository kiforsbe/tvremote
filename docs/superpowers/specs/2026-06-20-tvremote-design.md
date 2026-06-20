# Samsung TV Remote — Design Spec
**Date:** 2026-06-20

## Overview

A Samsung TV remote control app built from a single HTML/JS codebase, running natively on Windows 11 via Electron and installable as a PWA on iPhone (iOS 26+). Both platforms connect directly to the TV's WebSocket API over the local network.

---

## Project Structure

```
tvremote/
├── package.json          ← Electron dependencies + npm start script
├── main.js               ← Electron main process
├── app/
│   ├── index.html        ← Remote UI (refactored from samsung_remote.html)
│   ├── manifest.json     ← PWA manifest for iPhone Add to Home Screen
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
└── .gitignore
```

---

## Architecture

### Shared HTML/JS layer (`app/index.html`)

The existing remote UI is the single source of truth for both platforms. It:
- Renders the remote control layout
- Opens a WebSocket connection to the TV at `wss://<ip>:8002/api/v2/channels/samsung.remote.control`
- Handles all button clicks and keyboard events (when focused)

### Electron main process (`main.js`)

Runs on Windows 11. Responsible for:

1. **BrowserWindow** — loads `app/index.html`. Certificate errors are suppressed via `app.on('certificate-error')` so the TV's self-signed WSS cert is accepted automatically.

2. **Global shortcuts** — registered with `globalShortcut` so they fire even when the Electron window is in the background or unfocused. Media keys are used to avoid conflicts with other apps:
   - `MediaPlayPause` → `KEY_PLAY`
   - `VolumeUp` → `KEY_VOLUP`
   - `VolumeDown` → `KEY_VOLDOWN`
   - `VolumeMute` → `KEY_MUTE`

   Standard keyboard shortcuts (arrow keys, `h`, `b`, etc.) remain in the HTML and work when the window is focused.

3. **Local HTTP server** — Node's built-in `http` module serves the `app/` directory on port 3000. The iPhone accesses `http://<windows-ip>:3000` in Safari to install the PWA.

### PWA layer (iPhone iOS 26+)

Additions to `app/index.html`:
- `viewport-fit=cover` for full-bleed layout on notched iPhones
- `apple-mobile-web-app-capable` — standalone mode when launched from Home Screen
- `apple-mobile-web-app-status-bar-style: black-translucent`
- Safe area insets (`env(safe-area-inset-*)`) applied to remote body padding
- Button touch targets bumped to minimum 44×44pt per iOS HIG

`manifest.json` declares:
- `name`, `short_name`
- `icons` (192px and 512px)
- `display: standalone`
- `background_color: #0c0c0c`

No service worker — the app is useless offline (requires live TV connection), so caching adds no value.

---

## iOS Certificate Workaround

Samsung TVs serve their WebSocket API over WSS with a self-signed certificate. iPhone Safari rejects this by default. The fix is a one-time manual step:

1. Open `https://<tv-ip>:8002` in Safari
2. Accept the untrusted certificate prompt
3. Return to the remote — WSS connections will now succeed

This step will be called out in the UI via a help note near the Connect button.

---

## Git Setup

- Initialize repo at `c:\Users\kim_f\source\repos\tvremote`
- `.gitignore` excludes `node_modules/`, `dist/`, `out/`
- First commit includes all source files
- No CI, no build pipeline — `npm start` runs Electron from source

---

## What's Out of Scope

- Offline mode / service worker caching
- Auto-discovery of TV IP (user enters it manually, as today)
- Android support
- Packaging/distribution (no `.exe` installer, no App Store)
- System tray icon (can be added later)
- Always-on-top toggle (can be added later)
