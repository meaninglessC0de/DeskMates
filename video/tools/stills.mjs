import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const composition = await selectComposition({ serveUrl, id: process.env.COMP || 'Deskmates' });
for (const s of process.argv.slice(2).map(Number)) {
  await renderStill({ composition, serveUrl, frame: Math.round(s * 30), output: `out/still-${s}.jpg`, imageFormat: 'jpeg', scale: 0.5 });
  console.log('still', s);
}
