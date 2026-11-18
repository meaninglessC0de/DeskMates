import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const entry = path.resolve(here, '../index.ts');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const mode = args[0]; // stills | video | range
const bundled = await bundle({entryPoint: entry, publicDir: path.join(root, 'public'), webpackOverride: (c) => c});
const comp = await selectComposition({serveUrl: bundled, id: 'DeskmatesC', browserExecutable: chrome});
if (mode === 'stills') {
  const out = args[1];
  for (const s of args.slice(2)) {
    const frame = Math.round(parseFloat(s) * 30);
    await renderStill({composition: comp, serveUrl: bundled, frame, output: path.join(out, `f_${s}.png`), browserExecutable: chrome, imageFormat: 'png'});
    console.log('still', s);
  }
} else {
  const out = args[1];
  const range = args[2] ? args[2].split('-').map((v) => Math.round(parseFloat(v) * 30)) : null;
  await renderMedia({
    composition: comp, serveUrl: bundled, codec: 'h264', crf: 16, outputLocation: out, concurrency: 4, browserExecutable: chrome, port: 3377,
    frameRange: range ? [range[0], range[1] - 1] : undefined, muted: true, onProgress: ({progress}) => { if (Math.round(progress * 100) % 5 === 0) process.stdout.write(`\r${Math.round(progress * 100)}%`); },
    chromiumOptions: {gl: 'angle'},
  });
  console.log('\ndone');
}
