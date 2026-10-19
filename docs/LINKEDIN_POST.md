# LinkedIn launch post

Three options below, written for a **personal** profile (founder voice out-reaches a company page by a wide margin). The link goes in the **first comment**, not the body, because LinkedIn suppresses posts with external links. Keep the swear censored exactly like the project name; it's part of the joke and keeps it LinkedIn-safe.

**Recommendation: post Option A.** It's the one with a real story, it earns the "…see more" tap in the first line, and it closes on a question people actually want to answer. Options B and C are there if you'd rather lead with the opinion or the build.

---

## Option A — the story (recommended)

```
I have 12 Chrome windows open. Somewhere in there, a song just started playing. I could not find it.

Not in 30 seconds. Not in 2 minutes.

Meanwhile I'm on a call. Muted. Clicking through windows like a raccoon in a dumpster.

Chrome puts a tiny speaker icon on the noisy tab. Great. Which window? Which of the 800 tabs?

So we built the dumbest, most necessary tool I've shipped this year.

It's called WhatTheF*#%IsPlayingMusicRightNow. Yes. That's the actual name.

It does two things:

1. Shows every tab making noise, in every window, and jumps you straight to it. The page flashes pink. The tab title blinks. You will find it.

2. One big button: PAUSE EVERYTHING. Music, videos, autoplay ads, every window, one click.

The part I actually care about: it never touches your calls. Teams, Meet, Zoom, Discord, Slack huddles, or any tab that has your mic open. Pause everything, stay on the call, nobody notices.

Free. Open source. No account, no tracking, nothing leaves your machine. The README is written so that someone who has never seen GitHub can install it in five minutes.

Link in the first comment.

What's the small, stupid, daily problem you'd fix if you had an afternoon? I'm collecting them.

#chromeextension #opensource #productivity #buildinpublic #remotework
```

**First comment (post this immediately after):**

```
Here it is: https://github.com/chchchadzilla/WhatTheFIsPlayingMusicRightNow

Install = download ZIP → chrome://extensions → Developer mode → Load unpacked → pick the folder. Five minutes, no coding. Full step-by-step in the README.
```

---

## Option B — the opinion

```
The best productivity tools are embarrassingly specific.

Not "manage your tasks." Not "focus better."

More like: "which of my 800 tabs is playing music right now, and make it stop without hanging up my call."

That's a real problem I have several times a week, and every general-purpose tool politely ignores it.

So we built a Chrome extension that does exactly that and nothing else. It finds the noisy tab in any window, flashes it so you can't miss it, and has one giant PAUSE EVERYTHING button that leaves Teams, Meet, Zoom and anything using your mic alone.

It's called WhatTheF*#%IsPlayingMusicRightNow, because naming things honestly is also a productivity hack.

Free and open source. Link in the first comment.

What's the embarrassingly specific tool you wish existed?

#productivity #opensource #chromeextension #buildinpublic
```

---

## Option C — the build

```
We shipped a Chrome extension in an afternoon. Here's what it does and what surprised me building it.

The problem: 12 windows, 800 tabs, a song starts, you can't find it, you're on a call.

The tool: WhatTheF*#%IsPlayingMusicRightNow. Finds the noisy tab in any window, flashes it, and pauses everything with one button. Never touches your calls or your mic.

Three things I didn't expect:

1. Chrome already knows which tabs are making noise, across every window. Nobody had put a button on it.

2. "Pause everything" is easy. "Pause everything except the human talking to you" is the whole product. We solved it with a protected-sites list plus detecting when a page has your microphone open.

3. Chrome keeps a tab flagged as "making sound" for two seconds after it stops. So "did the pause work?" needs a 3.5-second re-check. Tiny detail, took longer than the UI.

Built with Claude Code as cofounder, the whole thing is ~1,200 lines of plain JavaScript, no dependencies, no build step, no tracking.

Free, open source, link in the first comment. README is written for people who have never seen GitHub.

Builders: what's the "small detail that took longer than the feature" on your last project?

#buildinpublic #chromeextension #opensource #ai #productivity
```

---

## Posting checklist

- Post from your personal profile, not the company page (repost from the page afterwards if you want).
- Paste the link as the **first comment** within a minute of posting.
- Reply to every comment in the first hour; the algorithm rewards it.
- Best windows: Tue–Thu, 7–9am or 11:30am–1pm in your audience's time zone.
- Optional: attach `assets/social-preview.png` as the image, or post the link-in-comment with no image and let the text carry it. Text-only often out-performs on LinkedIn; test both.
