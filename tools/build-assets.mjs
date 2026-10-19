#!/usr/bin/env node
/**
 * build-assets.mjs — renders every image in this repo from HTML/SVG using the
 * copy of Chrome you already have (headless). No npm packages needed.
 *
 *   node tools/build-assets.mjs
 *
 * Outputs:
 *   icons/icon-{16,32,48,128}.png   toolbar + store icons
 *   assets/banner.png               README hero (1600×500)
 *   assets/social-preview.png       GitHub social preview (1280×640)
 *   assets/popup-preview.png        popup mock for the README
 *   assets/flash-preview.png        the in-page flash, for the README
 *
 * Set CHROME_PATH if Chrome lives somewhere unusual.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const CHROME = CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
  console.error('Could not find Chrome. Set CHROME_PATH=/path/to/chrome and try again.');
  process.exit(1);
}

const JOBS = [
  // Icons go through a canvas + --dump-dom (see icon-png.html); plain screenshots come back empty at 128×128.
  { src: 'tools/assets-src/icon-png.html', query: 'size=16&variant=small', out: 'icons/icon-16.png', w: 16, h: 16, canvas: true },
  { src: 'tools/assets-src/icon-png.html', query: 'size=32&variant=small', out: 'icons/icon-32.png', w: 32, h: 32, canvas: true },
  { src: 'tools/assets-src/icon-png.html', query: 'size=48', out: 'icons/icon-48.png', w: 48, h: 48, canvas: true },
  { src: 'tools/assets-src/icon-png.html', query: 'size=128', out: 'icons/icon-128.png', w: 128, h: 128, canvas: true },
  { src: 'tools/assets-src/banner.html', out: 'assets/banner.png', w: 1600, h: 500 },
  { src: 'tools/assets-src/social-preview.html', out: 'assets/social-preview.png', w: 1280, h: 640 },
  { src: 'tools/assets-src/popup-preview.html', out: 'assets/popup-preview.png', w: 460, h: 560 },
  { src: 'tools/assets-src/flash-preview.html', out: 'assets/flash-preview.png', w: 1200, h: 700, modules: true },
];

function pngSize(file) {
  const b = readFileSync(file);
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const profile = mkdtempSync(join(tmpdir(), 'wtf-assets-'));
let failed = 0;
try {
  for (const job of JOBS) {
    const out = resolve(ROOT, job.out);
    mkdirSync(dirname(out), { recursive: true });
    const url = pathToFileURL(resolve(ROOT, job.src)).href + (job.query ? `?${job.query}` : '');
    const common = [
      '--headless=new',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--virtual-time-budget=3000',
    ];

    let res;
    if (job.canvas) {
      // The page draws the SVG on a canvas and prints a data: URL; we pull the bytes out of the DOM dump.
      res = spawnSync(CHROME, [...common, '--window-size=256,256', '--dump-dom', url], {
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 64 * 1024 * 1024,
      });
      const match = /data:image\/png;base64,([A-Za-z0-9+/=]+)/.exec(res.stdout || '');
      if (match) writeFileSync(out, Buffer.from(match[1], 'base64'));
    } else {
      const args = [...common, `--window-size=${job.w},${job.h}`, `--screenshot=${out}`];
      if (job.modules) args.push('--allow-file-access-from-files');
      args.push(url);
      res = spawnSync(CHROME, args, { encoding: 'utf8', timeout: 60000 });
    }
    const size = existsSync(out) ? pngSize(out) : null;
    if (!size) {
      failed++;
      console.error(`✗ ${job.out}\n${res.stderr || res.stdout}`);
      continue;
    }
    const ok = size.w === job.w && size.h === job.h;
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${job.out}  ${size.w}×${size.h}${ok ? '' : ` (wanted ${job.w}×${job.h})`}`);
  }
} finally {
  rmSync(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
