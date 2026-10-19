# Contributing

Thanks for wanting to make the music stop faster.

## Ground rules

1. **Never touch the user's microphone.** No `getUserMedia` calls, no audio capture permissions, no exceptions. "Mute" in this project only ever means a tab's output.
2. **Never hang up on a human.** Any change to pausing/muting must keep protected sites and mic-detected tabs untouched. If you add a new way to silence something, add the corresponding guard.
3. **Zero dependencies, zero build step.** Plain JavaScript that Chrome loads as-is. If a feature truly needs a library, open an issue first.
4. **Nothing leaves the machine.** No analytics, no network requests, no remote code.

## Setup

```bash
git clone https://github.com/chchchadzilla/WhatTheFIsPlayingMusicRightNow.git
```
Then `chrome://extensions` → Developer mode → Load unpacked → pick the folder. After every edit, click ↻ on the extension's card. The service worker's console is behind the **service worker** link on that card; the popup's console is right-click → Inspect on the open popup.

```bash
node tools/validate.mjs     # manifest, icons, syntax, CSP sanity
```

## Making changes

- Open an issue for anything bigger than a bug fix so we can agree on the approach first.
- Keep `src/injected.js` functions self-contained; they are stringified and run inside web pages.
- If you touch `manifest.json` permissions, update the justification tables in `CHROMEWEBSTORE.md` and `docs/PRIVACY.md`.
- If you change images, edit the source in `tools/assets-src/` and re-run `node tools/build-assets.mjs`; don't hand-edit PNGs.
- Add a line to `CHANGELOG.md` under an "Unreleased" heading.

## Testing checklist for pull requests

Please run through this in a clean Chrome profile before opening a PR:

- [ ] Badge count updates when a tab starts/stops playing
- [ ] "Show me" focuses a tab in a *different* window and flashes it
- [ ] PAUSE EVERYTHING pauses YouTube + Spotify web in two windows
- [ ] A Google Meet / Teams tab (or any tab with the mic open) is listed under "Calls & meetings" and untouched
- [ ] Resume brings back what was paused and un-mutes what was muted
- [ ] A tab with only Web Audio (e.g. an online synth) gets muted, not ignored
- [ ] Keyboard shortcuts work from a tab in another window
- [ ] `node tools/validate.mjs` passes

## Reporting bugs

Use the bug template. Include your Chrome version (`chrome://version`), the site that misbehaved, and anything printed in the service worker console.
