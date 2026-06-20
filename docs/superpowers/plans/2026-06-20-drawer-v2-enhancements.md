# Drawer v2 Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition the drawer tab so it overlays the drawer panel, replace ↑/↓ reordering with drag-and-drop (with insertion indicator) in both the drawer and the management dialog, and add a modern Windows 11 scrollbar to the management dialog.

**Architecture:** Three independent changesets in three files: (1) `app/index.html` and `app/remote.js` for the drawer layout and drag-drop; (2) `app/app-manager.html` for the dialog drag-drop and scrollbar. A new pure function `moveApp(apps, fromIdx, toIdx)` is added to `remote.js` (and exported for tests) to express the drag-drop reorder logic without mutation.

**Tech Stack:** Vanilla JS (no libraries), HTML5 Drag and Drop API, CSS `-webkit-scrollbar` pseudo-elements, Jest + jsdom for unit tests.

## Global Constraints

- No new npm dependencies.
- No ES module `import`/`export` — use `module.exports` for Jest exports (browser ignores it).
- Context isolation is active (`contextIsolation: true`, `nodeIntegration: false`); renderer code must not use Node APIs.
- All dynamic text written to the DOM must use `textContent` (never `innerHTML`) to prevent XSS.
- `setIgnoreMouseEvents` is called via `window.electronAPI?.setIgnoreMouseEvents(bool)` (the `?` is required — the API is absent in browser/test environments).
- Existing 33 unit tests must continue to pass after every task.
- The drawer panel stays 140 px wide when open; the remote is 180 px; padding-right on body is 40 px; window is 400 px wide — do not change any of these.

---

### Task 1: Drawer tab repositioning + setIgnoreMouseEvents

**What this does:** Moves `#drawer-tab` from the flex row (between `#drawer-panel` and `.remote`) into `.remote` as an absolutely-positioned child. When the drawer is closed the tab sticks 12 px into the transparent window area to the left of the remote; when the drawer is open the tab overlays the drawer panel's rightmost 12 px. Replaces the `mouseenter`/`mouseleave` event pattern on `.remote-container` with a single `document.mousemove` + `elementFromPoint` handler that works even when the tab is outside the container's bounding box.

**Files:**
- Modify: `app/index.html`
- Modify: `app/remote.js`
- Test: `tests/unit/media-apps.test.js` (run only — no new tests; this task has no new pure functions)

**Interfaces:**
- Produces: `#drawer-tab` is now a child of `.remote`; `openDrawer()` / `closeDrawer()` and their `getElementById('drawer-tab')` calls are unaffected (IDs are document-unique regardless of position).

---

- [ ] **Step 1: Move `#drawer-tab` in the HTML**

In `app/index.html`, find the section starting at the `<div class="remote-container">` (around line 574). The current structure is:

```html
<div class="remote-container" id="remote-container">
  <div class="drawer-panel" id="drawer-panel">
    <div class="drawer-apps" id="drawer-apps"></div>
    <button class="drawer-manage-btn" id="drawer-manage-btn">⚙ Manage</button>
  </div>
  <div class="drawer-tab" id="drawer-tab">‹</div>
  <div class="remote">
    ...remote content...
  </div>
</div>
```

Change it to (tab is now the FIRST child of `.remote`):

```html
<div class="remote-container" id="remote-container">
  <div class="drawer-panel" id="drawer-panel">
    <div class="drawer-apps" id="drawer-apps"></div>
    <button class="drawer-manage-btn" id="drawer-manage-btn">⚙ Manage</button>
  </div>
  <div class="remote">
    <div class="drawer-tab" id="drawer-tab">‹</div>
    ...rest of remote content unchanged...
  </div>
</div>
```

---

- [ ] **Step 2: Update `.drawer-tab` CSS**

In `app/index.html`, find the `.drawer-tab` CSS block (around line 391). Replace it entirely:

```css
/* ── Drawer tab ─────────────────────────────── */
.drawer-tab {
  position: absolute;
  left: -12px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #252525;
  border-radius: 8px 0 0 8px;
  color: var(--text-dim);
  font-size: 9px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
  -webkit-app-region: no-drag;
  user-select: none;
  z-index: 10;
}

.drawer-tab:hover {
  background: #2e2e2e;
  color: var(--text);
}
```

Removed from old rule: `align-self: center`, `flex-shrink: 0`.
Added: `position: absolute`, `left: -12px`, `top: 50%`, `transform: translateY(-50%)`, `z-index: 10`.

---

- [ ] **Step 3: Add `position: relative` to `.remote`**

In `app/index.html`, find the CSS rule that sets `.remote { -webkit-app-region: drag; }` (around line 386). Update it:

```css
.remote {
  position: relative;
  -webkit-app-region: drag;
}
```

---

- [ ] **Step 4: Replace the mouseenter/mouseleave handlers in `remote.js`**

In `app/remote.js`, inside `document.addEventListener('DOMContentLoaded', () => { ... })`, find and REMOVE these lines (the `const remoteContainer` declaration becomes dead code after this change — remove it too):

```js
const remoteContainer = document.getElementById('remote-container');   // REMOVE
```

```js
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
```

Replace the three `addEventListener` lines (and the `let _closeTimer` declaration) with:

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

The `drawerTab.addEventListener('click', ...)` and `drawerTab.addEventListener('mouseenter', openDrawer)` lines remain unchanged.

---

- [ ] **Step 5: Run existing tests**

```
npx jest tests/unit/media-apps.test.js --no-coverage
```

Expected: 33 tests pass, 0 fail.

---

- [ ] **Step 6: Commit**

```
git add app/index.html app/remote.js
git commit -m "feat: move drawer tab inside .remote; use document.mousemove for setIgnoreMouseEvents"
```

---

### Task 2: moveApp pure function + drawer drag-and-drop

**What this does:** Adds a `moveApp(apps, fromIdx, toIdx)` pure function (tested) that computes the result of dragging an item from one position to another. Updates `renderDrawer()` to remove the ↑/↓ buttons, add a `⠿` grab handle, and set `draggable="true"` with `data-idx` on each row. Adds `setupDrawerDragDrop()` (called once in `DOMContentLoaded`) that registers delegated drag events on `#drawer-apps` and shows a 2 px blue insertion indicator.

**Files:**
- Modify: `app/remote.js`
- Modify: `app/index.html`
- Modify: `tests/unit/media-apps.test.js`

**Interfaces:**
- Consumes: `_mediaApps` (module-level array), `setMediaApps(apps)` (existing), `reorderApp` (existing — kept but no longer called from the drawer UI; still used if caller wants it)
- Produces: `moveApp(apps, fromIdx, toIdx)` — exported in `module.exports`; pure function, returns new array

---

- [ ] **Step 1: Write failing tests for `moveApp`**

Add this `describe` block at the end of `tests/unit/media-apps.test.js` (the import line at the top stays the same for now — we'll add `moveApp` in the next step):

```js
describe('moveApp', () => {
  const apps = (ids) => ids.map(id => ({ id, name: id, icon: '', appId: 'x', deepLink: false }));

  test('moves item from index 0 to index 2 (inserts before index 2)', () => {
    expect(moveApp(apps(['a','b','c']), 0, 2).map(a => a.id)).toEqual(['b','a','c']);
  });

  test('moves item from index 2 to index 1 (inserts before index 1)', () => {
    expect(moveApp(apps(['a','b','c']), 2, 1).map(a => a.id)).toEqual(['a','c','b']);
  });

  test('moves item to beginning (toIdx 0)', () => {
    expect(moveApp(apps(['a','b','c']), 2, 0).map(a => a.id)).toEqual(['c','a','b']);
  });

  test('moves item to end (toIdx length)', () => {
    expect(moveApp(apps(['a','b','c']), 0, 3).map(a => a.id)).toEqual(['b','c','a']);
  });

  test('no-op when fromIdx === toIdx', () => {
    expect(moveApp(apps(['a','b','c']), 1, 1).map(a => a.id)).toEqual(['a','b','c']);
  });

  test('no-op when fromIdx + 1 === toIdx (inserting after itself)', () => {
    expect(moveApp(apps(['a','b','c']), 1, 2).map(a => a.id)).toEqual(['a','b','c']);
  });

  test('does not mutate original array', () => {
    const original = apps(['a','b','c']);
    const result = moveApp(original, 0, 2);
    expect(result).not.toBe(original);
    expect(original.map(a => a.id)).toEqual(['a','b','c']);
  });
});
```

Also add `moveApp` to the destructure at the top of the test file:

```js
const {
  MEDIA_APPS_CATALOG,
  loadMediaApps,
  saveMediaApps,
  buildAppLaunchCommand,
  parseYouTubeVideoId,
  reorderApp,
  moveApp,
} = require('../../app/remote.js');
```

---

- [ ] **Step 2: Run tests — verify they fail**

```
npx jest tests/unit/media-apps.test.js --no-coverage
```

Expected: 7 new tests fail with `moveApp is not a function` (or `TypeError`). Existing 33 tests still pass.

---

- [ ] **Step 3: Add `moveApp` to `remote.js`**

In `app/remote.js`, add this function immediately after `reorderApp` (around line 84):

```js
function moveApp(apps, fromIdx, toIdx) {
  if (fromIdx === toIdx || fromIdx + 1 === toIdx) return apps.slice();
  const next = apps.slice();
  const [item] = next.splice(fromIdx, 1);
  next.splice(fromIdx < toIdx ? toIdx - 1 : toIdx, 0, item);
  return next;
}
```

Then add `moveApp` to the `module.exports` at the bottom of `remote.js`:

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
    moveApp,
  };
}
```

---

- [ ] **Step 4: Run tests — verify all 40 pass**

```
npx jest tests/unit/media-apps.test.js --no-coverage
```

Expected: 40 tests pass (33 existing + 7 new), 0 fail.

---

- [ ] **Step 5: Add drag-drop CSS to `app/index.html`**

In `app/index.html`, REMOVE the `.drawer-order-btn` CSS block entirely (it's no longer used — the ↑/↓ buttons are being removed from the drawer). Search for this exact text and delete it:

```css
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
```

In the same `<style>` block, replace the removed block with the drag-drop styles:

```css
/* ── Drawer drag-and-drop ────────────────────── */
.drawer-grab-handle {
  font-size: 12px;
  color: var(--text-dim);
  cursor: grab;
  flex-shrink: 0;
  width: 14px;
  text-align: center;
  user-select: none;
  -webkit-app-region: no-drag;
}
.drawer-grab-handle:active { cursor: grabbing; }

.drawer-app-row { position: relative; }
.drawer-app-row.dragging { opacity: 0.4; }
.drawer-app-row.drag-over-top    { box-shadow: 0 -2px 0 0 #60cdff; }
.drawer-app-row.drag-over-bottom { box-shadow: 0  2px 0 0 #60cdff; }
```

---

- [ ] **Step 6: Rewrite `renderDrawer()` in `remote.js`**

Replace the entire `renderDrawer` function body with the version below. Key changes: remove `upBtn`/`downBtn`, add `handle` (`⠿`), set `row.draggable = true` and `row.dataset.idx = i`:

```js
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
    row.draggable = true;
    row.dataset.idx = i;

    const handle = document.createElement('span');
    handle.className = 'drawer-grab-handle';
    handle.textContent = '⠿';

    const appBtn = document.createElement('button');
    appBtn.className = 'drawer-app-btn';
    appBtn.title = app.name;
    const iconEl = document.createElement('span');
    iconEl.className = 'app-icon';
    iconEl.textContent = app.icon;
    const nameEl = document.createElement('span');
    nameEl.className = 'app-name';
    nameEl.textContent = app.name;
    appBtn.appendChild(iconEl);
    appBtn.appendChild(nameEl);
    appBtn.onclick = e => {
      if (e.shiftKey && app.deepLink) { showYouTubeInput(appBtn, app.appId); }
      else { launchApp(app.appId); }
    };

    row.appendChild(handle);
    row.appendChild(appBtn);
    container.appendChild(row);
  }
}
```

---

- [ ] **Step 7: Add `setupDrawerDragDrop()` to `remote.js`**

Add this function immediately after `renderDrawer` (before `openDrawer`):

```js
function setupDrawerDragDrop() {
  const container = document.getElementById('drawer-apps');
  if (!container) return;
  let _dragIdx = null;

  container.addEventListener('dragstart', e => {
    const row = e.target.closest('.drawer-app-row');
    if (!row) return;
    _dragIdx = Number(row.dataset.idx);
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  container.addEventListener('dragover', e => {
    e.preventDefault();
    const row = e.target.closest('.drawer-app-row');
    container.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    if (!row || _dragIdx === null) return;
    const rect = row.getBoundingClientRect();
    const cls = e.clientY < rect.top + rect.height / 2 ? 'drag-over-top' : 'drag-over-bottom';
    row.classList.add(cls);
  });

  container.addEventListener('drop', e => {
    e.preventDefault();
    const row = e.target.closest('.drawer-app-row');
    if (!row || _dragIdx === null) return;
    const targetIdx = Number(row.dataset.idx);
    const rect = row.getBoundingClientRect();
    const toIdx = e.clientY < rect.top + rect.height / 2 ? targetIdx : targetIdx + 1;
    const newApps = moveApp(_mediaApps, _dragIdx, toIdx);
    _dragIdx = null;
    setMediaApps(newApps);
  });

  container.addEventListener('dragend', () => {
    _dragIdx = null;
    container.querySelectorAll('.dragging, .drag-over-top, .drag-over-bottom').forEach(el => {
      el.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom');
    });
  });
}
```

---

- [ ] **Step 8: Call `setupDrawerDragDrop()` in `DOMContentLoaded`**

In `app/remote.js`, inside the `DOMContentLoaded` handler, find the block that initialises the drawer:

```js
_mediaApps = loadMediaApps();
renderPinnedApps();
renderDrawer();
```

Add the setup call immediately after:

```js
_mediaApps = loadMediaApps();
renderPinnedApps();
renderDrawer();
setupDrawerDragDrop();
```

---

- [ ] **Step 9: Run tests**

```
npx jest tests/unit/media-apps.test.js --no-coverage
```

Expected: 40 tests pass, 0 fail.

---

- [ ] **Step 10: Commit**

```
git add app/index.html app/remote.js tests/unit/media-apps.test.js
git commit -m "feat: add moveApp; replace drawer up/down with drag-and-drop + insertion indicator"
```

---

### Task 3: Management dialog drag-and-drop + Windows 11 scrollbar

**What this does:** Adds a `⠿` drag handle to each **enabled** app row in the management dialog, wires HTML5 drag-drop events on `#app-list` (delegated, so they survive re-renders), and styles the scrollbar with the Windows 11 aesthetic. The existing ↑/↓ `order-btn` buttons are kept — the user can use either method. All changes are self-contained within `app/app-manager.html`.

**Files:**
- Modify: `app/app-manager.html`

**Interfaces:**
- Consumes: existing `enabledApps` array (module-level) and `render()` function (module-level) — the drag handlers reference these directly since all code is in the same inline `<script>`.

---

- [ ] **Step 1: Add scrollbar CSS and drag-drop CSS to `app/app-manager.html`**

In the `<style>` block of `app/app-manager.html`, add the following at the very end (before the closing `</style>`):

```css
/* ── Windows 11 scrollbar ───────────────────── */
#app-list::-webkit-scrollbar         { width: 6px; }
#app-list::-webkit-scrollbar-track   { background: transparent; }
#app-list::-webkit-scrollbar-thumb   {
  background: rgba(255,255,255,0.22);
  border-radius: 3px;
}
#app-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.4);
}

/* ── Dialog drag-and-drop ───────────────────── */
.drag-handle {
  font-size: 12px;
  color: rgba(255,255,255,0.3);
  cursor: grab;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  user-select: none;
  -webkit-app-region: no-drag;
}
.drag-handle:active { cursor: grabbing; }
.app-row.dragging         { opacity: 0.4; }
.app-row.drag-over-top    { box-shadow: 0 -2px 0 0 #60cdff; }
.app-row.drag-over-bottom { box-shadow: 0  2px 0 0 #60cdff; }
```

---

- [ ] **Step 2: Add drag handle to enabled rows in `render()`**

In the `<script>` block of `app/app-manager.html`, find `render()`. Inside the `rows.forEach((app, i) => { ... })` callback, find where `rowEl` is created and configured. 

After `rowEl.className = 'app-row';`, add these lines **only for enabled apps**:

```js
const rowEl = document.createElement('div');
rowEl.className = 'app-row';

if (app.enabled) {
  rowEl.draggable = true;
  rowEl.dataset.id = app.id;
  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '⠿';
  rowEl.appendChild(handle);
}
```

The handle is appended to `rowEl` BEFORE the checkbox, name, and order buttons. So the final row layout is: `[ ⠿ ][ ☑ ][ name ][ ↑ ][ ↓ ]` for enabled rows and `[ ☑ ][ name ][ ↑ ][ ↓ ]` for disabled rows.

The existing code that builds `cb`, `nameEl`, `upBtn`, `downBtn` and appends them remains unchanged — place the `if (app.enabled)` handle block right after `rowEl.className = 'app-row'` and before the checkbox creation.

The complete updated row-building section:

```js
rows.forEach((app, i) => {
  const enabledList = rows.filter(r => r.enabled);
  const enabledIdx  = enabledList.findIndex(r => r.id === app.id);

  const rowEl = document.createElement('div');
  rowEl.className = 'app-row';

  if (app.enabled) {
    rowEl.draggable = true;
    rowEl.dataset.id = app.id;
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    rowEl.appendChild(handle);
  }

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
```

---

- [ ] **Step 3: Add drag-drop event wiring after `render()` in `app/app-manager.html`**

In the `<script>` block, find the line `render();` (the initial call, around line 223). After it, add the IIFE that sets up drag events once:

```js
render();

// Drag-and-drop (delegated to #app-list — survives re-renders)
(function () {
  const list = document.getElementById('app-list');
  let _ddIdx = null;

  list.addEventListener('dragstart', e => {
    const row = e.target.closest('[draggable]');
    if (!row) return;
    _ddIdx = enabledApps.findIndex(a => a.id === row.dataset.id);
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  list.addEventListener('dragover', e => {
    e.preventDefault();
    const row = e.target.closest('[draggable]');
    list.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el =>
      el.classList.remove('drag-over-top', 'drag-over-bottom'));
    if (!row || _ddIdx === null) return;
    const rect = row.getBoundingClientRect();
    row.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drag-over-top' : 'drag-over-bottom');
  });

  list.addEventListener('drop', e => {
    e.preventDefault();
    const row = e.target.closest('[draggable]');
    if (!row || _ddIdx === null) return;
    const targetId  = row.dataset.id;
    const targetIdx = enabledApps.findIndex(a => a.id === targetId);
    const rect      = row.getBoundingClientRect();
    const toIdx     = e.clientY < rect.top + rect.height / 2 ? targetIdx : targetIdx + 1;
    // inline moveApp logic (no shared module in dialog)
    if (_ddIdx !== toIdx && _ddIdx + 1 !== toIdx) {
      const next = enabledApps.slice();
      const [item] = next.splice(_ddIdx, 1);
      next.splice(_ddIdx < toIdx ? toIdx - 1 : toIdx, 0, item);
      enabledApps = next;
      render();
    }
    _ddIdx = null;
  });

  list.addEventListener('dragend', () => {
    _ddIdx = null;
    list.querySelectorAll('.dragging, .drag-over-top, .drag-over-bottom').forEach(el =>
      el.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom'));
  });
})();
```

---

- [ ] **Step 4: Run existing tests**

```
npx jest tests/unit/media-apps.test.js --no-coverage
```

Expected: 40 tests pass (unchanged — this task touches only `app-manager.html`).

---

- [ ] **Step 5: Commit**

```
git add app/app-manager.html
git commit -m "feat: add drag-and-drop + Win11 scrollbar to app manager dialog"
```
