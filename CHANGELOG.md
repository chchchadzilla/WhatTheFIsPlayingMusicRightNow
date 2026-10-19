# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [SemVer](https://semver.org/).

## [1.0.0] — 2026-10-19

### Added
- Toolbar badge showing how many tabs are making noise across every window (red), or that only calls are making sound (green).
- Panel listing every audible tab with its window number, plus **Show me** (focus window, activate tab, flash page, blink title), per-tab pause, and one-click "this is a call" protection.
- **PAUSE EVERYTHING**: pauses `<audio>`/`<video>` in every noisy tab (including iframes and open shadow DOM); tabs with nothing pausable are muted instead; a 3.5 s follow-up mutes anything still audible.
- **Resume**: un-pauses exactly what was paused and un-mutes exactly what was muted.
- Protected-sites list (Teams, Meet, Zoom, Discord, Slack, Webex, Whereby and ~30 more), editable in settings.
- Microphone-based call detection: any tab with an open mic stream is treated as a call.
- Keyboard shortcuts: Alt+Shift+P (pause everything), Alt+Shift+F (find the noise, cycles), Alt+Shift+M (open panel).
- Optional one-click mode: clicking the toolbar icon pauses everything instantly with a silent notification.
- Settings page with welcome tour on first install.
- Zero-dependency tooling: `tools/validate.mjs`, `tools/build-assets.mjs`, packaging scripts, GitHub Actions validation.
