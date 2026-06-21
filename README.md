# TV Remote

A Samsung smart TV remote control for Windows and iPhone, built with Electron and served as a PWA.

- **Windows app** — frameless, transparent overlay; sits in the corner of your screen. Draggable, always on top optional.
- **iPhone / browser** — the same UI served over HTTP from the desktop app; add it to your home screen as a PWA.

## Features

- WebSocket remote control (Samsung Tizen API, port 8002)
- Auto-discovery of Samsung TVs on the local network via SSDP (`ssdp:all`, SERVER-header filtered)
- App launcher with 4 320 apps across 18 regions, region auto-detection from the TV
- Pinned apps row + slide-out drawer with drag-to-reorder
- YouTube deep-link: shift-click the YouTube button to play a specific video by URL or ID
- Numpad panel (toggleable)
- Media-key shortcuts (play/pause, volume, mute) registered as global shortcuts
- Volume, channel, navigation, colour buttons, source, guide, captions, info, exit

## Requirements

- Windows 10/11 x64
- A Samsung Tizen TV (2016+) on the same local network
- The TV must have **Network → Expert Settings → IP Remote** (or similar) enabled
- First connection: accept the pairing prompt on the TV

## Installation

Download the latest release from the [Releases](../../releases) page:

| File | What it is |
|---|---|
| `TV Remote Setup x.x.x.exe` | NSIS installer — installs per-user, creates Start Menu + desktop shortcuts |
| `TV Remote x.x.x.exe` | Portable — runs directly, no install needed |

### First-run certificate setup

The TV uses a self-signed HTTPS certificate. The app bypasses certificate verification
automatically, but the underlying Electron session needs to trust the TV at least once.
If the status dot stays red after setting the IP:

1. Right-click the remote → **Accept TV Certificate**
2. A browser tab opens to `https://<tv-ip>:8002` — click through the cert warning
3. Close the tab; reconnect (right-click → **Reconnect**)

## iPhone / browser use

While the desktop app is running, open `http://<your-pc-ip>:3000` on any device on the
same network. On iPhone, use Safari → Share → **Add to Home Screen** for a full-screen PWA.

## Building from source

```bash
git clone https://github.com/kiforsbe/tvremote.git
cd tvremote
npm install
npm start          # run in development
npm run dist       # build installer + portable into dist/
```

### Tests

```bash
npm test               # unit tests (Jest)
npm run test:blackbox  # blackbox server tests
npm run test:e2e       # Playwright e2e (requires npm start in another terminal)
```

### Icon generation

Icons are generated from `build/source.png` via Jimp:

```bash
npm run icons
```

## How it works

### TV connection

Samsung Tizen TVs expose a WebSocket endpoint at `wss://<ip>:8002/api/v2/channels/samsung.remote.control`.
The app connects, authenticates (the TV shows a pairing prompt the first time), stores the token, and sends
JSON-encoded remote-key commands.

### TV discovery

On opening settings, the app sends an SSDP `M-SEARCH * HTTP/1.1` with `ST: ssdp:all` and listens for
responses whose `SERVER` header contains `Samsung`. Discovered IPs are resolved to friendly names by
fetching the UPnP device description from the `LOCATION` URL.

### App launcher

App IDs and regional availability are sourced from `samsung-apps-db.json` (verified against the Samsung
Store API). The app manager lets you search, add, remove, and reorder apps; it also probes the TV directly
(`POST /api/v2/applications/<id>`) to confirm which apps are actually installed.

## Project layout

```
main.js                   Electron main process: window, IPC, discovery, TV API
preload.js                Context bridge for main window
dialog-preload.js         Context bridge for IP-settings dialog
app-manager-preload.js    Context bridge for app manager dialog
ip-dialog.html            TV IP / discovery dialog
app/
  index.html              Remote UI (also served as PWA)
  remote.js               Remote UI logic
  app-manager.html        App manager dialog
  catalog.js              App catalog data loader
samsung-apps-db.json      App database (4 320 apps, 18 regions)
scripts/
  generate-icons.js       Icon generation from source PNG
  test-discovery.js       SSDP discovery probe (development utility)
tests/
  unit/                   Jest unit tests
  blackbox/               Blackbox HTTP server tests
  e2e/                    Playwright layout tests
```

## License

MIT — see [LICENSE](LICENSE).
