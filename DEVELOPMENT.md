# Development

Developer notes for working on TV Remote. User-facing docs are in [README.md](README.md).

## Running

```powershell
npm install
npm start          # launches the Electron app
```

If `npm start` crashes with `ipcMain` undefined, `ELECTRON_RUN_AS_NODE` is set in your
environment — clear it first (`Remove-Item Env:ELECTRON_RUN_AS_NODE`).

## Tests

| Command | What it runs |
|---|---|
| `npm test` / `npm run test:unit` | Jest unit tests (`tests/unit`) |
| `npm run test:blackbox` | Jest tests against the HTTP/WebSocket proxy server |
| `npm run test:e2e` | Playwright GUI tests |

## Changelog

[CHANGELOG.md](CHANGELOG.md) follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

- Every user-visible change (feature, fix, behaviour change, removal) gets a bullet under
  `## [Unreleased]` **in the same commit as the change**. Use the standard groups: `Added`,
  `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
- Don't list pure refactors, tests, CI or docs-only changes unless they affect users.
- Never edit version sections by hand after release, and never edit the compare links at the
  bottom — the release script regenerates them.

## Releases

Versions follow [SemVer](https://semver.org/). The single source of truth is `package.json`;
`package-lock.json` and `CHANGELOG.md` are updated from it by the release script. Do not
bump versions by hand.

### 1. Cut the release locally

From a clean working tree on `main`, with entries under `[Unreleased]`:

```powershell
npm run release -- patch        # or: minor | major | 1.4.0
npm run release -- minor --dry-run   # preview only, changes nothing
```

`scripts/release.js` then:

1. refuses to run if the tree is dirty, the tag already exists, or `[Unreleased]` is empty;
2. updates `version` in `package.json` and `package-lock.json`;
3. turns `## [Unreleased]` into `## [x.y.z] - <date>`, adds a fresh empty `[Unreleased]`, and
   regenerates the compare links in `CHANGELOG.md`;
4. commits as `chore(release): vx.y.z` and creates the annotated tag `vx.y.z`.

It never pushes. If the version appears anywhere else (for example a version badge or
download text in `README.md`), update it in the same release commit before tagging, or
extend `scripts/release.js` to do so.

`1.0.0` is already recorded in the changelog as the initial feature set but has no git tag
yet; the next release (e.g. `npm run release -- minor` → 1.1.0) compares against `v1.0.0`.
Tag the baseline commit (`git tag -a v1.0.0 <commit>`) if you want that link to resolve.

### 2. Publish

```powershell
git push origin main vx.y.z
gh workflow run release.yml -f tag=vx.y.z          # draft release (default)
gh workflow run release.yml -f tag=vx.y.z -f draft=false   # publish immediately
```

The workflow ([.github/workflows/release.yml](.github/workflows/release.yml)) runs on
`windows-latest`, checks out the tag, runs `npm ci` and `npm run dist`, and attaches
`dist/*.exe` to a GitHub Release. The release notes are the matching `## [x.y.z]` section of
`CHANGELOG.md` (extracted by `node scripts/release.js --notes x.y.z`); the workflow fails if
that section is missing or empty. Review the draft on GitHub and
publish it.

## Packaging

Packaging is done by [electron-builder](https://www.electron.build/) via `npm run dist`
(which passes `--publish never`: electron-builder must only build, never try to publish —
it would demand a `GH_TOKEN`; the workflow publishes the release itself)
(`npm run pack` builds an unpacked directory only, for quick inspection). Output goes to
`dist/`:

- `TV Remote Setup x.y.z.exe` — NSIS installer (per-user)
- `TV Remote x.y.z.exe` — portable executable

The build config lives in the `build` block of `package.json`. Its `files` list is an
allowlist: **any new top-level file the app needs at runtime (HTML windows, preload
scripts, data files) must be added to `build.files`**, or it will be missing from the packaged
app even though `npm start` works. Files under `app/` are covered by `app/**`.

Build on Windows; cross-compiling the NSIS installer from Linux needs Wine and isn't supported.
