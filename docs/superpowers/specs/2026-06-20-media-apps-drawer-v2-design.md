# Media Apps Drawer — Enhancement Spec (v2)
Date: 2026-06-20

Builds on the v1 implementation (`2026-06-20-media-apps-drawer-design.md`). Covers three improvements requested after the initial feature shipped:

1. Drawer tab repositioning (overlays drawer, not between drawer and remote)
2. Drag-and-drop reordering with insertion indicator (drawer + management dialog)
3. Modern Windows 11 scrollbar in the management dialog

---

## 1. Drawer Tab Layout Change

### Problem

In v1 the flex row is `[drawer-panel][drawer-tab 12px][remote]`. This means the drawer's right edge never meets the remote's left edge — there is always a 12px tab sitting between them.

### Target Layout

```
closed:  [ transparent 168px ][ tab 12px overlapping remote's left ][ remote 180px ][ 40px padding ]
open:    [ drawer 140px ][ tab 12px overlaying drawer's right 12px ][ remote 180px ][ 40px padding ]
```

The drawer's right edge = the remote's left edge. The tab sits on TOP of the drawer's rightmost 12px (z-index: 10 over the drawer panel).

### Implementation

**HTML change**: Remove `#drawer-tab` from the flex row. Place it as the FIRST child of `.remote`:

```html
<div class="remote" id="remote">
  <div class="drawer-tab" id="drawer-tab">‹</div>
  <!-- existing remote content unchanged -->
</div>
```

**CSS changes**:

```css
/* .remote needs position: relative for the absolutely positioned tab */
.remote {
  position: relative;
  /* all existing properties kept */
}

.drawer-tab {
  position: absolute;
  left: -12px;
  top: 50%;
  transform: translateY(-50%);
  /* width/height/background/border-radius unchanged */
  z-index: 10;
}
```

- When drawer closed (panel = 0px): container = 180px (remote only). Tab at left=−12px relative to `.remote` → occupies 12px of the transparent window area immediately left of the remote. Visible and hoverable. ✓  
- When drawer open (panel = 140px): container = 320px. Remote starts at x=140 in container. Tab at x=128–140 → overlays drawer's rightmost 12px. ✓

**No window size changes required.** Remote's screen position is unchanged because the container is right-aligned and the remote is the rightmost flex child.

### setIgnoreMouseEvents

The tab when the drawer is closed sits 12px OUTSIDE the `.remote-container` bounding box (to its left, in the transparent window area). The current `mouseenter`/`mouseleave` approach on `.remote-container` does not cover this position.

Replace with `document.mousemove` + `elementFromPoint`:

```js
// In DOMContentLoaded, replace the mouseenter/mouseleave handlers:
let _ignoreMouse = true;
document.addEventListener('mousemove', e => {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const shouldIgnore = !el || el === document.body || el.tagName === 'HTML';
  if (shouldIgnore !== _ignoreMouse) {
    _ignoreMouse = shouldIgnore;
    window.electronAPI?.setIgnoreMouseEvents(shouldIgnore);
  }
});
```

`mousemove` is forwarded to Chromium even when the window ignores mouse events (`forward: true`), so `elementFromPoint` sees the tab even when it's in the transparent zone. IPC is called only when the ignore-state changes (no flood of calls).

The drawer close-on-mouseleave (150ms timer) integrates with the same `mousemove` handler — when `shouldIgnore` transitions to `true`, that means the mouse has left all interactive elements and is over a transparent area, which is the signal to start the close timer:

```js
let _ignoreMouse = true;
let _closeTimer = null;
document.addEventListener('mousemove', e => {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const shouldIgnore = !el || el === document.body || el.tagName === 'HTML';
  if (shouldIgnore !== _ignoreMouse) {
    _ignoreMouse = shouldIgnore;
    window.electronAPI?.setIgnoreMouseEvents(shouldIgnore);
    if (shouldIgnore) {
      _closeTimer = setTimeout(closeDrawer, 150);
    } else {
      if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }
    }
  }
});
```

This replaces the old `mouseenter`/`mouseleave` handlers on `.remote-container` entirely.

---

## 2. Drag-and-Drop Reordering

### Drawer

**Remove** the ↑/↓ order buttons. Replace with:
- A grab handle `⠿` (U+2807, BRAILLE PATTERN DOTS-1238) on the LEFT of each row — `cursor: grab`
- `draggable="true"` on each `.drawer-app-row`

Row structure after change:
```
[ ⠿ grab-handle ][ app-btn (flex:1) ]
```

**Events on `#drawer-apps` container** (delegated):

| Event | Handler |
|---|---|
| `dragstart` | Store dragged item's index in a module variable; add `.dragging` class to the row |
| `dragover` | `e.preventDefault()`; determine if cursor is in top or bottom half of the target row; add `.drag-over-top` or `.drag-over-bottom` class |
| `dragleave` | Remove drag-over classes from the left element |
| `drop` | Compute new order, call `setMediaApps(newApps)`; clear drag state |
| `dragend` | Clear all `.dragging` and `.drag-over-*` classes |

**Insertion indicator** — CSS only, no extra DOM elements:

```css
.drawer-app-row { position: relative; }
.drawer-app-row.drag-over-top    { box-shadow: 0 -2px 0 0 #60cdff; }
.drawer-app-row.drag-over-bottom { box-shadow: 0  2px 0 0 #60cdff; }
.drawer-app-row.dragging         { opacity: 0.4; }
```

**Drop position logic** (in `dragover`):

```js
function getDropPosition(e, row) {
  const rect = row.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
}
```

If drop position is `top` on row at index `i`, the dragged item goes BEFORE `i`. If `bottom`, it goes AFTER `i`.

### Management Dialog

Same approach in `app-manager.html`:

- Add a `⠿` grab handle to each **enabled** app row (disabled apps in the catalog section are not draggable — they have no meaningful order)
- `draggable="true"` on enabled rows
- Same event set delegated to the `#app-list` container
- Same `.drag-over-top` / `.drag-over-bottom` / `.dragging` CSS classes
- On drop: reorder `enabledApps` array, call `render()`

Drag handles apply only to enabled (checked) apps. Disabled catalog rows are static.

The existing ↑/↓ `order-btn` buttons in the management dialog are **kept** (the dialog has enough width to accommodate both controls). Users can use either arrows or drag-drop interchangeably. Only the drawer removes ↑/↓ (the 140px drawer is too narrow to fit both handle and arrows without crowding).

---

## 3. Management Dialog Scrollbar

The `#app-list` container already has `overflow-y: auto`. Scrolling with the mouse wheel already works. Changes:

### CSS (Windows 11 style)

```css
#app-list::-webkit-scrollbar {
  width: 6px;
}
#app-list::-webkit-scrollbar-track {
  background: transparent;
}
#app-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.22);
  border-radius: 3px;
  transition: background 0.15s;
}
#app-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.4);
}
```

- 6px wide, rounded ends — matches Windows 11 thin scrollbar aesthetic
- Thumb is draggable by default in Chromium (no JS needed)
- Track is transparent (invisible until thumb appears)

No JavaScript changes required for the scrollbar.

---

## 4. Files Changed

| File | Changes |
|---|---|
| `app/index.html` | Move `#drawer-tab` inside `.remote`; add `position: relative` to `.remote`; update `.drawer-tab` CSS to `position: absolute; left: -12px; top: 50%; transform: translateY(-50%); z-index: 10`; add drag-drop CSS classes for drawer rows |
| `app/remote.js` | Replace `mouseenter`/`mouseleave` handlers with `document.mousemove` + `elementFromPoint`; update `renderDrawer()` to remove ↑/↓ buttons, add drag handle, wire drag-drop events |
| `app/app-manager.html` | Add drag handle to enabled rows; wire drag-drop events; add Windows 11 scrollbar CSS |

---

## 5. Edge Cases

- **Dragging to the same position**: detect no-op (dragged index === target index) and skip `setMediaApps` to avoid unnecessary re-render
- **Only 1 app in drawer**: drag handle shown but dragging has no effect (can't reorder a single item); no error
- **Drag cancelled** (Escape or drag outside window): `dragend` fires with `e.dataTransfer.dropEffect === 'none'`; restore original order by clearing state without calling `setMediaApps`
- **Tab hover in transparent area**: `elementFromPoint` returns the tab element → `setIgnoreMouseEvents(false)` → click registers on the tab ✓
- **Window focus lost mid-drag**: `dragend` fires; cleanup runs normally
