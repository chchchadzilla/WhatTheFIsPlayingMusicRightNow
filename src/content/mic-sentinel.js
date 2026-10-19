/**
 * mic-sentinel.js — runs inside every page (MAIN world, document_start, all frames).
 *
 * Job: notice when a page opens your MICROPHONE (getUserMedia with audio), and
 * expose that as a boolean attribute on <html>:  data-wtf-mic="1" / "0".
 *
 * Why: a tab that has your mic open is almost certainly a call. The extension
 * reads this attribute before pausing anything, so PAUSE EVERYTHING never
 * silences the people talking to you — even on sites we've never heard of.
 *
 * Privacy: nothing is recorded, nothing is sent anywhere. We only count how many
 * live audio tracks exist. The code never touches the audio data itself.
 */
(() => {
  try {
    const md = navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== 'function' || md.__wtfSentinel) return;

    const liveTracks = new Set();

    const sync = () => {
      const el = document.documentElement;
      if (el) el.setAttribute('data-wtf-mic', liveTracks.size ? '1' : '0');
    };

    const watch = (stream) => {
      let tracks = [];
      try {
        tracks = stream.getAudioTracks();
      } catch {
        /* not a MediaStream */
      }
      for (const track of tracks) {
        if (liveTracks.has(track)) continue;
        liveTracks.add(track);
        const drop = () => {
          liveTracks.delete(track);
          sync();
        };
        track.addEventListener('ended', drop);
        const originalStop = track.stop;
        track.stop = function () {
          drop();
          return originalStop.apply(this, arguments);
        };
      }
      sync();
    };

    const originalGetUserMedia = md.getUserMedia;
    md.getUserMedia = function (constraints) {
      const promise = originalGetUserMedia.apply(this, arguments);
      if (constraints && constraints.audio) promise.then(watch, () => {});
      return promise;
    };

    Object.defineProperty(md, '__wtfSentinel', { value: true });
    sync();
  } catch {
    /* never break the host page */
  }
})();
