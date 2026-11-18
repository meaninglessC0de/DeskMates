// usage: node render.mjs still <seconds...>   |   node render.mjs video [startSec endSec outFile]
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const video = path.resolve(root, '../..');
const browserExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [mode, ...rest] = process.argv.slice(2);
const serveUrl = await bundle({ entryPoint: path.join(root, 'index.ts'), publicDir: path.join(video, 'public'), rootDir: video,
  webpackOverride: (c) => c });
const composition = await selectComposition({ serveUrl, id: 'DeskmatesA', browserExecutable });
if (mode === 'still') {
  fs.mkdirSync(path.join(root, 'out/stills'), { recursive: true });
  for (const s of rest) {
    const out = path.join(root, `out/stills/t${String(s).replace('.', '_')}.png`);
    await renderStill({ composition, serveUrl, frame: Math.round(parseFloat(s) * 30), output: out, browserExecutable });
    console.log('still', out);
  }
} else {
  const [a, b, outFile] = rest;
  const startFrame = Math.round(parseFloat(a ?? 0) * 30);
  const endFrame = Math.min(composition.durationInFrames - 1, Math.round(parseFloat(b ?? 120) * 30) - 1);
  let last = -1;
  await renderMedia({ composition, serveUrl, codec: 'h264', crf: 16, concurrency: 4, browserExecutable,
    outputLocation: outFile ?? path.join(root, 'out/silent.mp4'), frameRange: [startFrame, endFrame], muted: true,
    onProgress: ({ progress }) => { const p = Math.floor(progress * 20); if (p !== last) { last = p; console.log('progress', p * 5); } } });
  console.log('done');
}
