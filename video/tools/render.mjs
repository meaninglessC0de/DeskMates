import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'node:path';
const id = process.argv[2] || 'Deskmates';
const outFile = process.argv[3] || 'out/deskmates-raw.mp4';
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const composition = await selectComposition({ serveUrl, id });
let last = -1;
await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation: outFile, concurrency: 10, crf: 16, audioBitrate: '320k',
  onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; console.log('progress', p * 10); } } });
console.log('done', outFile);
