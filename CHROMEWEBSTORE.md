# Chrome Web Store listing — working file

Everything needed to fill in the Chrome Developer Dashboard, in one place. Copy-paste from here.

**Last updated:** 2026-10-19 · **Manifest version in repo:** 1.0.0 · **Status:** not yet submitted

> Reminder: the Web Store does not allow profanity in titles. The censored name `WhatTheF*#%IsPlayingMusicRightNow` is what's in the manifest; if the review team objects to the symbols, fall back to the short name **WTF Playing** with the full name in the description.

## Store listing

**Title (≤45 chars):** `WhatTheF*#%IsPlayingMusicRightNow`
**Fallback title:** `WTF Playing: find & pause noisy tabs`

**Summary (≤132 chars, same as manifest description):**
`Finds the tab playing music in any window, flashes it, and pauses everything with one button. Never touches calls or your mic.`

**Category:** Productivity → Workflow & Planning (or Tools)

**Language:** English

**Detailed description:**

```
You pressed play on something. Now it needs to stop, and it's somewhere in your 12 windows and 800 tabs.

WhatTheF*#%IsPlayingMusicRightNow does three things:

FINDS IT. A number on the toolbar icon shows how many tabs are making noise across every window. Open the panel to see them listed, click "Show me", and the extension brings that window to the front, switches to the tab, flashes a big pink frame around the page and blinks the tab title. You will find it.

PAUSES EVERYTHING. One big button pauses every audio and video player in every window. Anything that refuses to pause (browser games, Web Audio apps, PDFs) gets its tab muted instead. "Resume" undoes exactly what was paused or muted and nothing else.

NEVER TOUCHES YOUR CALLS. Teams, Google Meet, Zoom, Discord, Slack huddles, Webex, Whereby, Google Voice, WhatsApp, Messenger and 30+ other call and meeting sites are never paused or muted. If any tab has your microphone open, it's treated as a call too. Your microphone itself is never touched: the extension never asks for it.

Also:
• Keyboard shortcuts: Alt+Shift+P pauses everything from anywhere, Alt+Shift+F jumps to the noise.
• Optional one-click mode: clicking the icon pauses everything instantly.
• Editable list of protected sites. Mark any site as a call with one click.
• Works in Edge, Brave, Opera and Vivaldi too.

Privacy: no account, no server, no analytics, no network requests. Nothing leaves your computer. Open source under the MIT license.

Limits, honestly: a Chrome extension can only see Chrome. It can't pause Spotify's desktop app, another browser, or another Chrome profile.
```

## Permissions justification (copy into the dashboard)

| Permission | Justification |
|---|---|
| `tabs` | Required to list which open tabs are currently producing sound (`audible`), along with their title, URL and favicon, so the user can identify and jump to the noisy tab. No browsing history is read or stored. |
| `scripting` | Required to run the pause, resume and "flash this page" functions inside the tab that is making noise, and to check whether a page currently holds an open microphone stream so it can be protected as a call. |
| `storage` | Saves the user's settings (protected sites list, toggles) in sync storage, and the list of just-paused tabs in session storage so "Resume" can undo the pause. |
| `notifications` | Shows a silent confirmation ("Paused 3 tabs") after the keyboard shortcut, since there is no panel open to show it in. |
| Host permission `<all_urls>` | The tab making noise can be on any website, so the extension must be able to inject its pause/flash functions and its tiny microphone-detection script into any site. It never reads page content and makes no network requests. |

**Remote code:** No. All code is bundled.

**Single purpose:** Find and silence tabs that are playing audio, without affecting calls.

## Privacy & data use (dashboard form)

- Does the extension collect user data? **No.**
- Personally identifiable information: **not collected**
- Health, financial, authentication, personal communications, location, web history, user activity, website content: **not collected**
- Certifications: ✅ not selling data, ✅ not using data for unrelated purposes, ✅ not using data for creditworthiness
- Privacy policy URL: `https://github.com/chchchadzilla/WhatTheFIsPlayingMusicRightNow/blob/main/docs/PRIVACY.md`

## Assets

| Asset | Size | File | Status |
|---|---|---|---|
| Store icon | 128×128 PNG | `icons/icon-128.png` | ✅ generated |
| Screenshot 1 (panel) | 1280×800 or 640×400 | needs a real screenshot of the popup over a browser window | ⬜ todo |
| Screenshot 2 (flash) | 1280×800 | `assets/flash-preview.png` is 1200×700 — re-render at 1280×800 via `tools/build-assets.mjs` or capture live | ⬜ todo |
| Small promo tile | 440×280 | crop from `assets/banner.png` | ⬜ todo |
| Marquee promo tile (optional) | 1400×560 | re-render `banner.html` at 1400×560 | ⬜ todo |

## Packaging

```powershell
.\tools\package.ps1      # Windows → dist/WhatTheFIsPlayingMusicRightNow-1.0.0.zip
```
```bash
./tools/package.sh       # Mac/Linux
```

The zip contains only `manifest.json`, `src/`, `icons/`, `LICENSE`. Nothing else.

## Pre-submit checklist

- [ ] `node tools/validate.mjs` passes
- [ ] Version bumped in `manifest.json` and `CHANGELOG.md`
- [ ] Tested in a clean profile: install, pin, badge, show me, pause, resume, protected site, shortcuts
- [ ] Screenshots captured at an accepted size
- [ ] Privacy policy URL is live (push to GitHub first)
- [ ] Zip built from a clean checkout

## Version history

| Version | Date | Notes |
|---|---|---|
| 1.0.0 | 2026-10-19 | Initial release. |
