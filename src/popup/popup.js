/**
 * popup.js — the little panel that opens when you click the toolbar icon.
 * All the heavy lifting happens in background.js; this file just asks for a
 * scan, draws the lists, and forwards button clicks.
 */

const $ = (selector) => document.querySelector(selector);

async function send(message) {
  const reply = await chrome.runtime.sendMessage(message);
  if (!reply || !reply.ok) throw new Error((reply && reply.error) || 'No response from the extension');
  return reply.data;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

let myWindowId = null;
let refreshTimer = null;
let busy = false;

/* ---------------------------------------------------------------- rows */

function favicon(tab) {
  const wrap = document.createElement('span');
  wrap.className = 'fav-wrap';
  if (tab.favIconUrl && /^(https?:|data:)/i.test(tab.favIconUrl)) {
    const img = document.createElement('img');
    img.className = 'fav';
    img.width = 16;
    img.height = 16;
    img.alt = '';
    img.src = tab.favIconUrl;
    img.addEventListener('error', () => {
      img.replaceWith(document.createTextNode('🔊'));
    });
    wrap.append(img);
  } else {
    wrap.textContent = tab.protectedBy ? '🎧' : '🔊';
  }
  return wrap;
}

function describe(tab, windowCount) {
  const bits = [tab.host || 'local page'];
  if (windowCount > 1) {
    bits.push(tab.windowId === myWindowId ? 'this window' : `window ${tab.windowNumber} of ${windowCount}`);
  }
  if (tab.muted) bits.push('🔇 muted');
  if (tab.protectedBy === 'mic') bits.push('🎙 mic in use');
  if (tab.protectedBy === 'site') bits.push('🛡 protected site');
  return bits.join(' · ');
}

function renderRow(tab, windowCount) {
  const li = $('#row-template').content.firstElementChild.cloneNode(true);
  li.querySelector('.fav-wrap').replaceWith(favicon(tab));
  li.querySelector('.title').textContent = tab.title;
  li.querySelector('.title').title = tab.title;
  li.querySelector('.sub').textContent = describe(tab, windowCount);
  if (tab.protectedBy) li.classList.add('protected');
  if (tab.muted) li.classList.add('is-muted');

  li.querySelector('.btn-show').addEventListener('click', async () => {
    try {
      await send({ type: 'locate', tabId: tab.id });
    } catch (err) {
      console.warn(err);
    }
    window.close();
  });

  li.querySelector('.btn-pause').addEventListener('click', async () => {
    try {
      const result = await send({ type: 'pause-tab', tabId: tab.id });
      showAfterPause(result);
    } catch (err) {
      showError(err);
    }
    setTimeout(refresh, 600);
  });

  const shield = li.querySelector('.btn-shield');
  if (tab.protectedBy === 'site') {
    shield.classList.add('on');
    shield.title = `Not a call? Stop protecting ${tab.host}`;
    shield.addEventListener('click', async () => {
      await send({ type: 'unprotect-site', site: tab.host });
      refresh();
    });
  } else if (tab.protectedBy === 'mic') {
    shield.disabled = true;
    shield.title = 'Protected because this tab is using your microphone';
  } else if (!tab.host) {
    shield.disabled = true;
    shield.title = 'No website address to protect';
  } else {
    shield.title = `This is a call — never pause ${tab.host}`;
    shield.addEventListener('click', async () => {
      await send({ type: 'protect-site', site: tab.host });
      refresh();
    });
  }
  return li;
}

/* ------------------------------------------------------------ feedback */

function showAfterPause(result) {
  const box = $('#after-pause');
  const text = $('#after-pause-text');
  const bits = [];
  if (result.paused) bits.push(`Paused ${plural(result.paused, 'tab')}`);
  if (result.muted) bits.push(`muted ${plural(result.muted, 'stubborn tab')}`);
  let sentence = bits.length ? bits.join(', ') + '.' : 'Nothing to pause — it was already quiet.';
  if (result.untouched) sentence += ` Left ${plural(result.untouched, 'call')} alone.`;
  text.textContent = sentence;
  $('#btn-resume').classList.toggle('hidden', !(result.paused || result.muted));
  box.classList.remove('hidden');
}

function showResumeAvailable(lastPause) {
  const box = $('#after-pause');
  const entries = (lastPause && lastPause.entries) || [];
  const touched = entries.filter((e) => e.pausedCount > 0 || e.muted);
  if (!touched.length) return;
  const ago = Math.max(1, Math.round((Date.now() - lastPause.at) / 1000));
  const when = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)} min ago`;
  $('#after-pause-text').textContent = `You paused ${plural(touched.length, 'tab')} ${when}.`;
  $('#btn-resume').classList.remove('hidden');
  box.classList.remove('hidden');
}

function showError(err) {
  $('#after-pause-text').textContent = `Hmm: ${err && err.message ? err.message : err}`;
  $('#btn-resume').classList.add('hidden');
  $('#after-pause').classList.remove('hidden');
}

/* -------------------------------------------------------------- render */

function render(data) {
  const { tabs, windowCount, lastPause } = data;
  const noisy = tabs.filter((t) => !t.protectedBy);
  const calls = tabs.filter((t) => t.protectedBy);

  const noisyList = $('#noisy-list');
  noisyList.replaceChildren(...noisy.map((t) => renderRow(t, windowCount)));
  $('#noisy-count').textContent = String(noisy.length);
  $('#empty').classList.toggle('hidden', tabs.length > 0);

  const protectedList = $('#protected-list');
  protectedList.replaceChildren(...calls.map((t) => renderRow(t, windowCount)));
  $('#protected-count').textContent = String(calls.length);
  $('#protected-section').classList.toggle('hidden', calls.length === 0);

  $('#window-count').textContent = `${plural(windowCount, 'window')} scanned`;

  const sub = $('#pause-sub');
  if (noisy.length) {
    sub.textContent = `${plural(noisy.length, 'tab')} across ${plural(windowCount, 'window')}. Calls stay untouched.`;
  } else if (calls.length) {
    sub.textContent = 'Only calls are making sound. Nothing to pause.';
  } else {
    sub.textContent = 'Music & video in every window. Calls stay untouched.';
  }

  if ($('#after-pause').classList.contains('hidden')) showResumeAvailable(lastPause);
}

async function refresh() {
  if (busy) return;
  try {
    render(await send({ type: 'scan' }));
  } catch (err) {
    showError(err);
  }
}

/* -------------------------------------------------------------- wiring */

$('#btn-pause-all').addEventListener('click', async () => {
  const btn = $('#btn-pause-all');
  busy = true;
  btn.disabled = true;
  $('#pause-sub').textContent = 'Shushing everything…';
  try {
    showAfterPause(await send({ type: 'pause-all' }));
  } catch (err) {
    showError(err);
  } finally {
    busy = false;
    btn.disabled = false;
    setTimeout(refresh, 600);
  }
});

$('#btn-resume').addEventListener('click', async () => {
  busy = true;
  try {
    const r = await send({ type: 'resume' });
    const bits = [];
    if (r.resumed) bits.push(`resumed ${plural(r.resumed, 'tab')}`);
    if (r.unmuted) bits.push(`unmuted ${plural(r.unmuted, 'tab')}`);
    let sentence = bits.length ? bits.join(', ') + '.' : 'Nothing left to resume.';
    sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
    if (r.failed) sentence += ` ${plural(r.failed, 'tab')} refused to auto-play — press play there yourself.`;
    $('#after-pause-text').textContent = sentence;
    $('#btn-resume').classList.add('hidden');
  } catch (err) {
    showError(err);
  } finally {
    busy = false;
    setTimeout(refresh, 800);
  }
});

$('#btn-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('#btn-shortcuts').addEventListener('click', () => send({ type: 'open-shortcuts' }));

(async () => {
  try {
    myWindowId = (await chrome.windows.getCurrent()).id;
  } catch {
    /* fine */
  }
  await refresh();
  refreshTimer = setInterval(refresh, 2500);
  window.addEventListener('unload', () => clearInterval(refreshTimer));
})();
