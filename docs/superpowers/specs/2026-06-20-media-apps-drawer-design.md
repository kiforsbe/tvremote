# Media Apps Drawer — Design Spec
Date: 2026-06-20

## Overview

Add a sliding media-apps drawer that opens to the LEFT of the remote body, a pinned row of 3 app shortcuts on the main remote, YouTube deep-linking, and a management dialog for configuring the app catalog.

---

## 1. Architecture & Files

| File | Change |
|---|---|
| `app/index.html` | Add `.remote-container` wrapper, drawer panel, drawer tab, pinned-app row |
| `app/remote.js` | Add `launchApp()`, YouTube URL parser, drawer open/close state, `localStorage` app management, `setIgnoreMouseEvents` IPC calls |
| `main.js` | Add `set-ignore-mouse-events` IPC handler, `open-app-manager` IPC handler (spawns modal `BrowserWindow`) |
| `preload.js` | Expose `setIgnoreMouseEvents` and `openAppManager` to renderer |
| `app/app-manager.html` | New management dialog (dark style matching `ip-dialog.html`) |
| `app-manager-preload.js` | New preload for management dialog (mirrors `dialog-preload.js`) |

---

## 2. Window Layout

`WIN_W` increases from 260 → 400px. The remote body is right-aligned in the window (~40px right padding), so its left edge stays at the same screen position as before. The leftmost ~140px of the window is transparent when the drawer is closed and fills with the drawer panel when open.

```
closed:  [ transparent 140px ][ tab 12px ][ remote 180px ][ 68px padding ]
open:    [ drawer panel 140px ][ tab 12px ][ remote 180px ][ 68px padding ]
```

**Initial window position:** On first launch (or when no saved position exists), set `x = (screenWidth - 260) / 2 - 140` so the remote body appears centered on screen exactly as it would with a 260px window. Subsequent positions follow wherever the user drags the window.

### Click-through (transparent area)

Use Electron's `setIgnoreMouseEvents` pattern:

- **Default:** `win.setIgnoreMouseEvents(true, { forward: true })` — transparent area is fully click-through
- **Mouse enters `.remote` or open `.drawer-panel`:** IPC call → `win.setIgnoreMouseEvents(false)`
- **Mouse leaves `.remote-container`:** IPC call → `win.setIgnoreMouseEvents(true, { forward: true })`

`-webkit-app-region: drag` moves from `body` to `.remote` only, so the transparent area is not accidentally draggable.

---

## 3. Drawer Trigger (Thin Slice Tab)

A narrow vertical affordance (~12px wide × 56px tall), vertically centered. It is a **standalone element** in the `.remote-container` flex row — sitting between the drawer panel and the `.remote` body — not part of the remote's 180px width. Visually it reads as the remote's left edge (same dark background, but slightly lighter `#252525`, left side rounded) to give the impression of being attached to the remote.

- Background: `#252525` (slightly lighter than remote body), pill-shaped (fully rounded left side)
- Contains a `‹` chevron or 3 dots `⋮` as the affordance indicator
- On hover: brightens, chevron nudges leftward
- `mouseenter` on tab or drawer panel → opens drawer (CSS transition)
- `mouseleave` on `.remote-container` → closes drawer (with 150ms delay to prevent flicker)
- Click also toggles (for browser/touch fallback)

---

## 4. Drawer Panel

- Width: 0 → 140px via CSS `transition: width 0.25s ease`
- `top: 28px; height: calc(100% - 56px)` — aligns with the flat section between the remote's `border-radius: 28px` corners (does not extend to the full remote height)
- `border-radius: 14px 0 0 14px` — rounded on left only, flush against the tab on right
- Background: `#141414` (same as remote body)
- `overflow: hidden` to clip content during transition

### Drawer contents

Stacked vertically, scrollable if needed:

```
[ ↑ ] [ 🎬 YouTube  ] [ ↓ ]
[ ↑ ] [ 🎞 Netflix  ] [ ↓ ]
[ ↑ ] [ 📦 Prime    ] [ ↓ ]
...
[ ⚙ Manage ]
```

- Each app row: icon emoji + short name label + ↑/↓ arrow buttons for reordering
- `↑` on first item and `↓` on last item are disabled
- `⚙ Manage` button pinned at the bottom, opens the management dialog

---

## 5. Pinned App Row

A row of 3 icon buttons in the remote body, inserted between the color-dot row and the nav ring. Reflects the first 3 items in `localStorage.mediaApps` at all times. Updates live when the user reorders in the drawer or saves in the management dialog.

Each button:
- 44×44px circle, same style as `.btn-icon`
- Shows the app's icon emoji
- Normal click → `launchApp(app.appId)`
- Shift+click (YouTube only) → show inline video URL input

---

## 6. Data Model

All state in `localStorage`:

**`localStorage.mediaApps`** — JSON array of enabled apps in user-defined order:
```json
[
  { "id": "youtube",  "name": "YouTube",     "appId": "111299001912", "icon": "▶", "deepLink": true  },
  { "id": "netflix",  "name": "Netflix",     "appId": "11101200001",  "icon": "N", "deepLink": false },
  { "id": "prime",    "name": "Prime Video", "appId": "3201910019365","icon": "📦","deepLink": false },
  ...
  { "id": "custom-1", "name": "My App",      "appId": "XXXXXXXXXXXX", "icon": "★", "deepLink": false, "custom": true }
]
```

- All items in the array are "in the drawer"
- First 3 items = pinned to the main remote body
- Custom apps added by the user include `"custom": true`
- If `localStorage.mediaApps` is absent, the default enabled set is applied on first load

### Built-in catalog (constant in `remote.js`, never persisted unless enabled)

| Name | App ID | Deep-link |
|---|---|---|
| YouTube | 111299001912 | ✓ |
| Netflix | 11101200001 | — |
| Prime Video | 3201910019365 | — |
| Disney+ | 3201901017640 | — |
| Spotify | 3201606009684 | — |
| Max (HBO) | 3201601007230 | — |
| Apple TV+ | 3201807016597 | — |
| Apple Music | 3201908019066 | — |
| Hulu | 3201601007625 | — |
| Paramount+ | 3201711015986 | — |
| Peacock | 3202005022341 | — |
| Tubi | 3201504901843 | — |
| Pluto TV | 3202008022518 | — |
| Crunchyroll | 3201611010411 | — |

**Default enabled set** (loaded when no `localStorage.mediaApps`): YouTube, Netflix, Prime Video (first 3 = pinned).

---

## 7. App Launching

New function in `remote.js`:

```js
function launchApp(appId, metaTag = null) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const params = { id: appId };
  if (metaTag) params.metaTag = metaTag;
  ws.send(JSON.stringify({ method: 'ms.application.start', params }));
}
```

---

## 8. YouTube Deep-Link Flow

- **Normal click** on YouTube button → `launchApp("111299001912")`
- **Shift+click** on YouTube button → a small inline input appears below the button (in the drawer) or as a floating overlay (in the pinned row). User pastes a URL or video ID and presses Enter or clicks ▶.
- On submit: parse → `launchApp("111299001912", videoId)` → input hides

### URL parser

```
youtube.com/watch?v=XXXXXXXXXXX  → v query param
youtu.be/XXXXXXXXXXX             → first path segment
youtube.com/shorts/XXXXXXXXXXX   → second path segment
11-character raw string          → used as-is
anything else                    → show inline error "Not a valid YouTube URL or ID"
```

---

## 9. Management Dialog

A modal `BrowserWindow` (same dark style, same pattern as `ip-dialog.html`/`dialog-preload.js`).

### Contents

1. **App list** — all 14 catalog apps, each with:
   - Checkbox: enabled (in drawer) / disabled
   - App name
   - ↑/↓ buttons for ordering (only affect enabled apps)
2. **Custom app form** at the bottom:
   - Name text input
   - Samsung App ID text input
   - `+ Add` button — validates non-empty, appends to enabled list
3. **Save / Cancel** buttons
   - Save: writes `localStorage.mediaApps`, fires `media-apps-changed` custom event so the main page re-renders pinned row and drawer
   - Cancel: discards changes

### IPC flow

- Renderer calls `window.electronAPI.openAppManager(currentApps)`
- `main.js` opens `app-manager.html` as a modal child window
- On save: `ipcMain` receives `app-manager-save` with new apps array, sends it back to the opener's renderer
- Opener re-renders from the received data and persists to `localStorage`

---

## 10. Error & Edge Cases

- **WebSocket not connected:** `launchApp` silently no-ops (same pattern as `sendKey`)
- **Drawer with 0 apps:** shows "No apps — tap ⚙ Manage" placeholder
- **Management dialog custom app duplicate ID:** allowed (user's responsibility)
- **Reorder when only 1 item:** both ↑↓ disabled
- **Pinned row with fewer than 3 enabled apps:** row shows only however many are enabled (no empty placeholders)
