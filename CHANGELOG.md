# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

Add every user-visible change under `## [Unreleased]` as you make it. Releases are
cut with `npm run release` (see AGENTS.md), which turns that section into a versioned one.

## [Unreleased]

### Added
- Windows remote, mobile UI and Samsung Tizen WebSocket control (keys, numpad, colour, transport buttons).
- SSDP auto-discovery of Samsung TVs and a first-run IP/pairing flow; the TV auth token is remembered.
- App launcher with a regional app catalog, a 4 320-app Samsung database, drag-to-reorder drawer and app manager (sync with TV, reset to defaults).
- YouTube deep-link: shift-click on desktop, or tap on mobile, to play a video by URL or ID; long-press on mobile.
- Desktop-served mobile UI for iPhone/browser, proxying the TV WebSocket and REST calls.
- **Aa** button opening a "Type on TV" window with two modes:
  - *Live keys*: type directly (no field to focus); the buffer is mirrored to the TV, Enter accepts the entry, arrows act as remote keys.
  - *Text*: edit a string, then send it all at once and accept.
- Trackpad in the same window: drag to move the TV cursor, tap to left-click, right-click to right-click, and a **Capture mouse** mode that keeps the mouse locked until Ctrl+Alt.
- GitHub Actions workflow to build and publish the Windows installer and portable exe.

[Unreleased]: https://github.com/kiforsbe/tvremote/commits/main
