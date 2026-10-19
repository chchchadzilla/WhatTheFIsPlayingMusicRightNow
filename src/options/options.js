/**
 * options.js — the settings page. Everything saves automatically to
 * chrome.storage.sync, so settings follow you to other computers.
 */
import { DEFAULT_SETTINGS, DEFAULT_PROTECTED_SITES, uniqueSites } from '../shared/defaults.js';

const $ = (selector) => document.querySelector(selector);

let saveTimer = null;

function setStatus(el, text, ok = true) {
  el.textContent = text;
  el.classList.toggle('ok', ok);
  if (ok) {
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.textContent = el === $('#save-status') ? 'Changes save automatically.' : '';
      el.classList.remove('ok');
    }, 2500);
  }
}

async function load() {
  let stored = {};
  try {
    stored = await chrome.storage.sync.get(null);
  } catch {
    /* defaults it is */
  }
  const s = { ...DEFAULT_SETTINGS, ...stored };
  const sites = Array.isArray(s.protectedSites) ? s.protectedSites : DEFAULT_PROTECTED_SITES;
  $('#protected-sites').value = sites.join('\n');
  $('#protectMicTabs').checked = Boolean(s.protectMicTabs);
  $('#muteStubbornTabs').checked = Boolean(s.muteStubbornTabs);
  $('#flashPage').checked = Boolean(s.flashPage);
  $('#flashTitle').checked = Boolean(s.flashTitle);
  $('#showBadge').checked = Boolean(s.showBadge);
  $('#flashSeconds').value = String(s.flashSeconds);
  $('#flashSecondsOut').value = String(s.flashSeconds);
  const behavior = s.clickBehavior === 'pause' ? 'pause' : 'panel';
  document.querySelector(`input[name="clickBehavior"][value="${behavior}"]`).checked = true;
}

async function save() {
  const sites = uniqueSites($('#protected-sites').value.split(/\r?\n/));
  const behaviorInput = document.querySelector('input[name="clickBehavior"]:checked');
  const settings = {
    protectedSites: sites,
    protectMicTabs: $('#protectMicTabs').checked,
    muteStubbornTabs: $('#muteStubbornTabs').checked,
    clickBehavior: behaviorInput ? behaviorInput.value : 'panel',
    flashSeconds: Number($('#flashSeconds').value) || DEFAULT_SETTINGS.flashSeconds,
    flashPage: $('#flashPage').checked,
    flashTitle: $('#flashTitle').checked,
    showBadge: $('#showBadge').checked,
  };
  try {
    await chrome.storage.sync.set(settings);
    setStatus($('#save-status'), 'Saved ✓');
    setStatus($('#sites-status'), `${sites.length} protected site${sites.length === 1 ? '' : 's'} ✓`);
  } catch (err) {
    setStatus($('#save-status'), `Could not save: ${err.message}`, false);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

function openShortcuts() {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
}

/* ---- wiring ---- */
for (const el of document.querySelectorAll('input, textarea')) {
  el.addEventListener('input', scheduleSave);
  el.addEventListener('change', scheduleSave);
}
$('#flashSeconds').addEventListener('input', (e) => {
  $('#flashSecondsOut').value = e.target.value;
});
$('#btn-restore').addEventListener('click', () => {
  $('#protected-sites').value = DEFAULT_PROTECTED_SITES.join('\n');
  save();
});
$('#btn-shortcuts').addEventListener('click', openShortcuts);
$('#btn-shortcuts-2').addEventListener('click', openShortcuts);

if (new URLSearchParams(location.search).get('welcome') === '1') {
  $('#welcome').classList.remove('hidden');
}

load();
