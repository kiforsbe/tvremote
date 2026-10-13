# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

Add every user-visible change under `## [Unreleased]` as you make it. Releases are
cut with `npm run release` (see DEVELOPMENT.md), which turns that section into a versioned one.

## [Unreleased]

## [1.1.0] - 2026-10-13

### Added
- **Aa** button opening a "Type on TV" window with two modes:
  - *Live keys*: type directly (no field to focus); the buffer is mirrored to the TV, Enter accepts the entry, arrows act as remote keys.
  - *Text*: edit a string, then send it all at once and accept.
- Trackpad in the same window: drag to move the TV cursor, tap to left-click, right-click to right-click, and a **Capture mouse** mode that keeps the mouse locked until Ctrl+Alt.

## [1.0.0] - 2026-06-22

Initial feature set (built and used locally; first tagged as part of the release tooling).

### Added
- Windows desktop remote: frameless, transparent overlay with Samsung Tizen WebSocket control (navigation, volume/channel, colour, transport, source, guide, captions, info, exit, numpad), global media-key shortcuts, remembered TV auth token.
- SSDP auto-discovery of Samsung TVs and a first-run IP/pairing flow.
- App launcher: regional app catalog, a 4 320-app Samsung database with search, pinned apps, drag-to-reorder drawer, and an app manager (sync with TV, reset to defaults, per-app ID override).
- YouTube deep-link: shift-click on desktop, or tap on mobile, to play a video by URL or ID; long-press on mobile.
- Mobile UI for iPhone/browser, served by the desktop app (proxying the TV WebSocket and REST calls), installable as a PWA.
- Windows installer and portable builds via electron-builder, and a manual GitHub Actions release workflow.

[Unreleased]: https://github.com/kiforsbe/tvremote/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/kiforsbe/tvremote/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/kiforsbe/tvremote/releases/tag/v1.0.0
