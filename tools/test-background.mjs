#!/usr/bin/env node
/**
 * test-background.mjs — runs the real service worker (src/background.js) against
 * a fake `chrome` API and checks the behaviour that matters:
 *
 *   - calls are never paused or muted (protected sites + mic detection)
 *   - PAUSE EVERYTHING pauses what it can, mutes what it can't
 *   - the stubborn-tab check mutes tabs that keep playing, but not ones the user resumed
 *   - Resume undoes exactly what was touched
 *   - "Show me" un-minimizes, focuses, activates and flashes
 *   - the badge, protect/unprotect, find-next and shortcuts behave
 *
 * No browser, no dependencies:   node tools/test-background.mjs
 */
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const realSetTimeout = globalThis.setTimeout;
const flush = (ms = 15) => new Promise((r) => realSetTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* A tiny fake Chrome                                                 */
/* ------------------------------------------------------------------ */

const event = () => {
  const listeners = [];
  return { addListener: (fn) => listeners.push(fn), listeners };
};

const storageArea = (store) => ({
  async get(keys) {
    if (keys === null || keys === undefined) return structuredClone(store);
    if (typeof keys === 'string') return keys in store ? { [keys]: structuredClone(store[keys]) } : {};
    if (Array.isArray(keys)) return Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, structuredClone(store[k])]));
    const out = structuredClone(keys);
    for (const k of Object.keys(keys)) if (k in store) out[k] = structuredClone(store[k]);
    return out;
  },
  async set(obj) {
    Object.assign(store, structuredClone(obj));
  },
  async remove(key) {
    for (const k of [].concat(key)) delete store[k];
  },
});

// sim: what the injected functions would find in the page
//   media: number of playing <audio>/<video>; mic: page has the mic open;
//   stubborn: keeps making noise even after its media is paused (Web Audio under a decoy player)
const tab = (id, windowId, index, url, title, sim = {}, extra = {}) => ({
  id,
  windowId,
  index,
  url,
  title,
  audible: true,
  mutedInfo: { muted: false },
  active: index === 0,
  favIconUrl: '',
  sim: { media: 1, ...sim },
  ...extra,
});

const state = {
  windows: [
    { id: 1, state: 'normal', focused: true },
    { id: 2, state: 'minimized', focused: false },
  ],
  tabs: [
    tab(11, 1, 0, 'https://www.youtube.com/watch?v=abc', 'lofi beats'),
    tab(12, 2, 0, 'https://open.spotify.com/track/1', 'Daily Mix 1'),
    tab(13, 2, 1, 'https://teams.microsoft.com/l/meetup-join/x', 'Weekly sync | Teams', { media: 3, mic: true }),
    tab(14, 1, 1, 'https://unknown-call.example/room/7', 'Mystery call', { media: 1, mic: true }),
    tab(15, 1, 2, 'https://webaudio-game.example/', 'Browser synth', { media: 0 }),
    tab(16, 1, 3, 'https://quiet.example/', 'Quiet page', {}, { audible: false }),
    tab(17, 1, 4, 'https://decoy.example/', 'Decoy player + Web Audio', { media: 1, stubborn: true }),
    tab(18, 2, 2, 'chrome://settings/', 'Settings', { media: 0 }, { unscriptable: true }),
  ],
  sync: {},
  session: {},
  badge: {},
  popup: null,
  notifications: [],
  windowUpdates: [],
  tabUpdates: [],
  injected: [],
  created: [],
  timers: [],
};

const tabById = (id) => state.tabs.find((t) => t.id === id);
const publicTab = (t) => {
  const { sim, unscriptable, ...rest } = t;
  return structuredClone(rest);
};

globalThis.setTimeout = (fn, ms) => {
  state.timers.push({ fn, ms });
  return state.timers.length;
};
globalThis.clearTimeout = () => {};
async function runTimers() {
  const pending = state.timers.splice(0);
  for (const t of pending) await t.fn();
  await flush();
}

const runtime = { onMessage: event(), onInstalled: event(), onStartup: event() };
const chrome = {
  runtime: {
    ...runtime,
    getURL: (p) => `chrome-extension://fake-id/${p}`,
    openOptionsPage: async () => state.created.push('options'),
  },
  storage: {
    sync: storageArea(state.sync),
    session: storageArea(state.session),
    onChanged: event(),
  },
  action: {
    setPopup: async ({ popup }) => { state.popup = popup; },
    setBadgeText: async ({ text }) => { state.badge.text = text; },
    setBadgeBackgroundColor: async ({ color }) => { state.badge.color = color; },
    setBadgeTextColor: async () => {},
    setTitle: async ({ title }) => { state.badge.title = title; },
    onClicked: event(),
  },
  tabs: {
    query: async ({ audible }) => state.tabs.filter((t) => (audible === undefined ? true : t.audible === audible)).map(publicTab),
    get: async (id) => {
      const t = tabById(id);
      if (!t) throw new Error(`No tab with id: ${id}.`);
      return publicTab(t);
    },
    update: async (id, props) => {
      const t = tabById(id);
      if (!t) throw new Error(`No tab with id: ${id}.`);
      state.tabUpdates.push({ id, ...props });
      if ('muted' in props) t.mutedInfo.muted = props.muted;
      if (props.active) {
        for (const other of state.tabs) if (other.windowId === t.windowId) other.active = other.id === id;
      }
      return publicTab(t);
    },
    create: async ({ url }) => state.created.push(url),
    onUpdated: event(),
    onRemoved: event(),
  },
  windows: {
    getAll: async () => structuredClone(state.windows),
    get: async (id) => structuredClone(state.windows.find((w) => w.id === id)),
    update: async (id, props) => {
      const w = state.windows.find((w) => w.id === id);
      state.windowUpdates.push({ id, ...props });
      if (props.state) w.state = props.state;
      if (props.focused) for (const x of state.windows) x.focused = x.id === id;
      return structuredClone(w);
    },
    onRemoved: event(),
  },
  scripting: {
    executeScript: async ({ target, func, args }) => {
      const t = tabById(target.tabId);
      if (!t) throw new Error(`No tab with id: ${target.tabId}.`);
      if (t.unscriptable) throw new Error('Cannot access contents of the page.');
      state.injected.push({ tabId: t.id, fn: func.name, args: args || [] });
      switch (func.name) {
        case 'pauseMediaInPage': {
          const paused = t.sim.media;
          t.sim.marked = paused;
          if (paused && !t.sim.stubborn) t.audible = false;
          return [{ result: { paused, total: t.sim.media } }];
        }
        case 'resumeMediaInPage': {
          const resumed = t.sim.marked || 0;
          t.sim.marked = 0;
          if (resumed) t.audible = true;
          return [{ result: { resumed, failed: 0 } }];
        }
        case 'probePage':
          return [{ result: { mic: Boolean(t.sim.mic), userResumed: Boolean(t.sim.userResumed) } }];
        case 'flashPage':
          return [{ result: true }];
        default:
          throw new Error(`unexpected injected function ${func.name}`);
      }
    },
  },
  commands: { onCommand: event() },
  notifications: {
    create: async (_id, opts) => state.notifications.push(opts),
  },
};
globalThis.chrome = chrome;

/* ------------------------------------------------------------------ */
/* Load the real service worker                                       */
/* ------------------------------------------------------------------ */

await import(pathToFileURL(resolve(ROOT, 'src/background.js')).href);
await flush();

const onMessage = runtime.onMessage.listeners[0];
assert.ok(onMessage, 'background.js must register a runtime.onMessage listener');
const send = (msg) =>
  new Promise((resolveReply, rejectReply) => {
    const keepOpen = onMessage(msg, {}, (reply) => (reply.ok ? resolveReply(reply.data) : rejectReply(new Error(reply.error))));
    assert.equal(keepOpen, true, 'onMessage must return true to keep the channel open');
  });

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

await test('badge shows the count of noisy (non-call-site) tabs after startup', async () => {
  // audible: 11,12,13,14,15,17,18 — badge path only excludes protected SITES (13) → 6
  assert.equal(state.badge.text, '6');
  assert.equal(state.badge.color, '#ff2d55');
});

await test('scan classifies protected sites and mic tabs, ignores quiet tabs', async () => {
  const { tabs, windowCount } = await send({ type: 'scan' });
  assert.equal(windowCount, 2);
  const by = Object.fromEntries(tabs.map((t) => [t.id, t]));
  assert.ok(!by[16], 'quiet tab must not be listed');
  assert.equal(by[13].protectedBy, 'site');
  assert.equal(by[14].protectedBy, 'mic');
  assert.equal(by[11].protectedBy, null);
  assert.equal(by[12].windowNumber, 2);
  assert.equal(by[18].host, '');
});

await test('PAUSE EVERYTHING pauses players, mutes the un-pausable, never touches calls', async () => {
  const r = await send({ type: 'pause-all' });
  assert.equal(r.untouched, 2, 'Teams + mic tab left alone');
  assert.equal(r.paused, 3, 'youtube, spotify, decoy had players to pause');
  assert.equal(r.muted, 2, 'web-audio tab and chrome:// tab get muted immediately');
  for (const id of [13, 14]) {
    assert.ok(!state.injected.some((i) => i.tabId === id && i.fn === 'pauseMediaInPage'), `tab ${id} must not be scripted to pause`);
    assert.equal(tabById(id).mutedInfo.muted, false, `tab ${id} must not be muted`);
  }
  assert.equal(tabById(15).mutedInfo.muted, true);
  assert.equal(tabById(18).mutedInfo.muted, true);
  assert.equal(tabById(11).mutedInfo.muted, false, 'a tab that paused fine is not muted');
  assert.ok(state.session.lastPause, 'lastPause recorded for Resume');
  assert.equal(state.timers.length, 1, 'stubborn check scheduled');
  assert.ok(state.timers[0].ms >= 3000, 'stubborn check waits past Chrome\'s audible hysteresis');
});

await test('stubborn check mutes what kept playing, skips what the user resumed', async () => {
  tabById(12).audible = true; // the human pressed play again on Spotify on purpose
  tabById(12).sim.userResumed = true;
  await runTimers();
  assert.equal(tabById(17).mutedInfo.muted, true, 'decoy tab still noisy → muted');
  assert.equal(tabById(12).mutedInfo.muted, false, 'user-resumed tab left alone');
  assert.equal(tabById(11).mutedInfo.muted, false);
  assert.equal(state.session.lastPause.entries.find((e) => e.tabId === 17).muted, true);
});

await test('Resume un-pauses and un-mutes exactly what was touched', async () => {
  const r = await send({ type: 'resume' });
  assert.equal(r.unmuted, 3, 'web-audio, chrome:// and decoy tabs un-muted');
  assert.ok(r.resumed >= 3);
  for (const id of [15, 17, 18]) assert.equal(tabById(id).mutedInfo.muted, false);
  assert.equal(state.session.lastPause, undefined, 'resume list cleared');
  assert.ok(!state.injected.some((i) => i.fn === 'resumeMediaInPage' && [13, 14].includes(i.tabId)), 'calls never scripted');
});

await test('Show me: un-minimize, focus, draw attention, activate, flash with window numbers', async () => {
  state.windowUpdates.length = 0;
  state.injected.length = 0;
  const r = await send({ type: 'locate', tabId: 12 });
  assert.deepEqual(r, { windowNumber: 2, windowCount: 2 });
  const kinds = state.windowUpdates.map((u) => Object.keys(u).filter((k) => k !== 'id')[0]);
  assert.deepEqual(kinds, ['state', 'focused', 'drawAttention']);
  assert.equal(state.windows[1].state, 'normal');
  assert.equal(state.windows[1].focused, true);
  assert.ok(state.tabUpdates.some((u) => u.id === 12 && u.active === true));
  const flash = state.injected.find((i) => i.fn === 'flashPage');
  assert.ok(flash, 'flash injected');
  assert.equal(flash.args[0].windowNumber, 2);
  assert.equal(flash.args[0].seconds, 6);
});

await test('Show me on an unscriptable tab still focuses it and does not throw', async () => {
  await send({ type: 'locate', tabId: 18 });
  assert.ok(state.tabUpdates.some((u) => u.id === 18 && u.active === true));
});

await test('protect-site adds the host; site rule wins over mic rule; unprotect removes it', async () => {
  await send({ type: 'protect-site', site: 'HTTPS://unknown-call.example/room/7' });
  assert.ok(state.sync.protectedSites.includes('unknown-call.example'));
  let { tabs } = await send({ type: 'scan' });
  assert.equal(tabs.find((t) => t.id === 14).protectedBy, 'site');
  await send({ type: 'unprotect-site', site: 'unknown-call.example' });
  assert.ok(!state.sync.protectedSites.includes('unknown-call.example'));
  ({ tabs } = await send({ type: 'scan' }));
  assert.equal(tabs.find((t) => t.id === 14).protectedBy, 'mic');
  await assert.rejects(send({ type: 'protect-site', site: '   ' }), /website address/);
});

await test('pause-tab on a protected tab is honoured (explicit human intent)', async () => {
  const r = await send({ type: 'pause-tab', tabId: 13 });
  assert.equal(r.paused, 1);
  assert.ok(state.injected.some((i) => i.tabId === 13 && i.fn === 'pauseMediaInPage'));
  await send({ type: 'resume' });
});

await test('find-next cycles through noisy tabs and notifies when nothing plays', async () => {
  state.tabUpdates.length = 0;
  const a = await send({ type: 'find-next' });
  const b = await send({ type: 'find-next' });
  assert.ok(a.found && b.found);
  assert.notEqual(a.tab.id, b.tab.id, 'second press moves to the next tab');
  assert.equal(a.tab.protectedBy, null, 'noise comes before calls');
  const saved = state.tabs.map((t) => t.audible);
  for (const t of state.tabs) t.audible = false;
  const none = await send({ type: 'find-next' });
  assert.equal(none.found, false);
  assert.match(state.notifications.at(-1).title, /Nothing is playing/);
  assert.equal(state.notifications.at(-1).silent, true, 'notifications must be silent');
  state.tabs.forEach((t, i) => (t.audible = saved[i]));
});

await test('keyboard shortcut pauses everything and reports silently', async () => {
  const onCommand = chrome.commands.onCommand.listeners[0];
  assert.ok(onCommand);
  const before = state.notifications.length;
  await onCommand('pause-everything');
  await flush();
  assert.equal(state.notifications.length, before + 1);
  assert.match(state.notifications.at(-1).message, /Left 2 call\/meeting tabs alone/);
  await send({ type: 'resume' });
});

await test('click behaviour setting toggles the popup on/off', async () => {
  const onChanged = chrome.storage.onChanged.listeners[0];
  state.sync.clickBehavior = 'pause';
  await onChanged({}, 'sync');
  await flush();
  assert.equal(state.popup, '');
  state.sync.clickBehavior = 'panel';
  await onChanged({}, 'sync');
  await flush();
  assert.equal(state.popup, 'src/popup/popup.html');
});

await test('badge goes green when only calls are making sound, blank when silent', async () => {
  const saved = state.tabs.map((t) => t.audible);
  for (const t of state.tabs) t.audible = t.id === 13;
  await send({ type: 'refresh-badge' });
  assert.equal(state.badge.text, '1');
  assert.equal(state.badge.color, '#1fbf8f');
  for (const t of state.tabs) t.audible = false;
  await send({ type: 'refresh-badge' });
  assert.equal(state.badge.text, '');
  state.tabs.forEach((t, i) => (t.audible = saved[i]));
});

await test('first install opens the welcome page', async () => {
  const onInstalled = runtime.onInstalled.listeners[0];
  await onInstalled({ reason: 'install' });
  await flush();
  assert.ok(state.created.some((u) => String(u).includes('options.html?welcome=1')));
});

console.log(process.exitCode ? `\n${passed} passed, some FAILED.` : `\nAll ${passed} tests passed.`);
process.exit(process.exitCode || 0);
