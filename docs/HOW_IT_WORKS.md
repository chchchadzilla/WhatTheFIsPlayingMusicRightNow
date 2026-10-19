# How it works

The whole thing is ~900 lines of dependency-free JavaScript, but a few decisions are non-obvious. This is the "why" file.

## The moving parts

```
┌─────────────────────────┐   messages    ┌──────────────────────────────┐
│ popup / options page    │ ────────────► │ background.js (service worker)│
│ (src/popup, src/options)│ ◄──────────── │  scan · pause · resume · locate│
└─────────────────────────┘               └───────────────┬──────────────┘
                                                          │ chrome.scripting.executeScript({ func })
                                                          ▼
                                          ┌──────────────────────────────┐
                                          │ web page (every frame)        │
                                          │  injected.js functions run    │
                                          │  here: pause / resume / probe │
                                          │  / flash                      │
                                          │                               │
                                          │  mic-sentinel.js is ALWAYS    │
                                          │  here (MAIN world) and sets   │
                                          │  <html data-wtf-mic="1">      │
                                          └──────────────────────────────┘
```

- **`background.js`** is a Manifest V3 service worker. Chrome kills it after ~30s of idling, so it stores nothing in variables: settings live in `chrome.storage.sync`, "what did we just pause" lives in `chrome.storage.session`.
- **`injected.js`** exports plain functions. The service worker passes them to `chrome.scripting.executeScript({ func })`, which *stringifies* the function and runs it inside the page. That's why every function in that file is self-contained with no imports.
- **`mic-sentinel.js`** is the only always-on content script. It's ~40 lines and runs in the page's MAIN world at `document_start` so it can wrap `navigator.mediaDevices.getUserMedia` before the page calls it.

## Finding the noise

Chrome already knows which tabs are producing sound: `chrome.tabs.query({ audible: true })` returns them across **every window of the profile**. That's the entire "find it" feature. The `tabs` permission is what lets us read each tab's title/URL to show you a useful list, and `chrome.windows.getAll()` lets us say "window 7 of 12".

A muted tab that's still playing is still `audible: true` (Chrome's definition is "producing sound", not "you can hear it"), so the panel shows it with a 🔇 and you can still jump to it.

## Pausing: elements first, tab-mute second

There are two ways to silence a tab:

1. **Pause the player.** Inject a function that finds every `<audio>` and `<video>` element (including inside open shadow roots and in every iframe), skips the ones that are already paused or muted, and calls `.pause()`. Each element we pause gets a `data-wtf-paused` attribute so Resume can find exactly those and nothing else. This is what you want 95% of the time: YouTube, Spotify web, SoundCloud, Netflix, podcasts, news sites, autoplay ads.
2. **Mute the tab.** `chrome.tabs.update(id, { muted: true })`. Blunt, always works, but it's a hammer: the player keeps running silently and you lose your place in a live stream.

So PAUSE EVERYTHING tries (1) first. If a tab had *zero* pausable elements (Web Audio apps, browser games, PDF viewers, pages we can't script like `chrome://`), it falls back to (2) immediately.

### The stubborn-tab check

Here's the subtle bit. Chrome keeps a tab flagged `audible` for roughly **two seconds after sound actually stops** (it's a hysteresis to stop the speaker icon flickering). So right after pausing we can't tell "paused successfully" from "still blasting". The service worker therefore schedules a check **3.5 seconds later**: any tab we paused that is *still* audible, and whose paused elements the user hasn't deliberately un-paused, gets muted after all.

Before muting, it runs `probePage()` in the tab to see whether any `data-wtf-paused` element is playing again. If the human already hit play on purpose, we leave it alone.

### Resume

`lastPause` in session storage is a list of `{ tabId, pausedCount, muted }`. Resume runs `resumeMediaInPage()` (plays only elements marked `data-wtf-paused`) and un-mutes only tabs *we* muted. Pauses within 10 minutes of each other merge into one list, so pausing twice doesn't orphan the first batch. Session storage is wiped when Chrome closes, which is the right lifetime for "undo my last pause".

`element.play()` can be rejected by autoplay policy if the page hasn't had recent user interaction. We count those and the panel tells you to press play yourself.

## Not hanging up on your boss

Two independent guards, either one is enough to protect a tab:

**1. Protected sites** — a domain list (`src/shared/defaults.js`), matched as "equals or is a subdomain of". `zoom.us` covers `us05web.zoom.us`. Editable in Settings; the 🛡 button in the panel adds the current site.

**2. The mic sentinel** — the content script wraps `getUserMedia`. When a page asks for audio and gets a stream, each live audio track is counted; on `track.stop()` or `ended` it's uncounted. The count is mirrored to an attribute on `<html>` (`data-wtf-mic="1"`). Attributes are shared between the page's world and the extension's isolated world, so `probePage()` (injected on demand) can just read it. No messaging, no state in the worker.

Why an attribute instead of messaging the service worker? Because the worker is ephemeral. The page is the source of truth for "is the mic open right now", so we ask the page at the moment we need to know.

Why MAIN world? Content scripts normally run in an isolated world with their own copy of `navigator`. To intercept the page's *own* `getUserMedia` calls we have to patch the real one, which means running in the page's world. Manifest V3 supports this directly via `"world": "MAIN"` (Chrome 111+).

**What "mute" can and can't do to your mic:** `chrome.tabs.update({ muted })` only affects a tab's *output*. It cannot touch capture. The extension never requests microphone access, so it has no handle to your mic at all.

## The flash

`flashPage()` is injected into the tab you asked to see. It:

- Appends a fixed, full-viewport `div` with an inset pink box-shadow, animated with the Web Animations API (`element.animate`), so no stylesheet is needed and page CSP can't block it.
- Appends a pill with the text, a **Pause it** button (pauses media in that page directly) and **Got it**.
- Blinks `document.title` every 500 ms between the page's title and `🔊🔊🔊 THIS ONE 🔊🔊🔊`, re-capturing the original if the page changes it mid-flash, and restoring it at the end.
- Stores its cleanup function on `globalThis` so a second flash on the same page replaces the first instead of stacking.

All styles are set via `element.style.cssText` (CSSOM), which pages' Content-Security-Policy headers don't restrict. Injected `<style>` tags sometimes are.

Before injecting, the worker un-minimizes the window if needed, focuses it, asks for `drawAttention` (which flashes the taskbar entry if the OS refused to let Chrome steal focus), and activates the tab.

## The badge

`chrome.action.setBadgeText` with the count of noisy tabs. It's refreshed on `tabs.onUpdated` (only when `audible`, `mutedInfo` or `url` changed, which keeps it cheap), `tabs.onRemoved`, `windows.onRemoved`, settings changes, and whenever the worker starts. The badge path skips the mic probe (it would mean injecting a script into every audible tab on every event); the panel does the full classification when opened.

## Things that are deliberately not here

- **No `chrome.alarms`.** The 3.5-second stubborn check is a plain `setTimeout`. MV3 alarms have a 30-second minimum; a `setTimeout` that short is fine because the worker stays alive well past it after doing real work.
- **No Web Audio interception.** We could wrap `AudioContext` in the MAIN world and call `.suspend()` on PAUSE EVERYTHING. It's tempting but it would silence legitimate call audio on sites that route calls through Web Audio (Discord does). Muting the tab, and protecting call tabs, is the safer trade.
- **No `chrome.tabCapture`, no audio processing of any kind.** We never touch the audio data; we only ask Chrome whether a tab is audible.
- **No cross-browser magic.** An extension sees its own browser's windows and nothing else. The roadmap's "desktop companion" would use native messaging to send a system media-pause key for Spotify-style apps; that's a separate project with a separate install.
