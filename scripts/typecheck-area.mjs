#!/usr/bin/env node
// Usage: node scripts/typecheck-area.mjs <folder>
// Runs tsc for the project that owns <folder> and prints only diagnostics under <folder>.
import { spawnSync } from 'node:child_process';
import { resolve, relative, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const arg = process.argv[2];
if (!arg) {
  console.error('usage: typecheck-area.mjs <folder>');
  process.exit(2);
}
const folder = relative(root, resolve(root, arg)).split(sep).join('/').replace(/\/$/, '');

const projects = [
  ['tsconfig.office.json', ['src/office', 'src/shared', 'scripts']],
  ['tsconfig.web.json', ['src/renderer']],
  ['tsconfig.node.json', ['src/main', 'src/preload']],
];
const hit = projects.find(([, dirs]) => dirs.some((d) => folder === d || folder.startsWith(d + '/')));
const project = hit ? hit[0] : 'tsconfig.office.json';

const tsc = resolve(root, 'node_modules/typescript/bin/tsc');
const res = spawnSync(process.execPath, [tsc, '--noEmit', '-p', project, '--pretty', 'false'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
if (res.error) {
  console.error(res.error.message);
  process.exit(2);
}

const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.split('\n');
const kept = [];
let keeping = false;
for (const line of out) {
  const m = /^(.+?)\(\d+,\d+\): (error|warning) TS\d+/.exec(line);
  if (m) {
    const file = m[1].split(sep).join('/');
    keeping = file === folder || file.startsWith(folder + '/');
    if (keeping) kept.push(line);
  } else if (keeping && line.startsWith(' ')) {
    kept.push(line); // continuation lines of a multi-line diagnostic
  } else if (/^error TS\d+/.test(line) && !m) {
    keeping = false; // global errors without a file are not an area's
  } else {
    keeping = false;
  }
}
if (kept.length) {
  console.log(kept.join('\n'));
  console.error(`${kept.filter((l) => / error TS/.test(l)).length} error(s) under ${folder}`);
  process.exit(1);
}
console.log(`no type errors under ${folder} (${project})`);
