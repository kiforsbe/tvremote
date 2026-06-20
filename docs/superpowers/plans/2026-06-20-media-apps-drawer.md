# Media Apps Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a left-sliding media-apps drawer, a pinned 3-app row in the remote body, YouTube deep-linking via shift+click, and a management dialog for the full app catalog.

**Architecture:** `WIN_W` widens from 260 → 400px with the remote right-aligned (40px right padding); the ~148px left of the drawer tab is transparent and click-through via `setIgnoreMouseEvents`. A `.remote-container` flex row holds `.drawer-panel` (width 0→140px), `.drawer-tab` (12px strip), and `.remote` (unchanged 180px) so the remote's left edge never shifts. All app state lives in `localStorage.mediaApps`.

**Tech Stack:** Electron 31, vanilla JS, Jest/jsdom for unit tests, existing `BrowserWindow` modal pattern for management dialog.

## Global Constraints

- No new npm dependencies
- All new JS follows existing no-`class`, no-`import` style (plain `function` and `const`)
- `remote.js` exports via `if (typeof module !== 'undefined' && module.exports)` at the bottom
- New dialog HTML matches the visual style of `ip-dialog.html` exactly
- `app-manager-preload.js` lives at project root (next to `dialog-preload.js`)
- Samsung app IDs are strings, not numbers
- Unit test files begin with `/** @jest-environment jsdom */`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/remote.js` | Modify | Catalog constant, pure helpers, drawer state, render functions, YouTube parser |
| `app/index.html` | Modify | `.remote-container` wrapper, `.drawer-tab`, `.drawer-panel`, pinned-apps row, updated CSS |
| `main.js` | Modify | `WIN_W=400`, initial x from screen centre, `set-ignore-mouse-events` IPC, `open-app-manager` IPC |
| `preload.js` | Modify | Expose `setIgnoreMouseEvents` and `openAppManager` |
| `app-manager-preload.js` | Create | Expose save/cancel to management dialog renderer |
| `app/app-manager.html` | Create | Management dialog: toggle, reorder, add custom app |
| `package.json` | Modify | Add `app-manager-preload.js` to electron-builder `files` |
| `tests/unit/media-apps.test.js` | Create | Unit tests for pure helper functions |

---

### Task 1: Pure helper functions + unit tests

**Files:**
- Modify: `app/remote.js`
- Create: `tests/unit/media-apps.test.js`

**Interfaces — Produces:**
- `MEDIA_APPS_CATALOG` — `Array<{id,name,icon,appId,deepLink}>`
- `loadMediaApps()` → `Array<MediaApp>`
- `saveMediaApps(apps)` → `void`
- `buildAppLaunchCommand(appId, metaTag|null)` → `string` (JSON)
- `parseYouTubeVideoId(input)` → `string|null`
- `reorderApp(apps, id, dir:'up'|'down')` → new `Array<MediaApp>`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/media-apps.test.js`:

```js
/** @jest-environment jsdom */

const {
  MEDIA_APPS_CATALOG,
  loadMediaApps,
  saveMediaApps,
  buildAppLaunchCommand,
  parseYouTubeVideoId,
  reorderApp,
} = require('../../app/remote.js');

describe('MEDIA_APPS_CATALOG', () => {
  test('contains at least 14 apps', () => {
    expect(MEDIA_APPS_CATALOG.length).toBeGreaterThanOrEqual(14);
  });

  test('youtube entry has deepLink true and correct appId', () => {
    const yt = MEDIA_APPS_CATALOG.find(a => a.id === 'youtube');
    expect(yt).toBeDefined();
    expect(yt.deepLink).toBe(true);
    expect(yt.appId).toBe('111299001912');
  });

  test('every entry has required string/boolean fields', () => {
    for (const app of MEDIA_APPS_CATALOG) {
      expect(typeof app.id).toBe('string');
      expect(typeof app.name).toBe('string');
      expect(typeof app.icon).toBe('string');
      expect(typeof app.appId).toBe('string');
      expect(typeof app.deepLink).toBe('boolean');
    }
  });
});

describe('loadMediaApps', () => {
  beforeEach(() => localStorage.clear());

  test('returns first 3 catalog items when localStorage is empty', () => {
    const apps = loadMediaApps();
    expect(apps).toHaveLength(3);
    expect(apps[0].id).toBe('youtube');
    expect(apps[1].id).toBe('netflix');
    expect(apps[2].id).toBe('prime');
  });

  test('returns saved apps when localStorage has data', () => {
    const saved = [MEDIA_APPS_CATALOG[0]];
    localStorage.setItem('mediaApps', JSON.stringify(saved));
    expect(loadMediaApps()).toEqual(saved);
  });

  test('falls back to defaults on invalid JSON', () => {
    localStorage.setItem('mediaApps', 'not-json{{{');
    expect(loadMediaApps()).toHaveLength(3);
  });
});

describe('saveMediaApps', () => {
  beforeEach(() => localStorage.clear());

  test('persists apps to localStorage as JSON', () => {
    const apps = [MEDIA_APPS_CATALOG[0]];
    saveMediaApps(apps);
    expect(JSON.parse(localStorage.getItem('mediaApps'))).toEqual(apps);
  });
});

describe('buildAppLaunchCommand', () => {
  test('produces ms.application.start with correct id', () => {
    const result = JSON.parse(buildAppLaunchCommand('111299001912', null));
    expect(result.method).toBe('ms.application.start');
    expect(result.params.id).toBe('111299001912');
    expect(result.params.metaTag).toBeUndefined();
  });

  test('includes metaTag when provided', () => {
    const result = JSON.parse(buildAppLaunchCommand('111299001912', 'dQw4w9WgXcQ'));
    expect(result.params.metaTag).toBe('dQw4w9WgXcQ');
  });

  test('omits metaTag when null', () => {
    const result = JSON.parse(buildAppLaunchCommand('11101200001', null));
    expect('metaTag' in result.params).toBe(false);
  });
});

describe('parseYouTubeVideoId', () => {
  test('parses watch URL', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('parses short URL', () => {
    expect(parseYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('parses shorts URL', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('accepts raw 11-char video ID', () => {
    expect(parseYouTubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('returns null for non-YouTube URL', () => {
    expect(parseYouTubeVideoId('https://vimeo.com/123')).toBeNull();
  });

  test('returns null for short string that is not 11 chars', () => {
    expect(parseYouTubeVideoId('abc')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(parseYouTubeVideoId('')).toBeNull();
  });
});

describe('reorderApp', () => {
  const apps = [
    { id: 'a', name: 'A', icon: '', appId: '1', deepLink: false },
    { id: 'b', name: 'B', icon: '', appId: '2', deepLink: false },
    { id: 'c', name: 'C', icon: '', appId: '3', deepLink: false },
  ];

  test('moves item up', () => {
    expect(reorderApp(apps, 'b', 'up').map(a => a.id)).toEqual(['b', 'a', 'c']);
  });

  test('moves item down', () => {
    expect(reorderApp(apps, 'b', 'down').map(a => a.id)).toEqual(['a', 'c', 'b']);
  });

  test('no-ops when moving first item up', () => {
    expect(reorderApp(apps, 'a', 'up').map(a => a.id)).toEqual(['a', 'b', 'c']);
  });

  test('no-ops when moving last item down', () => {
    expect(reorderApp(apps, 'c', 'down').map(a => a.id)).toEqual(['a', 'b', 'c']);
  });

  test('returns new array (does not mutate original)', () => {
    const result = reorderApp(apps, 'b', 'up');
    expect(result).not.toBe(apps);
    expect(apps[0].id).toBe('a');
  });

  test('returns copy unchanged for unknown id', () => {
    expect(reorderApp(apps, 'z', 'up').map(a => a.id)).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
npm test -- tests/unit/media-apps.test.js
```
Expected: FAIL — `MEDIA_APPS_CATALOG is not defined`

- [ ] **Step 3: Add functions to `app/remote.js`**

Insert after the `KEY_MAP` constant and before `buildKeyCommand`:

```js
const MEDIA_APPS_CATALOG = [
  { id: 'youtube',     name: 'YouTube',     icon: '▶',  appId: '111299001912', deepLink: true  },
  { id: 'netflix',     name: 'Netflix',     icon: 'N',  appId: '11101200001',  deepLink: false },
  { id: 'prime',       name: 'Prime',       icon: '📦', appId: '3201910019365',deepLink: false },
  { id: 'disney',      name: 'Disney+',     icon: '🏰', appId: '3201901017640',deepLink: false },
  { id: 'spotify',     name: 'Spotify',     icon: '🎵', appId: '3201606009684',deepLink: false },
  { id: 'max',         name: 'Max',         icon: 'M',  appId: '3201601007230',deepLink: false },
  { id: 'appletv',     name: 'Apple TV+',   icon: '',  appId: '3201807016597',deepLink: false },
  { id: 'applemusic',  name: 'Apple Music', icon: '🎶', appId: '3201908019066',deepLink: false },
  { id: 'hulu',        name: 'Hulu',        icon: '🟢', appId: '3201601007625',deepLink: false },
  { id: 'paramount',   name: 'Paramount+',  icon: '⛰', appId: '3201711015986',deepLink: false },
  { id: 'peacock',     name: 'Peacock',     icon: '🦚', appId: '3202005022341',deepLink: false },
  { id: 'tubi',        name: 'Tubi',        icon: '📺', appId: '3201504901843',deepLink: false },
  { id: 'pluto',       name: 'Pluto TV',    icon: '🪐', appId: '3202008022518',deepLink: false },
  { id: 'crunchyroll', name: 'Crunchyroll', icon: '🍥', appId: '3201611010411',deepLink: false },
];

function loadMediaApps() {
  try {
    const raw = localStorage.getItem('mediaApps');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return MEDIA_APPS_CATALOG.slice(0, 3);
}

function saveMediaApps(apps) {
  localStorage.setItem('mediaApps', JSON.stringify(apps));
}

function buildAppLaunchCommand(appId, metaTag) {
  const params = { id: appId };
  if (metaTag) params.metaTag = metaTag;
  return JSON.stringify({ method: 'ms.application.start', params });
}

function parseYouTubeVideoId(input) {
  if (!input) return null;
  input = input.trim();
  try {
    const url = new URL(input);
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1).split('?')[0];
      return id.length === 11 ? id : null;
    }
    if (url.hostname.endsWith('youtube.com')) {
      if (url.pathname.startsWith('/shorts/')) {
        const id = url.pathname.split('/')[2];
        return id && id.length === 11 ? id : null;
      }
      const v = url.searchParams.get('v');
      return v && v.length === 11 ? v : null;
    }
  } catch (_) {}
  return input.length === 11 ? input : null;
}

function reorderApp(apps, id, dir) {
  const idx = apps.findIndex(a => a.id === id);
  if (idx === -1) return apps.slice();
  if (dir === 'up'   && idx === 0)               return apps.slice();
  if (dir === 'down' && idx === apps.length - 1) return apps.slice();
  const next = apps.slice();
  const swap = dir === 'up' ? idx - 1 : idx + 1;
  [next[idx], next[swap]] = [next[swap], next[idx]];
  return next;
}
```

Add `launchApp` after the existing `sendKey` function:

```js
function launchApp(appId, metaTag) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(buildAppLaunchCommand(appId, metaTag || null));
}
```

Replace the `module.exports` at the bottom:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    KEY_MAP,
    buildKeyCommand,
    MEDIA_APPS_CATALOG,
    loadMediaApps,
    saveMediaApps,
    buildAppLaunchCommand,
    parseYouTubeVideoId,
    reorderApp,
  };
}
```

- [ ] **Step 4: Run — expect pass**

```
npm test -- tests/unit/media-apps.test.js
```
Expected: all tests PASS

- [ ] **Step 5: Run existing unit tests — expect no regressions**

```
npm test
```
Expected: all tests PASS

- [ ] **Step 6: Commit**

```
git add app/remote.js tests/unit/media-apps.test.js
git commit -m "feat: add media app catalog, launch command, YouTube parser, reorder helper"
```

---

### Task 2: Window width, initial position, click-through IPC

**Files:**
- Modify: `main.js`
- Modify: `preload.js`

**Interfaces — Produces:**
- `WIN_W = 400`
- IPC channel `set-ignore-mouse-events` (renderer → main, arg: `boolean`)
- IPC channel `open-app-manager` (renderer → main, stub returning null — fulfilled in Task 6)
- `window.electronAPI.setIgnoreMouseEvents(ignore: boolean)` in renderer
- `window.electronAPI.openAppManager(appsJson: string)` → `Promise<string|null>` in renderer

- [ ] **Step 1: Update `main.js`**

Change the destructured imports at line 1:

```js
const { app, BrowserWindow, globalShortcut, Menu, ipcMain, session, screen } = require('electron');
```

Change the window size constants (lines 9–11):

```js
const WIN_W          = 400;
const WIN_H          = 680;
const WIN_H_NUMPAD   = 760;
```

Add these two IPC handlers before `app.whenReady()`:

```js
ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (w) w.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.handle('open-app-manager', (_event, _appsJson) => {
  // stub — replaced in Task 6
  return null;
});
```

Inside `app.whenReady()`, replace the `const win = new BrowserWindow({...})` block with:

```js
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
```

- [ ] **Step 2: Update `preload.js`**

Replace the entire file:

```js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  openIpDialog:         (ip)       => ipcRenderer.invoke('open-ip-dialog', ip),
  setNumpad:            (open)     => ipcRenderer.invoke('set-numpad', open),
  setIgnoreMouseEvents: (ignore)   => ipcRenderer.send('set-ignore-mouse-events', ignore),
  openAppManager:       (appsJson) => ipcRenderer.invoke('open-app-manager', appsJson),
});
```

- [ ] **Step 3: Start app — visual smoke test**

```
npm start
```
Expected: app opens, remote appears at roughly the same screen position as before. Window is wider but the extra left area is fully transparent (clicks on it hit the desktop).

- [ ] **Step 4: Commit**

```
git add main.js preload.js
git commit -m "feat: widen window to 400px for drawer, add click-through IPC"
```

---

### Task 3: HTML/CSS — remote-container, drawer tab, drawer panel, pinned-apps row

**Files:**
- Modify: `app/index.html`

**Interfaces — Produces:**
- CSS classes: `.remote-container`, `.drawer-panel`, `.drawer-tab`, `.drawer-open`, `.pinned-apps`, `.pinned-app-btn`, `.drawer-app-row`, `.drawer-app-btn`, `.drawer-order-btn`, `.drawer-manage-btn`, `.drawer-empty`, `.yt-input-row`, `.yt-input`, `.yt-confirm-btn`, `.yt-input-err`
- DOM ids: `drawer-panel`, `drawer-tab`, `drawer-apps`, `drawer-manage-btn`, `pinned-apps`

- [ ] **Step 1: Add new CSS rules to the `<style>` block in `app/index.html`**

Add the following at the end of the `<style>` block, before `</style>`:

```css
/* ── Layout wrapper ────────────────────────── */
body {
  align-items: flex-end;
  padding-right: max(40px, env(safe-area-inset-right));
  -webkit-app-region: no-drag;
  gap: 0;
}

.remote-container {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  position: relative;
}

.remote {
  -webkit-app-region: drag;
}

/* ── Drawer tab ─────────────────────────────── */
.drawer-tab {
  width: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #252525;
  border-radius: 8px 0 0 8px;
  color: var(--text-dim);
  font-size: 9px;
  cursor: pointer;
  align-self: center;
  height: 56px;
  flex-shrink: 0;
  transition: color 0.15s, background 0.15s;
  -webkit-app-region: no-drag;
  user-select: none;
}

.drawer-tab:hover {
  background: #2e2e2e;
  color: var(--text);
}

/* ── Drawer panel ───────────────────────────── */
.drawer-panel {
  width: 0;
  overflow: hidden;
  transition: width 0.22s ease;
  background: #141414;
  border-radius: 14px 0 0 14px;
  display: flex;
  flex-direction: column;
  align-self: stretch;
  margin-top: 28px;
  margin-bottom: 28px;
  box-shadow: -4px 0 20px rgba(0,0,0,0.5);
  -webkit-app-region: no-drag;
}

.remote-container.drawer-open .drawer-panel {
  width: 140px;
}

.drawer-apps {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.drawer-app-row {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
}

.drawer-app-btn {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 6px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
  -webkit-tap-highlight-color: transparent;
  min-width: 0;
  overflow: hidden;
}

.drawer-app-btn:hover  { background: var(--btn-hover); }
.drawer-app-btn:active { background: var(--btn-active); }

.app-icon { font-size: 14px; flex-shrink: 0; width: 18px; text-align: center; }
.app-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px; }

.drawer-order-btn {
  width: 18px;
  height: 22px;
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 10px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  flex-shrink: 0;
  transition: color 0.1s, background 0.1s;
}
.drawer-order-btn:hover:not(:disabled)  { color: var(--text); background: var(--btn-hover); }
.drawer-order-btn:disabled { opacity: 0.2; cursor: default; }

.drawer-manage-btn {
  width: 100%;
  padding: 8px 0;
  background: transparent;
  border: none;
  border-top: 1px solid rgba(255,255,255,0.06);
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
  transition: color 0.12s, background 0.12s;
  flex-shrink: 0;
}
.drawer-manage-btn:hover { color: var(--text); background: rgba(255,255,255,0.04); }

.drawer-empty {
  font-size: 11px;
  color: var(--text-dim);
  text-align: center;
  padding: 16px 8px;
}

/* ── Pinned apps row ────────────────────────── */
.pinned-apps {
  display: flex;
  gap: 6px;
  justify-content: center;
}

.pinned-app-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  font-size: 16px;
}

/* ── YouTube inline input ───────────────────── */
.yt-input-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 6px;
  width: 100%;
}

.yt-input {
  flex: 1;
  min-width: 0;
  background: var(--btn);
  border: 1px solid #2a2a2a;
  color: var(--text);
  padding: 5px 7px;
  border-radius: 6px;
  font-size: 10px;
  outline: none;
  width: 100%;
}
.yt-input:focus { border-color: #555; }

.yt-input-actions {
  display: flex;
  gap: 4px;
}

.yt-confirm-btn {
  width: 28px;
  height: 24px;
  border-radius: 6px;
  font-size: 10px;
  flex-shrink: 0;
}

.yt-input-err {
  font-size: 9px;
  color: #e74c3c;
}
```

- [ ] **Step 2: Restructure the `<body>` HTML**

Replace `<body>` through the closing `</div>` of `.remote` with the following. The content inside `.remote` is **unchanged** except for the new `<div id="pinned-apps">` row inserted between the color-dot row and the numpad:

```html
<body>

  <div class="remote-container" id="remote-container">

    <div class="drawer-panel" id="drawer-panel">
      <div class="drawer-apps" id="drawer-apps"></div>
      <button class="drawer-manage-btn" id="drawer-manage-btn">⚙ Manage</button>
    </div>

    <div class="drawer-tab" id="drawer-tab">‹</div>

    <div class="remote">

      <div class="power-row">
        <div class="status-dot" id="status-dot"></div>
        <button class="btn-settings" id="btn-settings" onclick="openSettings()" title="Set TV IP">⚙</button>
        <button class="btn-src" data-key="KEY_SOURCE" onclick="sendKey('KEY_SOURCE')" title="Source/Input">SRC</button>
        <button class="btn btn-power" data-key="KEY_POWER" onclick="sendKey('KEY_POWER')">⏻</button>
      </div>

      <div class="ip-row" id="ip-row" hidden>
        <input id="tvip" type="text" inputmode="decimal" placeholder="192.168.x.x">
        <button class="btn btn-apply" onclick="applyIp()">▶</button>
      </div>

      <div class="row">
        <button class="btn btn-sm" data-key="KEY_GUIDE" onclick="sendKey('KEY_GUIDE')">GUIDE</button>
        <button class="btn btn-sm" data-key="KEY_123"   onclick="toggleNumpad()">123</button>
      </div>

      <div class="row">
        <button class="btn btn-color btn-red"    data-key="KEY_RED"    onclick="sendKey('KEY_RED')"></button>
        <button class="btn btn-color btn-green"  data-key="KEY_GREEN"  onclick="sendKey('KEY_GREEN')"></button>
        <button class="btn btn-color btn-yellow" data-key="KEY_YELLOW" onclick="sendKey('KEY_YELLOW')"></button>
        <button class="btn btn-color btn-blue"   data-key="KEY_BLUE"   onclick="sendKey('KEY_BLUE')"></button>
      </div>

      <div class="numpad" id="numpad" hidden>
        <div class="numpad-row">
          <button class="btn-digit" data-key="KEY_1" onclick="sendKey('KEY_1')">1</button>
          <button class="btn-digit" data-key="KEY_2" onclick="sendKey('KEY_2')">2</button>
          <button class="btn-digit" data-key="KEY_3" onclick="sendKey('KEY_3')">3</button>
          <button class="btn-digit" data-key="KEY_4" onclick="sendKey('KEY_4')">4</button>
          <button class="btn-digit" data-key="KEY_5" onclick="sendKey('KEY_5')">5</button>
        </div>
        <div class="numpad-row">
          <button class="btn-digit" data-key="KEY_6" onclick="sendKey('KEY_6')">6</button>
          <button class="btn-digit" data-key="KEY_7" onclick="sendKey('KEY_7')">7</button>
          <button class="btn-digit" data-key="KEY_8" onclick="sendKey('KEY_8')">8</button>
          <button class="btn-digit" data-key="KEY_9" onclick="sendKey('KEY_9')">9</button>
          <button class="btn-digit" data-key="KEY_0" onclick="sendKey('KEY_0')">0</button>
        </div>
      </div>

      <div class="pinned-apps" id="pinned-apps"></div>

      <div class="nav-ring">
        <div class="nav-track"></div>
        <button class="nav-dir nav-up"    data-key="KEY_UP"    onclick="sendKey('KEY_UP')">△</button>
        <button class="nav-dir nav-down"  data-key="KEY_DOWN"  onclick="sendKey('KEY_DOWN')">▽</button>
        <button class="nav-dir nav-left"  data-key="KEY_LEFT"  onclick="sendKey('KEY_LEFT')">◁</button>
        <button class="nav-dir nav-right" data-key="KEY_RIGHT" onclick="sendKey('KEY_RIGHT')">▷</button>
        <button class="nav-ok"            data-key="KEY_ENTER" onclick="sendKey('KEY_ENTER')">OK</button>
      </div>

      <div class="icon-row">
        <button class="btn btn-icon" data-key="KEY_RETURN" title="Back"       onclick="sendKey('KEY_RETURN')" style="font-size:18px">↩</button>
        <button class="btn btn-icon" data-key="KEY_HOME"   title="Home"       onclick="sendKey('KEY_HOME')"   style="font-size:18px">⌂</button>
        <button class="btn btn-icon" data-key="KEY_PLAY"   title="Play/Pause" onclick="sendKey('KEY_PLAY')"   style="font-size:18px">⏵</button>
      </div>

      <div class="icon-row">
        <button class="btn btn-icon" data-key="KEY_REWIND" title="Rewind"       onclick="sendKey('KEY_REWIND')">⏪</button>
        <button class="btn btn-icon" data-key="KEY_STOP"   title="Stop"         onclick="sendKey('KEY_STOP')">⏹</button>
        <button class="btn btn-icon" data-key="KEY_FF"     title="Fast Forward" onclick="sendKey('KEY_FF')">⏩</button>
      </div>

      <div class="icon-row">
        <button class="btn btn-icon" data-key="KEY_EXIT"    title="Exit"     onclick="sendKey('KEY_EXIT')"    style="font-size:11px;font-weight:700;letter-spacing:.5px">EXIT</button>
        <button class="btn btn-icon" data-key="KEY_INFO"    title="Info"     onclick="sendKey('KEY_INFO')"    style="font-size:18px">ⓘ</button>
        <button class="btn btn-icon" data-key="KEY_CAPTION" title="Captions" onclick="sendKey('KEY_CAPTION')" style="font-size:12px;font-weight:700">CC</button>
      </div>

      <div class="rockers">
        <div class="rocker">
          <span class="rocker-label">VOL</span>
          <button class="btn btn-rocker" data-key="KEY_VOLUP"   onclick="sendKey('KEY_VOLUP')">+</button>
          <button class="btn btn-rocker" data-key="KEY_VOLDOWN" onclick="sendKey('KEY_VOLDOWN')">−</button>
        </div>
        <div class="rocker rocker-mute">
          <span class="rocker-label">MUTE</span>
          <button class="btn btn-icon" data-key="KEY_MUTE" onclick="sendKey('KEY_MUTE')" title="Mute">🔇</button>
        </div>
        <div class="rocker">
          <span class="rocker-label">CH</span>
          <button class="btn btn-rocker" data-key="KEY_CHUP"   onclick="sendKey('KEY_CHUP')">⌃</button>
          <button class="btn btn-rocker" data-key="KEY_CHDOWN" onclick="sendKey('KEY_CHDOWN')">⌄</button>
        </div>
      </div>

    </div><!-- /.remote -->

  </div><!-- /.remote-container -->

  <script src="remote.js"></script>
</body>
```

- [ ] **Step 3: Start app — visual check**

```
npm start
```
Expected: remote appears at same position as before. A thin `‹` strip is visible on the remote's left edge. The drawer panel doesn't show yet (no JS wired). Transparent area to the left does not block clicks on the desktop.

- [ ] **Step 4: Commit**

```
git add app/index.html
git commit -m "feat: add drawer tab, drawer panel, pinned-apps row HTML/CSS"
```

---

### Task 4: Drawer JS — open/close, render, reorder, click-through

**Files:**
- Modify: `app/remote.js`

**Interfaces:**
- Consumes: `loadMediaApps`, `saveMediaApps`, `reorderApp`, `launchApp` from Task 1; DOM ids from Task 3
- Produces: `renderPinnedApps()`, `renderDrawer()`, `setMediaApps(apps)`, `openDrawer()`, `closeDrawer()`

- [ ] **Step 1: Add drawer state and render functions to `app/remote.js`**

Add after `launchApp`:

```js
let _mediaApps = [];

function setMediaApps(apps) {
  _mediaApps = apps;
  saveMediaApps(apps);
  renderPinnedApps();
  renderDrawer();
}

function renderPinnedApps() {
  const container = document.getElementById('pinned-apps');
  if (!container) return;
  container.innerHTML = '';
  for (const app of _mediaApps.slice(0, 3)) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-icon pinned-app-btn';
    btn.title = app.name;
    btn.textContent = app.icon;
    btn.onclick = e => {
      if (e.shiftKey && app.deepLink) { showYouTubeInput(btn, app.appId); }
      else { launchApp(app.appId); }
    };
    container.appendChild(btn);
  }
}

function renderDrawer() {
  const container = document.getElementById('drawer-apps');
  if (!container) return;
  container.innerHTML = '';
  if (_mediaApps.length === 0) {
    const p = document.createElement('p');
    p.className = 'drawer-empty';
    p.textContent = 'No apps — tap ⚙ Manage';
    container.appendChild(p);
    return;
  }
  for (let i = 0; i < _mediaApps.length; i++) {
    const app = _mediaApps[i];
    const row = document.createElement('div');
    row.className = 'drawer-app-row';

    const upBtn = document.createElement('button');
    upBtn.className = 'drawer-order-btn';
    upBtn.textContent = '↑';
    upBtn.disabled = (i === 0);
    upBtn.onclick = () => setMediaApps(reorderApp(_mediaApps, app.id, 'up'));

    const appBtn = document.createElement('button');
    appBtn.className = 'drawer-app-btn';
    appBtn.title = app.name;
    appBtn.innerHTML =
      `<span class="app-icon">${app.icon}</span><span class="app-name">${app.name}</span>`;
    appBtn.onclick = e => {
      if (e.shiftKey && app.deepLink) { showYouTubeInput(appBtn, app.appId); }
      else { launchApp(app.appId); }
    };

    const downBtn = document.createElement('button');
    downBtn.className = 'drawer-order-btn';
    downBtn.textContent = '↓';
    downBtn.disabled = (i === _mediaApps.length - 1);
    downBtn.onclick = () => setMediaApps(reorderApp(_mediaApps, app.id, 'down'));

    row.appendChild(upBtn);
    row.appendChild(appBtn);
    row.appendChild(downBtn);
    container.appendChild(row);
  }
}

function openDrawer() {
  document.getElementById('remote-container').classList.add('drawer-open');
  document.getElementById('drawer-tab').textContent = '›';
}

function closeDrawer() {
  document.getElementById('remote-container').classList.remove('drawer-open');
  document.getElementById('drawer-tab').textContent = '‹';
}

function showYouTubeInput(anchorEl, appId) {
  const existing = document.getElementById('yt-input-row');
  if (existing) existing.remove();

  const row = document.createElement('div');
  row.id = 'yt-input-row';
  row.className = 'yt-input-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'yt-input';
  input.placeholder = 'YouTube URL or video ID';

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'yt-input-actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn yt-confirm-btn';
  confirmBtn.textContent = '▶';

  const err = document.createElement('span');
  err.className = 'yt-input-err';
  err.hidden = true;
  err.textContent = 'Not a valid YouTube URL or ID';

  const submit = () => {
    const videoId = parseYouTubeVideoId(input.value);
    if (!videoId) { err.hidden = false; return; }
    launchApp(appId, videoId);
    row.remove();
  };

  confirmBtn.onclick = submit;
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  submit();
    if (e.key === 'Escape') row.remove();
  });

  actionsDiv.appendChild(input);
  actionsDiv.appendChild(confirmBtn);
  row.appendChild(actionsDiv);
  row.appendChild(err);

  const parent = anchorEl.closest('.drawer-app-row') || anchorEl.closest('.pinned-apps');
  if (parent) parent.after(row);
  else        anchorEl.after(row);
  input.focus();
}
```

- [ ] **Step 2: Wire up drawer in `DOMContentLoaded` handler**

Inside the existing `document.addEventListener('DOMContentLoaded', () => { ... })` block, add at the top of the callback (before the existing `setStatus('err')` line):

```js
  _mediaApps = loadMediaApps();
  renderPinnedApps();
  renderDrawer();

  const drawerTab       = document.getElementById('drawer-tab');
  const remoteContainer = document.getElementById('remote-container');
  const manageBtn       = document.getElementById('drawer-manage-btn');

  drawerTab.addEventListener('click', () => {
    if (remoteContainer.classList.contains('drawer-open')) closeDrawer();
    else openDrawer();
  });

  drawerTab.addEventListener('mouseenter', openDrawer);

  let _closeTimer = null;
  remoteContainer.addEventListener('mouseleave', () => {
    _closeTimer = setTimeout(() => {
      closeDrawer();
      window.electronAPI?.setIgnoreMouseEvents(true);
    }, 150);
  });
  remoteContainer.addEventListener('mouseenter', () => {
    if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }
    window.electronAPI?.setIgnoreMouseEvents(false);
  });

  manageBtn.addEventListener('click', () => {
    if (!window.electronAPI?.openAppManager) return;
    window.electronAPI.openAppManager(JSON.stringify(_mediaApps)).then(result => {
      if (result) setMediaApps(JSON.parse(result));
    });
  });
```

- [ ] **Step 3: Start app — functional check**

```
npm start
```
Expected:
- Pinned apps row shows YouTube, Netflix, Prime icons
- Hovering the `‹` tab opens the drawer (slides in from the left of the tab)
- Moving mouse away closes it after 150ms
- ↑/↓ buttons reorder apps; pinned row updates immediately
- The transparent left area does not block desktop clicks

- [ ] **Step 4: Run tests**

```
npm test
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```
git add app/remote.js
git commit -m "feat: wire drawer open/close, render pinned apps and drawer app list"
```

---

### Task 5: YouTube shift+click deep-link (already wired in Task 4)

`showYouTubeInput` and `parseYouTubeVideoId` are fully implemented in Tasks 1 and 4. This task is a verification step only.

- [ ] **Step 1: Manual test — YouTube deep-link**

```
npm start
```
1. Connect to TV (set IP)
2. Shift+click the YouTube button in the pinned row → a text input appears below it
3. Paste `https://www.youtube.com/watch?v=dQw4w9WgXcQ` → press Enter
4. TV should open YouTube at that video
5. Shift+click YouTube in the drawer → same behavior
6. Paste `not-valid` → error text appears, no launch

- [ ] **Step 2: Run tests**

```
npm test
```
Expected: all tests PASS (no new code, just verification)

---

### Task 6: Management dialog

**Files:**
- Create: `app-manager-preload.js`
- Create: `app/app-manager.html`
- Modify: `main.js` (replace stub `open-app-manager` handler)
- Modify: `package.json` (add `app-manager-preload.js` to builder files)

**Interfaces:**
- Consumes: `window.electronAPI.openAppManager(appsJson)` from Task 2 (preload)
- Produces: modal dialog that resolves the `invoke` promise with new apps JSON or null

- [ ] **Step 1: Create `app-manager-preload.js`**

```js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('appManagerAPI', {
  save:   (appsJson) => ipcRenderer.send('app-manager-save',   appsJson),
  cancel: ()         => ipcRenderer.send('app-manager-cancel'),
});
```

- [ ] **Step 2: Create `app/app-manager.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Manage Apps</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html { height: 100%; border-radius: 8px; overflow: hidden; }

    body {
      height: 100%;
      font-family: 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif;
      font-size: 14px;
      color: rgba(255,255,255,0.95);
      background: transparent;
      display: flex;
      flex-direction: column;
      padding: 20px 20px 16px;
      gap: 10px;
      -webkit-app-region: drag;
    }

    button, input, label { -webkit-app-region: no-drag; }

    h1 { font-size: 14px; font-weight: 600; }

    .app-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .app-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px;
      border-radius: 4px;
    }
    .app-row:hover { background: rgba(255,255,255,0.04); }

    .app-row input[type=checkbox] { width: 14px; height: 14px; accent-color: #0067c0; cursor: pointer; flex-shrink: 0; }

    .app-row-name { flex: 1; font-size: 13px; cursor: pointer; }

    .order-btn {
      width: 22px; height: 22px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 3px;
      color: rgba(255,255,255,0.7);
      font-size: 11px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .order-btn:hover:not(:disabled) { background: rgba(255,255,255,0.12); }
    .order-btn:disabled { opacity: 0.2; cursor: default; }

    .divider { height: 1px; background: rgba(255,255,255,0.08); flex-shrink: 0; }

    .custom-section { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
    .custom-section label { font-size: 12px; color: rgba(255,255,255,0.6); }
    .custom-row { display: flex; gap: 6px; }

    input[type=text] {
      height: 30px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.09);
      border-bottom-color: rgba(255,255,255,0.45);
      border-radius: 4px;
      color: rgba(255,255,255,0.95);
      font-family: inherit;
      font-size: 13px;
      padding: 0 10px;
      outline: none;
    }
    input[type=text]:focus { border-bottom-color: #60cdff; }

    .input-name { flex: 1; }
    .input-appid { width: 120px; font-family: monospace; }

    .btn-add {
      height: 30px; padding: 0 12px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 4px;
      color: rgba(255,255,255,0.95);
      font-family: inherit; font-size: 13px;
      cursor: pointer; flex-shrink: 0;
    }
    .btn-add:hover { background: rgba(255,255,255,0.1); }

    .actions { display: flex; gap: 8px; justify-content: flex-end; flex-shrink: 0; }

    .btn-action {
      height: 32px; min-width: 80px; padding: 0 16px;
      border-radius: 4px; font-family: inherit; font-size: 14px;
      cursor: pointer; border: 1px solid transparent;
    }
    .btn-cancel { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.09); color: rgba(255,255,255,0.95); }
    .btn-cancel:hover { background: rgba(255,255,255,0.1); }
    .btn-save   { background: #0067c0; color: #fff; }
    .btn-save:hover { background: #1975c9; }
  </style>
</head>
<body>
  <h1>Manage Apps</h1>

  <div class="app-list" id="app-list"></div>

  <div class="divider"></div>

  <div class="custom-section">
    <label>Add custom app</label>
    <div class="custom-row">
      <input type="text" class="input-name"  id="custom-name"  placeholder="App name">
      <input type="text" class="input-appid" id="custom-appid" placeholder="Samsung App ID">
      <button class="btn-add" id="btn-add">+ Add</button>
    </div>
  </div>

  <div class="actions">
    <button class="btn-action btn-cancel" id="btn-cancel">Cancel</button>
    <button class="btn-action btn-save"   id="btn-save">Save</button>
  </div>

  <script>
    const CATALOG = [
      { id: 'youtube',     name: 'YouTube',     icon: '▶',  appId: '111299001912', deepLink: true  },
      { id: 'netflix',     name: 'Netflix',     icon: 'N',  appId: '11101200001',  deepLink: false },
      { id: 'prime',       name: 'Prime',       icon: '📦', appId: '3201910019365',deepLink: false },
      { id: 'disney',      name: 'Disney+',     icon: '🏰', appId: '3201901017640',deepLink: false },
      { id: 'spotify',     name: 'Spotify',     icon: '🎵', appId: '3201606009684',deepLink: false },
      { id: 'max',         name: 'Max',         icon: 'M',  appId: '3201601007230',deepLink: false },
      { id: 'appletv',     name: 'Apple TV+',   icon: '',  appId: '3201807016597',deepLink: false },
      { id: 'applemusic',  name: 'Apple Music', icon: '🎶', appId: '3201908019066',deepLink: false },
      { id: 'hulu',        name: 'Hulu',        icon: '🟢', appId: '3201601007625',deepLink: false },
      { id: 'paramount',   name: 'Paramount+',  icon: '⛰', appId: '3201711015986',deepLink: false },
      { id: 'peacock',     name: 'Peacock',     icon: '🦚', appId: '3202005022341',deepLink: false },
      { id: 'tubi',        name: 'Tubi',        icon: '📺', appId: '3201504901843',deepLink: false },
      { id: 'pluto',       name: 'Pluto TV',    icon: '🪐', appId: '3202008022518',deepLink: false },
      { id: 'crunchyroll', name: 'Crunchyroll', icon: '🍥', appId: '3201611010411',deepLink: false },
    ];

    // enabledApps: ordered array of currently enabled apps (passed from remote)
    let enabledApps = JSON.parse(new URLSearchParams(location.search).get('apps') || '[]');

    // Merge: build a master list = enabled apps (in order) + disabled catalog apps + custom disabled
    function buildRows() {
      const enabledIds = new Set(enabledApps.map(a => a.id));
      const catalogIds = new Set(CATALOG.map(a => a.id));
      const disabledCatalog = CATALOG.filter(a => !enabledIds.has(a.id));
      const customApps = enabledApps.filter(a => !catalogIds.has(a.id));
      // disabled custom apps are not shown (they were removed)
      return [
        ...enabledApps.map(a => ({ ...a, enabled: true })),
        ...disabledCatalog.map(a => ({ ...a, enabled: false })),
      ];
    }

    function render() {
      const list = document.getElementById('app-list');
      list.innerHTML = '';
      const rows = buildRows();

      rows.forEach((app, i) => {
        const enabledList = rows.filter(r => r.enabled);
        const enabledIdx  = enabledList.findIndex(r => r.id === app.id);

        const rowEl = document.createElement('div');
        rowEl.className = 'app-row';

        const cb = document.createElement('input');
        cb.type    = 'checkbox';
        cb.checked = app.enabled;
        cb.onchange = () => {
          if (cb.checked) {
            enabledApps.push(app);
          } else {
            enabledApps = enabledApps.filter(a => a.id !== app.id);
          }
          render();
        };

        const nameEl = document.createElement('span');
        nameEl.className   = 'app-row-name';
        nameEl.textContent = app.icon + ' ' + app.name;
        nameEl.onclick     = () => { cb.checked = !cb.checked; cb.onchange(); };

        const upBtn = document.createElement('button');
        upBtn.className   = 'order-btn';
        upBtn.textContent = '↑';
        upBtn.disabled    = !app.enabled || enabledIdx === 0;
        upBtn.onclick     = () => {
          const idx = enabledApps.findIndex(a => a.id === app.id);
          if (idx <= 0) return;
          [enabledApps[idx], enabledApps[idx - 1]] = [enabledApps[idx - 1], enabledApps[idx]];
          render();
        };

        const downBtn = document.createElement('button');
        downBtn.className   = 'order-btn';
        downBtn.textContent = '↓';
        downBtn.disabled    = !app.enabled || enabledIdx === enabledList.length - 1;
        downBtn.onclick     = () => {
          const idx = enabledApps.findIndex(a => a.id === app.id);
          if (idx < 0 || idx >= enabledApps.length - 1) return;
          [enabledApps[idx], enabledApps[idx + 1]] = [enabledApps[idx + 1], enabledApps[idx]];
          render();
        };

        rowEl.appendChild(cb);
        rowEl.appendChild(nameEl);
        rowEl.appendChild(upBtn);
        rowEl.appendChild(downBtn);
        list.appendChild(rowEl);
      });
    }

    render();

    document.getElementById('btn-add').onclick = () => {
      const name  = document.getElementById('custom-name').value.trim();
      const appId = document.getElementById('custom-appid').value.trim();
      if (!name || !appId) return;
      const id = 'custom-' + Date.now();
      enabledApps.push({ id, name, icon: '★', appId, deepLink: false, custom: true });
      document.getElementById('custom-name').value  = '';
      document.getElementById('custom-appid').value = '';
      render();
    };

    document.getElementById('btn-save').onclick   = () => window.appManagerAPI.save(JSON.stringify(enabledApps));
    document.getElementById('btn-cancel').onclick = () => window.appManagerAPI.cancel();

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') window.appManagerAPI.cancel();
    });
  </script>
</body>
</html>
```

- [ ] **Step 3: Replace the `open-app-manager` stub in `main.js`**

Replace the stub handler added in Task 2:

```js
ipcMain.handle('open-app-manager', (event, appsJson) => {
  const mainWin = BrowserWindow.fromWebContents(event.sender);
  return new Promise(resolve => {
    const dlg = new BrowserWindow({
      width:     420,
      height:    560,
      parent:    mainWin,
      modal:     true,
      frame:     false,
      resizable: false,
      backgroundColor: '#1f1f1f',
      webPreferences: {
        nodeIntegration:  false,
        contextIsolation: true,
        preload:          path.join(__dirname, 'app-manager-preload.js'),
      },
    });

    try { dlg.setBackgroundMaterial('mica'); } catch (_) {}

    dlg.loadFile(
      path.join(__dirname, 'app', 'app-manager.html'),
      { query: { apps: appsJson } }
    );

    const onSave   = (_, json) => { cleanup(); dlg.close(); resolve(json); };
    const onCancel = ()        => { cleanup(); dlg.close(); resolve(null); };

    function cleanup() {
      ipcMain.removeListener('app-manager-save',   onSave);
      ipcMain.removeListener('app-manager-cancel', onCancel);
    }

    ipcMain.once('app-manager-save',   onSave);
    ipcMain.once('app-manager-cancel', onCancel);
    dlg.on('closed', () => { cleanup(); resolve(null); });
  });
});
```

- [ ] **Step 4: Update `package.json` electron-builder files list**

In the `"build"` → `"files"` array, add `"app-manager-preload.js"`:

```json
"files": [
  "main.js",
  "preload.js",
  "dialog-preload.js",
  "ip-dialog.html",
  "app-manager-preload.js",
  "app/**"
]
```

- [ ] **Step 5: Start app — full end-to-end test**

```
npm start
```
Expected:
1. Hover the `‹` tab → drawer slides in
2. Click `⚙ Manage` → management dialog opens (dark modal, 420×560)
3. Toggle checkboxes and reorder → click Save → drawer and pinned row update
4. Click Cancel → no change
5. Add a custom app (name + fake App ID) → it appears in the drawer

- [ ] **Step 6: Run all tests**

```
npm test
```
Expected: all tests PASS

- [ ] **Step 7: Commit**

```
git add app-manager-preload.js app/app-manager.html main.js package.json
git commit -m "feat: add app manager dialog for toggling and reordering media apps"
```
