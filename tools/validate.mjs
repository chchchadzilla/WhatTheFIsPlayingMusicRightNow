#!/usr/bin/env node
/**
 * validate.mjs — sanity checks you can run before loading the extension or
 * opening a pull request. Zero dependencies.
 *
 *   node tools/validate.mjs
 *
 * Checks:
 *   - manifest.json parses and is Manifest V3
 *   - every file the manifest points at exists
 *   - icon PNGs exist and are the exact size the manifest claims
 *   - every .js file passes a syntax check (node --check)
 *   - no inline <script> blocks in extension HTML (MV3 CSP forbids them)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let problems = 0;
const ok = (msg) => console.log(`✓ ${msg}`);
const bad = (msg) => {
  problems++;
  console.error(`✗ ${msg}`);
};

/* ---- manifest ---- */
let manifest;
try {
  manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  ok('manifest.json parses');
} catch (err) {
  bad(`manifest.json does not parse: ${err.message}`);
  process.exit(1);
}
if (manifest.manifest_version === 3) ok('manifest_version is 3');
else bad(`manifest_version is ${manifest.manifest_version}, expected 3`);
if ((manifest.description || '').length <= 132) ok(`description is ${manifest.description.length} chars (≤132)`);
else bad(`description is ${manifest.description.length} chars; the Chrome Web Store limit is 132`);

const refs = new Set();
for (const p of Object.values(manifest.icons || {})) refs.add(p);
for (const p of Object.values((manifest.action && manifest.action.default_icon) || {})) refs.add(p);
if (manifest.action && manifest.action.default_popup) refs.add(manifest.action.default_popup);
if (manifest.background && manifest.background.service_worker) refs.add(manifest.background.service_worker);
if (manifest.options_ui && manifest.options_ui.page) refs.add(manifest.options_ui.page);
for (const cs of manifest.content_scripts || []) for (const p of [...(cs.js || []), ...(cs.css || [])]) refs.add(p);
for (const p of refs) {
  if (existsSync(join(ROOT, p))) ok(`exists: ${p}`);
  else bad(`missing file referenced by manifest: ${p}`);
}

/* ---- icon sizes ---- */
function pngSize(file) {
  const b = readFileSync(file);
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
for (const [size, p] of Object.entries(manifest.icons || {})) {
  const file = join(ROOT, p);
  if (!existsSync(file)) continue; // already reported
  const dim = pngSize(file);
  if (dim && dim.w === Number(size) && dim.h === Number(size)) ok(`${p} is ${size}×${size}`);
  else bad(`${p} should be ${size}×${size} but is ${dim ? `${dim.w}×${dim.h}` : 'not a PNG'}`);
}

/* ---- JS syntax ---- */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'dist'].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(m?js)$/.test(name)) out.push(full);
  }
  return out;
}
for (const file of walk(join(ROOT, 'src')).concat(walk(join(ROOT, 'tools')))) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  const rel = relative(ROOT, file);
  if (res.status === 0) ok(`syntax: ${rel}`);
  else bad(`syntax error in ${rel}\n${res.stderr}`);
}

/* ---- no inline scripts in extension pages ---- */
for (const page of ['src/popup/popup.html', 'src/options/options.html']) {
  const html = readFileSync(join(ROOT, page), 'utf8');
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) bad(`${page} has an inline <script>; MV3 pages must load scripts from files`);
  else if (/\son[a-z]+\s*=/i.test(html)) bad(`${page} has an inline on*= handler; use addEventListener instead`);
  else ok(`no inline scripts: ${page}`);
}

console.log(problems ? `\n${problems} problem(s) found.` : '\nAll good. Load it up.');
process.exit(problems ? 1 : 0);
