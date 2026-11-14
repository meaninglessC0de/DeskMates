#!/usr/bin/env node
// Usage: node scripts/purity.mjs <folder>
// Runs `astryx doctor --built <folder> --json` and exits 1 if the Astryx purity check
// finds anything (raw elements, library icons, inline styles, classes, imported CSS) under <folder>.
// The folder itself is passed to doctor (not `.`) so that other trees, e.g. vendor/, cannot
// use up doctor's 20,000-file read budget or crowd the findings out. Doctor lists the
// first five findings in its message and counts the rest; any finding fails this script.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const arg = process.argv[2];
if (!arg) {
  console.error('usage: purity.mjs <folder>');
  process.exit(2);
}
const abs = resolve(root, arg);
const folder = relative(root, abs).split(sep).join('/').replace(/\/$/, '') || '.';

if (!existsSync(abs)) {
  console.log(`purity: ${folder} does not exist, not inspected`);
  process.exit(0);
}

const bin = resolve(root, 'node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs');
const res = spawnSync(process.execPath, [bin, 'doctor', '--built', folder, '--json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
let report;
try {
  report = JSON.parse(res.stdout);
} catch {
  console.error('purity: could not parse doctor output');
  console.error(`${res.stdout ?? ''}${res.stderr ?? ''}`.slice(0, 2000));
  process.exit(2);
}

const check = report.data.checks.find((c) => c.id === 'built-astryx-purity');
if (!check) {
  console.log(`purity: ${folder} not inspected (no purity check ran)`);
  process.exit(0);
}
const m = /^(\d+) findings?\b[^:]*: (.*)$/s.exec(check.message);
if (!m) {
  console.log(`purity: ${folder}: ${check.message}`);
  process.exit(0);
}

const total = Number(m[1]);
const prefix = folder === '.' ? '' : folder + '/';
const listed = m[2].replace(/\.$/, '').split('; ');
const lines = [];
for (const item of listed) {
  const more = /^and (\d+) more\b/.exec(item);
  if (more) {
    lines.push(`... and ${more[1]} more (fix the above and run again)`);
    continue;
  }
  const trimmed = item.replace(/\s+and \d+ more$/, '');
  lines.push(prefix + trimmed);
  const tail = /\sand (\d+) more$/.exec(item);
  if (tail) lines.push(`... and ${tail[1]} more (fix the above and run again)`);
}
console.log(lines.join('\n'));
console.error(`purity: ${total} finding(s) under ${folder}`);
process.exit(1);
