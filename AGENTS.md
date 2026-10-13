# Agent instructions

Electron (Windows) + mobile web UI Samsung TV remote. Read [DEVELOPMENT.md](DEVELOPMENT.md)
for running, testing, releases and packaging — this file only lists the rules to follow
every time.

## Always

- **Keep [CHANGELOG.md](CHANGELOG.md) current.** Any user-visible change (feature, fix,
  behaviour change, removal) adds a bullet under `## [Unreleased]` in the same commit as the
  change. See "Changelog" in DEVELOPMENT.md for the format.
- **Add new runtime files to `build.files` in `package.json`** (HTML windows, preload scripts,
  data files outside `app/`), or the packaged app will break.
- Run only the tests that cover what you changed (`npx jest tests/unit/<file>`).
- Never push, tag or trigger the release workflow unless the user asks.

## Releases

When the user asks to tag/release a version, follow "Releases" in DEVELOPMENT.md: run
`npm run release -- <patch|minor|major|x.y.z>` — don't edit `package.json`, the lockfile or
the changelog's version sections by hand. The script updates the version files and
CHANGELOG.md, commits and tags locally; then tell the user the push and
`gh workflow run release.yml -f tag=vX.Y.Z` commands rather than running them. If the
version is referenced anywhere else (README, docs), update those in the same release commit.
Packaging details are in the "Packaging" section of DEVELOPMENT.md.
