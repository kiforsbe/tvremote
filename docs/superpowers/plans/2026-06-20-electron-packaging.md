# Electron Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `electron-builder` so `npm run dist` produces a Windows NSIS installer and a portable `.exe` from the existing Electron app.

**Architecture:** `electron-builder` reads a `"build"` config block in `package.json` and bundles the app source files into a self-contained Electron distribution. A Windows `.ico` file is generated from the existing source icon using `png-to-ico` (packing multiple sizes) and committed to `build/icon.ico`. No changes to app logic or project structure.

**Tech Stack:** electron-builder ^26, png-to-ico ^3, jimp (already installed), NSIS (bundled with electron-builder on Windows)

## Global Constraints

- Windows x64 only for this plan; cross-platform targets are out of scope
- `dist/` is already in `.gitignore` — do not change that
- No changes to `main.js`, `preload.js`, `dialog-preload.js`, or any file under `app/`
- `oneClick: true` + `perMachine: false` — installs per-user with no UAC prompt
- `build/icon.ico` must be committed to git (it is a build prerequisite, not an output artifact)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Modify | Add devDependencies, `"build"` config block, `dist`/`pack` scripts |
| `scripts/generate-icons.js` | Modify | Add `generateIco()` to produce `build/icon.ico` |
| `build/icon.ico` | Create (generated) | Multi-resolution Windows icon — committed to git |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json` (devDependencies section only)

**Interfaces:**
- Produces: `electron-builder` CLI available as `npx electron-builder`; `png-to-ico` available via `require('png-to-ico')`

- [ ] **Step 1: Install electron-builder and png-to-ico**

```powershell
npm install --save-dev electron-builder png-to-ico
```

Expected output: both packages appear under `devDependencies` in `package.json` with resolved version numbers.

- [ ] **Step 2: Verify electron-builder is available**

```powershell
npx electron-builder --version
```

Expected: prints a version number like `25.x.x`, no errors.

- [ ] **Step 3: Commit**

```powershell
git add package.json package-lock.json
git commit -m "chore: add electron-builder and png-to-ico devDependencies"
```

---

## Task 2: Extend icon generator to produce build/icon.ico

**Files:**
- Modify: `scripts/generate-icons.js`
- Create: `build/icon.ico` (generated then committed)

**Interfaces:**
- Consumes: `jimp` (already installed), `png-to-ico` (installed in Task 1)
- Produces: `build/icon.ico` — a multi-resolution Windows ICO containing 16, 32, 48, 64, 128, 256 px frames

- [ ] **Step 1: Replace scripts/generate-icons.js with the updated version**

The refactor extracts the pixel-drawing logic into `makeImage(size)` (returns a Jimp image without writing it) so it can be reused for both the PWA PNGs and the ICO frames. The existing `generate(size)` function now calls `makeImage()` internally — behaviour is unchanged. A new `generateIco()` renders all ICO sizes into a temp directory, packs them with `png-to-ico`, and writes `build/icon.ico`.

Full file content:

```js
const Jimp     = require('jimp');
const pngToIco = require('png-to-ico').default;
const path     = require('path');
const fs       = require('fs');
const os       = require('os');

const OUT       = path.join(__dirname, '..', 'app', 'icons');
const BUILD_DIR = path.join(__dirname, '..', 'build');
const ICO_SIZES = [16, 32, 48, 64, 128, 256];

fs.mkdirSync(OUT, { recursive: true });

async function makeImage(size) {
  const img = new Jimp(size, size, 0x141414ff);
  const cx = size / 2;
  const cy = size / 2;
  const bw = size * 0.55;
  const bh = size * 0.80;
  const br = size * 0.18;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ax = Math.abs(x - cx);
      const ay = Math.abs(y - cy);
      const dx = Math.max(0, ax - (bw / 2 - br));
      const dy = Math.max(0, ay - (bh / 2 - br));
      if (ax <= bw / 2 && ay <= bh / 2 && Math.hypot(dx, dy) <= br) {
        img.setPixelColor(0x2a2a2aff, x, y);
      }
    }
  }

  const ringR = size * 0.15;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.hypot(x - cx, y - cy) <= ringR) {
        img.setPixelColor(0x1e1e1eff, x, y);
      }
    }
  }

  return img;
}

async function generate(size) {
  const img = await makeImage(size);
  await img.writeAsync(path.join(OUT, `icon-${size}.png`));
  console.log(`  icon-${size}.png`);
}

async function generateIco() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tvremote-ico-'));
  try {
    const pngPaths = [];
    for (const size of ICO_SIZES) {
      const img = await makeImage(size);
      const p   = path.join(tmpDir, `icon-${size}.png`);
      await img.writeAsync(p);
      pngPaths.push(p);
    }
    const buf = await pngToIco(pngPaths);
    fs.mkdirSync(BUILD_DIR, { recursive: true });
    fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), buf);
    console.log('  build/icon.ico');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

(async () => {
  console.log('Generating icons…');
  await generate(192);
  await generate(512);
  await generateIco();
  console.log('Done.');
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the icon generator**

```powershell
npm run icons
```

Expected output:
```
Generating icons…
  icon-192.png
  icon-512.png
  build/icon.ico
Done.
```

- [ ] **Step 3: Verify the ICO file was created**

```powershell
Get-Item "build/icon.ico" | Select-Object Name, Length
```

Expected: `icon.ico` with a size greater than 10 KB (the multi-resolution ICO is typically 150–300 KB).

- [ ] **Step 4: Commit the updated script and the generated icon**

```powershell
git add scripts/generate-icons.js build/icon.ico
git commit -m "feat: generate multi-resolution build/icon.ico for Windows packaging"
```

---

## Task 3: Add electron-builder config and scripts to package.json

**Files:**
- Modify: `package.json` — add `"scripts".dist`, `"scripts".pack`, and top-level `"build"` key

**Interfaces:**
- Consumes: `build/icon.ico` (created in Task 2)
- Produces: `npm run pack` builds an unpacked app to `dist/win-unpacked/`; `npm run dist` builds installer + portable to `dist/`

- [ ] **Step 1: Add dist and pack scripts to package.json**

In the `"scripts"` object, add two entries (keep all existing scripts):

```json
"pack": "electron-builder --dir",
"dist": "electron-builder"
```

- [ ] **Step 2: Add the "build" configuration block to package.json**

Add the following as a top-level key in `package.json` (at the same level as `"scripts"`, `"devDependencies"`, etc.):

```json
"build": {
  "appId": "com.kiforsbe.tvremote",
  "productName": "TV Remote",
  "icon": "build/icon.ico",
  "files": [
    "main.js",
    "preload.js",
    "dialog-preload.js",
    "ip-dialog.html",
    "app/**"
  ],
  "directories": {
    "output": "dist"
  },
  "win": {
    "target": [
      { "target": "nsis",     "arch": ["x64"] },
      { "target": "portable", "arch": ["x64"] }
    ]
  },
  "nsis": {
    "oneClick": true,
    "perMachine": false,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "TV Remote"
  }
}
```

- [ ] **Step 3: Run pack to verify the app bundles correctly**

```powershell
npm run pack
```

Expected: completes without errors. Verify the output:

```powershell
Get-ChildItem dist/win-unpacked | Select-Object Name
```

Expected: directory listing includes `"TV Remote.exe"` and supporting Electron files (`resources/`, `locales/`, etc.).

- [ ] **Step 4: Smoke-test the packed app**

```powershell
Start-Process "dist/win-unpacked/TV Remote.exe"
```

Expected: the TV Remote window appears and behaves normally (same as `npm start`). Close it when satisfied.

- [ ] **Step 5: Commit**

```powershell
git add package.json
git commit -m "feat: add electron-builder config for Windows NSIS installer and portable build"
```

---

## Task 4: Build and verify dist artifacts

**Files:**
- No source changes — this task runs the build and verifies output

**Interfaces:**
- Consumes: all config from Tasks 1–3

- [ ] **Step 1: Run the full dist build**

```powershell
npm run dist
```

Expected: completes without errors. The build produces two targets under `dist/`. This may take 1–3 minutes on first run (electron-builder downloads Electron binaries if not cached).

- [ ] **Step 2: Verify both artifacts exist**

```powershell
Get-ChildItem dist | Where-Object { $_.Name -like "*.exe" } | Select-Object Name, Length
```

Expected output (version numbers match `package.json`):
```
TV Remote Setup 1.0.0.exe      (NSIS installer, typically 60–80 MB)
TV Remote Portable 1.0.0.exe   (portable exe, typically 60–80 MB)
```

- [ ] **Step 3: Test the portable executable**

```powershell
Start-Process "dist/TV Remote Portable 1.0.0.exe"
```

Expected: the TV Remote window opens without installation. Verify it connects to a TV or at least shows the UI correctly.

- [ ] **Step 4: Test the installer**

Run `dist\TV Remote Setup 1.0.0.exe` manually (double-click in Explorer or via PowerShell). Expected:
- Installs silently with no UAC prompt (per-user install)
- Creates a Start Menu entry under `TV Remote`
- Creates a desktop shortcut named `TV Remote`
- The installed app launches correctly

Verify uninstall also works via Settings → Apps → TV Remote → Uninstall.

- [ ] **Step 5: Commit the final state**

The `dist/` artifacts are gitignored and are not committed. This commit captures any package.json lock file changes from the build:

```powershell
git status
# If package-lock.json changed (unlikely), add it:
git add package-lock.json
git commit -m "chore: verify dist build produces installer and portable artifacts" --allow-empty
```

Use `--allow-empty` only if there are no actual file changes to commit — this records the milestone in history.
