/**
 * injected.js — functions that get SERIALIZED and run inside web pages via
 * chrome.scripting.executeScript({ func }).
 *
 * RULE: every function here must be 100% self-contained. No imports, no shared
 * helpers, no references to anything outside its own body — the function is
 * stringified, shipped into the page, and run there.
 */

/** Pause every playing, audible <audio>/<video> in this frame (including shadow DOM). */
export function pauseMediaInPage() {
  const media = [];
  const seen = new Set();
  const collect = (root) => {
    if (!root || seen.has(root)) return;
    seen.add(root);
    let els;
    try {
      els = root.querySelectorAll('audio, video');
    } catch {
      return;
    }
    for (const el of els) media.push(el);
    let all;
    try {
      all = root.querySelectorAll('*');
    } catch {
      return;
    }
    for (const node of all) if (node.shadowRoot) collect(node.shadowRoot);
  };
  collect(document);

  let paused = 0;
  for (const el of media) {
    try {
      if (el.paused || el.ended) continue;
      if (el.muted || el.volume === 0) continue; // already silent — not the noise you're hunting
      el.pause();
      el.setAttribute('data-wtf-paused', String(Date.now()));
      paused++;
    } catch {
      /* keep going */
    }
  }
  return { paused, total: media.length };
}

/** Resume only the media WE paused (marked with data-wtf-paused). */
export async function resumeMediaInPage() {
  const media = [];
  const seen = new Set();
  const collect = (root) => {
    if (!root || seen.has(root)) return;
    seen.add(root);
    let els;
    try {
      els = root.querySelectorAll('audio[data-wtf-paused], video[data-wtf-paused]');
    } catch {
      return;
    }
    for (const el of els) media.push(el);
    let all;
    try {
      all = root.querySelectorAll('*');
    } catch {
      return;
    }
    for (const node of all) if (node.shadowRoot) collect(node.shadowRoot);
  };
  collect(document);

  let resumed = 0;
  let failed = 0;
  for (const el of media) {
    el.removeAttribute('data-wtf-paused');
    try {
      await el.play();
      resumed++;
    } catch {
      failed++; // autoplay policy said no — the user has to press play themselves
    }
  }
  return { resumed, failed };
}

/** Cheap read-only look at the page: is the mic open? did the user un-pause something we paused? */
export function probePage() {
  const root = document.documentElement;
  const mic = Boolean(root) && root.getAttribute('data-wtf-mic') === '1';
  let userResumed = false;
  try {
    for (const el of document.querySelectorAll('audio[data-wtf-paused], video[data-wtf-paused]')) {
      if (!el.paused) {
        userResumed = true;
        break;
      }
    }
  } catch {
    /* ignore */
  }
  return { mic, userResumed };
}

/**
 * Make the page impossible to miss: a pulsing pink frame, a banner that says
 * "IT'S THIS TAB" with a Pause button, and a blinking tab title.
 */
export function flashPage(options) {
  const o = Object.assign(
    { seconds: 6, flashPage: true, flashTitle: true, windowNumber: 0, windowCount: 0 },
    options || {}
  );
  const g = globalThis;
  if (typeof g.__wtfFlashCleanup === 'function') {
    try {
      g.__wtfFlashCleanup();
    } catch {
      /* ignore */
    }
  }

  const cleanups = [];
  const Z = '2147483647';
  const where = o.windowNumber ? ` (window ${o.windowNumber} of ${o.windowCount})` : '';

  const pauseHere = () => {
    let n = 0;
    const walk = (root) => {
      let els;
      try {
        els = root.querySelectorAll('audio, video');
      } catch {
        return;
      }
      for (const el of els) {
        try {
          if (!el.paused && !el.ended && !el.muted && el.volume !== 0) {
            el.pause();
            el.setAttribute('data-wtf-paused', String(Date.now()));
            n++;
          }
        } catch {
          /* ignore */
        }
      }
      let all;
      try {
        all = root.querySelectorAll('*');
      } catch {
        return;
      }
      for (const node of all) if (node.shadowRoot) walk(node.shadowRoot);
    };
    walk(document);
    return n;
  };

  if (o.flashPage && document.body) {
    const frame = document.createElement('div');
    frame.id = 'wtf-is-playing-frame';
    frame.style.cssText =
      `position:fixed;inset:0;z-index:${Z};pointer-events:none;` +
      'box-shadow:inset 0 0 0 14px #ff2d55, inset 0 0 90px rgba(255,45,85,.6);';
    const pulse = frame.animate([{ opacity: 1 }, { opacity: 0.08 }], {
      duration: 380,
      direction: 'alternate',
      iterations: Infinity,
      easing: 'ease-in-out',
    });

    const pill = document.createElement('div');
    pill.id = 'wtf-is-playing-pill';
    pill.style.cssText =
      `position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:${Z};pointer-events:auto;` +
      'display:flex;flex-wrap:wrap;justify-content:center;gap:10px;align-items:center;' +
      'padding:12px 16px;border-radius:999px;background:#0b0d12;color:#fff;' +
      'font:600 15px/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
      'box-shadow:0 10px 40px rgba(0,0,0,.55),0 0 0 3px #ff2d55;max-width:92vw;text-align:center;';

    const label = document.createElement('span');
    label.textContent = `🔊 IT'S THIS TAB${where}`;

    const button = (text, primary) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.style.cssText =
        'all:unset;cursor:pointer;padding:8px 14px;border-radius:999px;white-space:nowrap;' +
        'font:700 13px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;' +
        `background:${primary ? '#ff2d55' : '#2a2f3a'};`;
      return b;
    };
    const pauseBtn = button('⏸ Pause it', true);
    const okBtn = button('Got it', false);
    pauseBtn.addEventListener('click', () => {
      const n = pauseHere();
      label.textContent = n
        ? "🤫 Paused. You're welcome."
        : '🤷 Nothing here to pause — use the toolbar button to mute this tab.';
      pauseBtn.remove();
      setTimeout(cleanup, 1800);
    });
    okBtn.addEventListener('click', () => cleanup());
    pill.append(label, pauseBtn, okBtn);

    document.body.append(frame, pill);
    cleanups.push(() => {
      pulse.cancel();
      frame.remove();
      pill.remove();
    });
  }

  if (o.flashTitle) {
    const ALT = '🔊🔊🔊 THIS ONE 🔊🔊🔊';
    let original = document.title;
    let on = false;
    const timer = setInterval(() => {
      on = !on;
      if (on) {
        if (document.title !== ALT) original = document.title; // the page may have changed it
        document.title = ALT;
      } else {
        document.title = original;
      }
    }, 500);
    cleanups.push(() => {
      clearInterval(timer);
      if (document.title === ALT) document.title = original;
    });
  }

  const autoHide = setTimeout(cleanup, Math.max(1, Number(o.seconds) || 6) * 1000);

  function cleanup() {
    clearTimeout(autoHide);
    for (const fn of cleanups.splice(0)) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
    g.__wtfFlashCleanup = null;
  }
  g.__wtfFlashCleanup = cleanup;
  return true;
}
