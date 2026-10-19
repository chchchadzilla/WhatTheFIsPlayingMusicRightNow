/**
 * Shared defaults + tiny helpers used by the service worker, popup and options page.
 *
 * "Protected sites" are places where sound usually means A HUMAN IS TALKING TO YOU
 * (calls, meetings, huddles). The extension never pauses or mutes tabs on these
 * domains, so hitting PAUSE EVERYTHING mid-meeting doesn't hang up on your boss.
 * Users can edit this list on the options page.
 */

export const DEFAULT_PROTECTED_SITES = [
  // Microsoft
  'teams.microsoft.com',
  'teams.live.com',
  'teams.cloud.microsoft',
  'web.skype.com',
  'skype.com',
  // Google
  'meet.google.com',
  'voice.google.com',
  // Slack / Discord
  'app.slack.com',
  'discord.com',
  // Zoom & the meeting crowd
  'zoom.us',
  'zoom.com',
  'webex.com',
  'whereby.com',
  'meet.jit.si',
  '8x8.vc',
  'gotomeeting.com',
  'goto.com',
  'bluejeans.com',
  'chime.aws',
  'around.co',
  'gather.town',
  'tuple.app',
  'pop.com',
  'livestorm.co',
  'streamyard.com',
  'riverside.fm',
  // Phones & chat
  'ringcentral.com',
  'dialpad.com',
  'aircall.io',
  'talkdesk.com',
  'messenger.com',
  'web.whatsapp.com',
  'web.telegram.org',
  'signal.org',
];

export const DEFAULT_SETTINGS = {
  /** Domains that are never paused/muted (calls & meetings). */
  protectedSites: DEFAULT_PROTECTED_SITES,
  /** If a tab has your MICROPHONE open, treat it as a call and leave it alone. */
  protectMicTabs: true,
  /** If a tab keeps making noise after we pause its media (games, Web Audio, PDFs), mute the tab. */
  muteStubbornTabs: true,
  /** 'panel' = clicking the toolbar icon opens the panel. 'pause' = clicking it pauses everything instantly. */
  clickBehavior: 'panel',
  /** How long the "IT'S THIS TAB" flash stays on screen (seconds). */
  flashSeconds: 6,
  /** Flash a big pink frame + banner inside the noisy page. */
  flashPage: true,
  /** Blink the tab's title so it stands out in the tab strip. */
  flashTitle: true,
  /** Show how many tabs are making noise on the toolbar icon. */
  showBadge: true,
};

/** "https://www.music.youtube.com/watch?v=x" -> "music.youtube.com" */
export function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Turn whatever a human typed ("HTTPS://www.Zoom.us/j/123", " zoom.us ") into "zoom.us". */
export function normalizeSite(input) {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(s)) {
    try {
      s = new URL(s).hostname;
    } catch {
      /* keep going with the raw string */
    }
  }
  s = s.replace(/^www\./, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '');
  return s;
}

/** True if host is one of the sites or a subdomain of one. */
export function isProtectedHost(host, sites) {
  if (!host || !Array.isArray(sites)) return false;
  return sites.some((site) => {
    const s = normalizeSite(site);
    return Boolean(s) && (host === s || host.endsWith('.' + s));
  });
}

/** De-duplicate and normalize a list of sites, dropping blanks. */
export function uniqueSites(list) {
  const out = [];
  for (const raw of list || []) {
    const s = normalizeSite(raw);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}
