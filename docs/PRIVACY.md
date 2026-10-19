# Privacy Policy — WhatTheF*#%IsPlayingMusicRightNow

**Last updated: 2026-10-19**

## The short version

This extension does not collect, store, transmit, sell or share any data about you. It has no server. It makes no network requests. There is no account. Everything it does happens inside your browser on your computer.

## What the extension can see, and what it does with it

| Data | Why it's touched | Where it goes |
|---|---|---|
| Which tabs are currently producing sound, plus their titles, addresses and favicons | To show you a list of noisy tabs and jump you to one | Displayed in the panel. Never stored, never sent anywhere. |
| Whether a web page currently holds an open microphone stream (yes/no) | To treat that tab as a call and avoid pausing it | A single attribute on the page's `<html>` element. The audio itself is never accessed. |
| The media players (`<audio>`/`<video>`) inside pages | To press pause and later resume | A marker attribute is added to players the extension paused so Resume can find exactly those. |
| Your settings (list of protected sites, a few on/off switches) | So they persist | `chrome.storage.sync`, which Chrome may sync to your Google account like any extension's settings. |
| A list of tab IDs the extension just paused or muted | So Resume can undo it | `chrome.storage.session`, which Chrome erases when the browser closes. |

## Permissions explained

- **`tabs`** — lets the extension read each tab's title, URL and "audible" flag. Chrome labels this permission *Read your browsing history* in the install dialog. The extension does not read or store your history; it only looks at currently open tabs when you open the panel or press a shortcut.
- **`scripting` + host permission for all sites** — lets the extension run its pause/resume/flash functions inside the page that is making noise, on whatever site that happens to be. Chrome labels this *Read and change all your data on all websites*. The extension only ever runs those specific functions, only on tabs that are audible or that you clicked, and never reads page content.
- **`storage`** — saves your settings.
- **`notifications`** — shows the silent "Paused 3 tabs" message after a keyboard shortcut.

The extension does **not** request microphone, camera, audio-capture, history, bookmarks, cookies, downloads, or any network-related permission.

## Children

The extension collects no data from anyone, including children.

## Changes

If this policy ever changes, the change will be visible in this file's history in the public repository.

## Contact

Open an issue on the GitHub repository.
