/**
 * background.js — the brain of WhatTheF*#%IsPlayingMusicRightNow.
 *
 * Runs as a Manifest V3 service worker, which means Chrome kills it after ~30s
 * of inactivity. Nothing important lives in variables: settings are in
 * chrome.storage.sync, "what did we just pause" is in chrome.storage.session.
 *
 * Responsibilities
 *   - Keep the toolbar badge showing how many tabs are making noise.
 *   - Scan every window for audible tabs and sort them into "noise" vs "calls".
 *   - PAUSE EVERYTHING: pause <audio>/<video> in noisy tabs; mute the stubborn ones.
 *   - Resume what we paused.
 *   - Locate a tab: focus its window, activate it, flash it so you can't miss it.
 */

import { DEFAULT_SETTINGS, hostnameOf, isProtectedHost, normalizeSite, uniqueSites } from './shared/defaults.js';
import { pauseMediaInPage, resumeMediaInPage, probePage, flashPage } from './injected.js';

const POPUP_PATH = 'src/popup/popup.html';
const STUBBORN_DELAY_MS = 3500; // Chrome keeps a tab marked "audible" ~2s after sound stops
const MERGE_WINDOW_MS = 10 * 60 * 1000; // pauses within 10 min share one "Resume" list
const BADGE_COLOR = { noisy: '#ff2d55', calls: '#1fbf8f' };

/* ------------------------------------------------------------------------ */
/* Settings                                                                 */
/* ------------------------------------------------------------------------ */

async function getSettings() {
  let stored = {};
  try {
    stored = await chrome.storage.sync.get(null);
  } catch {
    /* sync storage unavailable — fall back to defaults */
  }
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  settings.protectedSites = Array.isArray(settings.protectedSites)
    ? uniqueSites(settings.protectedSites)
    : [...DEFAULT_SETTINGS.protectedSites];
  return settings;
}

async function applyClickBehavior() {
  const settings = await getSettings();
  await chrome.action.setPopup({ popup: settings.clickBehavior === 'pause' ? '' : POPUP_PATH });
}

/* ------------------------------------------------------------------------ */
/* Scanning                                                                 */
/* ------------------------------------------------------------------------ */

/** Ask every frame of a tab whether the page has the microphone open. */
async function tabHasMicOpen(tabId) {
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: probePage,
    });
    return frames.some((f) => f && f.result && f.result.mic);
  } catch {
    return false; // chrome:// pages, the Web Store, etc. can't be scripted
  }
}

/**
 * Every audible tab in every window of this Chrome profile, tagged with why
 * it's protected (if it is).  protectedBy: null | 'site' | 'mic'
 */
async function scanTabs({ probeMic = true } = {}) {
  const settings = await getSettings();
  const [audible, windows] = await Promise.all([
    chrome.tabs.query({ audible: true }),
    chrome.windows.getAll(),
  ]);
  const windowNumber = new Map(windows.map((w, i) => [w.id, i + 1]));

  const tabs = [];
  for (const tab of audible) {
    const host = hostnameOf(tab.url);
    let protectedBy = null;
    if (isProtectedHost(host, settings.protectedSites)) protectedBy = 'site';
    else if (probeMic && settings.protectMicTabs && (await tabHasMicOpen(tab.id))) protectedBy = 'mic';

    tabs.push({
      id: tab.id,
      windowId: tab.windowId,
      windowNumber: windowNumber.get(tab.windowId) || 0,
      index: tab.index,
      title: tab.title || host || 'Untitled tab',
      url: tab.url || '',
      host,
      favIconUrl: tab.favIconUrl || '',
      muted: Boolean(tab.mutedInfo && tab.mutedInfo.muted),
      protectedBy,
    });
  }
  return { tabs, windowCount: windows.length, settings };
}

/* ------------------------------------------------------------------------ */
/* Badge                                                                    */
/* ------------------------------------------------------------------------ */

async function refreshBadge() {
  try {
    const { tabs, settings } = await scanTabs({ probeMic: false });
    if (!settings.showBadge) {
      await chrome.action.setBadgeText({ text: '' });
      await chrome.action.setTitle({ title: 'What the F*#% is playing music right now?' });
      return;
    }
    const noisy = tabs.filter((t) => !t.protectedBy).length;
    const calls = tabs.length - noisy;
    const text = noisy ? String(noisy) : calls ? String(calls) : '';
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: noisy ? BADGE_COLOR.noisy : BADGE_COLOR.calls });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    const title = noisy
      ? `${noisy} tab${noisy === 1 ? '' : 's'} making noise — click to find or pause`
      : calls
        ? `Only calls/meetings are making sound (${calls}) — they're protected`
        : 'Nothing is playing. Peace.';
    await chrome.action.setTitle({ title: `What the F*#% is playing? ${title}` });
  } catch (err) {
    console.warn('[WTF] badge refresh failed', err);
  }
}

/* ------------------------------------------------------------------------ */
/* Pause / resume                                                           */
/* ------------------------------------------------------------------------ */

/** Pause media in the given tabs. Returns one entry per tab describing what happened. */
async function pauseTabs(targets, settings) {
  const entries = [];
  for (const t of targets) {
    const entry = {
      tabId: t.id,
      windowId: t.windowId,
      title: t.title,
      host: t.host,
      pausedCount: 0,
      muted: false,
      scriptable: true,
    };
    try {
      const frames = await chrome.scripting.executeScript({
        target: { tabId: t.id, allFrames: true },
        func: pauseMediaInPage,
      });
      entry.pausedCount = frames.reduce((n, f) => n + ((f && f.result && f.result.paused) || 0), 0);
    } catch {
      entry.scriptable = false; // can't inject here (chrome://, PDF viewer, Web Store…)
    }
    // Nothing to pause but the tab is still noisy (Web Audio, games, PDFs)? Mute the tab itself.
    if (entry.pausedCount === 0 && settings.muteStubbornTabs && !t.muted) {
      try {
        await chrome.tabs.update(t.id, { muted: true });
        entry.muted = true;
      } catch {
        /* tab vanished */
      }
    }
    entries.push(entry);
  }
  return entries;
}

/** Keep one "Resume" list: merge new entries into a recent pause, or start fresh. */
async function mergeIntoLastPause(entries) {
  const { lastPause } = await chrome.storage.session.get('lastPause');
  const recent = lastPause && Date.now() - lastPause.at < MERGE_WINDOW_MS;
  const record = recent ? lastPause : { at: Date.now(), entries: [] };
  const ids = new Set(entries.map((e) => e.tabId));
  record.entries = record.entries.filter((e) => !ids.has(e.tabId)).concat(entries);
  record.at = Date.now();
  await chrome.storage.session.set({ lastPause: record });
  return record;
}

function scheduleStubbornCheck(settings) {
  if (!settings.muteStubbornTabs) return;
  setTimeout(() => {
    stubbornCheck().catch((err) => console.warn('[WTF] stubborn check failed', err));
  }, STUBBORN_DELAY_MS);
}

/** A few seconds after a pause: anything we "paused" that is STILL audible gets muted. */
async function stubbornCheck() {
  const { lastPause } = await chrome.storage.session.get('lastPause');
  if (!lastPause) return;
  const audible = await chrome.tabs.query({ audible: true });
  const stillNoisy = new Set(audible.filter((t) => !(t.mutedInfo && t.mutedInfo.muted)).map((t) => t.id));

  let changed = false;
  for (const entry of lastPause.entries) {
    if (entry.muted || !stillNoisy.has(entry.tabId)) continue;
    // If the human already pressed play again on purpose, leave it alone.
    let userResumed = false;
    try {
      const frames = await chrome.scripting.executeScript({
        target: { tabId: entry.tabId, allFrames: true },
        func: probePage,
      });
      userResumed = frames.some((f) => f && f.result && f.result.userResumed);
    } catch {
      /* unscriptable — mute it anyway */
    }
    if (userResumed) continue;
    try {
      await chrome.tabs.update(entry.tabId, { muted: true });
      entry.muted = true;
      changed = true;
    } catch {
      /* tab vanished */
    }
  }
  if (changed) await chrome.storage.session.set({ lastPause });
  await refreshBadge();
}

async function pauseEverything() {
  const { tabs, settings } = await scanTabs();
  const targets = tabs.filter((t) => !t.protectedBy);
  const protectedTabs = tabs.filter((t) => t.protectedBy);
  const entries = await pauseTabs(targets, settings);
  if (entries.length) await mergeIntoLastPause(entries);
  scheduleStubbornCheck(settings);
  await refreshBadge();
  return {
    paused: entries.filter((e) => e.pausedCount > 0).length,
    muted: entries.filter((e) => e.muted).length,
    untouched: protectedTabs.length,
    protectedTabs: protectedTabs.map((t) => ({ title: t.title, host: t.host, why: t.protectedBy })),
    entries,
  };
}

async function pauseOne(tabId) {
  const settings = await getSettings();
  const tab = await chrome.tabs.get(tabId);
  const target = {
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title || '',
    host: hostnameOf(tab.url),
    muted: Boolean(tab.mutedInfo && tab.mutedInfo.muted),
  };
  const entries = await pauseTabs([target], settings);
  await mergeIntoLastPause(entries);
  scheduleStubbornCheck(settings);
  await refreshBadge();
  return {
    paused: entries[0].pausedCount > 0 ? 1 : 0,
    muted: entries[0].muted ? 1 : 0,
    untouched: 0,
    protectedTabs: [],
    entries,
  };
}

async function resumeLastPause() {
  const { lastPause } = await chrome.storage.session.get('lastPause');
  if (!lastPause) return { resumed: 0, unmuted: 0, failed: 0 };

  let resumed = 0;
  let unmuted = 0;
  let failed = 0;
  for (const entry of lastPause.entries) {
    if (entry.pausedCount > 0) {
      try {
        const frames = await chrome.scripting.executeScript({
          target: { tabId: entry.tabId, allFrames: true },
          func: resumeMediaInPage,
        });
        const ok = frames.reduce((n, f) => n + ((f && f.result && f.result.resumed) || 0), 0);
        const bad = frames.reduce((n, f) => n + ((f && f.result && f.result.failed) || 0), 0);
        if (ok) resumed++;
        if (bad && !ok) failed++;
      } catch {
        /* tab closed since — nothing to resume */
      }
    }
    if (entry.muted) {
      try {
        await chrome.tabs.update(entry.tabId, { muted: false });
        unmuted++;
      } catch {
        /* tab closed */
      }
    }
  }
  await chrome.storage.session.remove('lastPause');
  await refreshBadge();
  return { resumed, unmuted, failed };
}

/* ------------------------------------------------------------------------ */
/* Locate ("Show me")                                                        */
/* ------------------------------------------------------------------------ */

async function locateTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const windows = await chrome.windows.getAll();
  const win = windows.find((w) => w.id === tab.windowId) || (await chrome.windows.get(tab.windowId));
  const windowNumber = windows.findIndex((w) => w.id === win.id) + 1;

  if (win.state === 'minimized') await chrome.windows.update(win.id, { state: 'normal' });
  await chrome.windows.update(win.id, { focused: true });
  // If the OS refused to steal focus, this still makes the taskbar entry flash.
  try {
    await chrome.windows.update(win.id, { drawAttention: true });
  } catch {
    /* some platforms don't support it */
  }
  await chrome.tabs.update(tabId, { active: true });

  const settings = await getSettings();
  if (settings.flashPage || settings.flashTitle) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: flashPage,
        args: [
          {
            seconds: settings.flashSeconds,
            flashPage: settings.flashPage,
            flashTitle: settings.flashTitle,
            windowNumber,
            windowCount: windows.length,
          },
        ],
      });
    } catch {
      /* unscriptable page — focusing the window is the best we can do */
    }
  }
  return { windowNumber, windowCount: windows.length };
}

/** Keyboard shortcut: jump to the next noisy tab (noise first, then calls). */
async function findTheNoise() {
  const { tabs } = await scanTabs();
  const order = [...tabs.filter((t) => !t.protectedBy), ...tabs.filter((t) => t.protectedBy)];
  if (!order.length) {
    await notify('Nothing is playing in Chrome', 'Check Spotify, another browser, or another Chrome profile.');
    return { found: false };
  }
  const { findCursor = -1 } = await chrome.storage.session.get('findCursor');
  const next = (findCursor + 1) % order.length;
  await chrome.storage.session.set({ findCursor: next });
  await locateTab(order[next].id);
  return { found: true, tab: order[next], position: next + 1, total: order.length };
}

/* ------------------------------------------------------------------------ */
/* Protected sites                                                          */
/* ------------------------------------------------------------------------ */

async function addProtectedSite(site) {
  const s = normalizeSite(site);
  if (!s) throw new Error('That does not look like a website address.');
  const settings = await getSettings();
  if (!settings.protectedSites.includes(s)) {
    await chrome.storage.sync.set({ protectedSites: [...settings.protectedSites, s] });
  }
  await refreshBadge();
  return { site: s };
}

async function removeProtectedSite(site) {
  const s = normalizeSite(site);
  const settings = await getSettings();
  await chrome.storage.sync.set({ protectedSites: settings.protectedSites.filter((x) => x !== s) });
  await refreshBadge();
  return { site: s };
}

/* ------------------------------------------------------------------------ */
/* Notifications (silent, obviously)                                        */
/* ------------------------------------------------------------------------ */

async function notify(title, message) {
  try {
    await chrome.notifications.create('', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title,
      message,
      silent: true,
    });
  } catch (err) {
    console.warn('[WTF] notification failed', err);
  }
}

function summarize(result) {
  const bits = [];
  if (result.paused) bits.push(`paused ${result.paused} tab${result.paused === 1 ? '' : 's'}`);
  if (result.muted) bits.push(`muted ${result.muted} stubborn tab${result.muted === 1 ? '' : 's'}`);
  const calls = result.untouched
    ? ` Left ${result.untouched} call/meeting tab${result.untouched === 1 ? '' : 's'} alone.`
    : '';
  if (!bits.length) {
    return {
      title: 'Nothing to pause',
      message: result.untouched
        ? `Only calls/meetings are making sound.${calls}`
        : 'No Chrome tab is making noise right now.',
    };
  }
  const sentence = bits.join(' and ');
  return { title: 'Silence. 🤫', message: sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.' + calls };
}

/* ------------------------------------------------------------------------ */
/* Messages from the popup / options page                                   */
/* ------------------------------------------------------------------------ */

async function handleMessage(msg) {
  switch (msg && msg.type) {
    case 'scan': {
      const scan = await scanTabs();
      const { lastPause = null } = await chrome.storage.session.get('lastPause');
      return { ...scan, lastPause };
    }
    case 'pause-all':
      return pauseEverything();
    case 'pause-tab':
      return pauseOne(msg.tabId);
    case 'resume':
      return resumeLastPause();
    case 'locate':
      return locateTab(msg.tabId);
    case 'find-next':
      return findTheNoise();
    case 'protect-site':
      return addProtectedSite(msg.site);
    case 'unprotect-site':
      return removeProtectedSite(msg.site);
    case 'open-shortcuts':
      await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
      return true;
    case 'open-options':
      await chrome.runtime.openOptionsPage();
      return true;
    case 'refresh-badge':
      await refreshBadge();
      return true;
    default:
      throw new Error(`Unknown message type: ${msg && msg.type}`);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      sendResponse({ ok: true, data: await handleMessage(msg) });
    } catch (err) {
      sendResponse({ ok: false, error: String((err && err.message) || err) });
    }
  })();
  return true; // keep the channel open for the async response
});

/* ------------------------------------------------------------------------ */
/* Wiring                                                                   */
/* ------------------------------------------------------------------------ */

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await applyClickBehavior();
  await refreshBadge();
  if (reason === 'install') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html?welcome=1') });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await applyClickBehavior();
  await refreshBadge();
});

// Clicking the toolbar icon only reaches here when the popup is disabled
// (Settings → "Instantly pause everything").
chrome.action.onClicked.addListener(async () => {
  const result = await pauseEverything();
  const { title, message } = summarize(result);
  await notify(title, message);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'pause-everything') {
    const result = await pauseEverything();
    const { title, message } = summarize(result);
    await notify(title, message);
  } else if (command === 'find-the-noise') {
    await findTheNoise();
  }
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if ('audible' in changeInfo || 'mutedInfo' in changeInfo || 'url' in changeInfo) refreshBadge();
});
chrome.tabs.onRemoved.addListener(() => refreshBadge());
chrome.windows.onRemoved.addListener(() => refreshBadge());

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'sync') {
    applyClickBehavior();
    refreshBadge();
  }
});

// The worker just (re)started — make sure the badge is right.
refreshBadge();
