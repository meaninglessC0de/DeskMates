// Render edit B with the Node API. Usage: node render.mjs still <seconds...> | node render.mjs full [out]
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const video = path.resolve(root, '../..');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [mode, ...rest] = process.argv.slice(2);

const bundled = await bundle({
  entryPoint: path.join(root, 'index.ts'),
  publicDir: path.join(video, 'public'),
  webpackOverride: (c) => ({...c, resolve: {...c.resolve, modules: [path.join(video, 'node_modules'), 'node_modules']}, resolveLoader: {...c.resolveLoader, modules: [path.join(video, 'node_modules'), 'node_modules']}}),
});
const comp = await selectComposition({serveUrl: bundled, id: 'DeskmatesB', browserExecutable: chrome, timeoutInMilliseconds: 240000});
if (mode === 'still') {
  const outDir = process.env.STILLS || path.join(root, 'out', 'stills');
  fs.mkdirSync(outDir, {recursive: true});
  for (const s of rest) {
    const frame = Math.round(parseFloat(s) * 30);
    await renderStill({composition: comp, serveUrl: bundled, frame, output: path.join(outDir, `f${String(s).replace('.', '_')}.png`), browserExecutable: chrome, imageFormat: 'png'});
    console.log('still', s);
  }
} else {
  const out = rest[0] || path.join(root, 'out', 'silent.mp4');
  const range = process.env.RANGE ? process.env.RANGE.split('-').map(Number) : null;
  await renderMedia({
    composition: comp, serveUrl: bundled, codec: 'h264', crf: 16, outputLocation: out, concurrency: 3, timeoutInMilliseconds: 240000, offthreadVideoCacheSizeInBytes: 2 * 1024 * 1024 * 1024,
    browserExecutable: chrome, muted: true, ...(range ? {frameRange: range} : {}),
    onProgress: ({progress}) => { if (Math.round(progress * 1000) % 25 === 0) process.stdout.write(`\r${(progress * 100).toFixed(1)}%`); },
  });
  console.log('\ndone', out);
}
