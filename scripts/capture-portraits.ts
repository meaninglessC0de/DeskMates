// Saves a portrait (4:5) and a square still for every cast member that has an avatar id, from a short Synthesia session.
// Skips people whose files already exist. Does nothing without LiveKit and Synthesia keys or without avatar ids.
//   npx tsx scripts/capture-portraits.ts
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const root = path.resolve(import.meta.dirname, '..');
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });

const need = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'SYNTHESIA_API_KEY'];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.log(`skipped: no ${missing.join(', ')}`);
  process.exit(0);
}

const cast = JSON.parse(readFileSync(path.join(root, 'config/cast.json'), 'utf8')) as { firstName: string; avatarId: string | null }[];
// the cast file's avatar id, else config/avatars.json
const avatars = JSON.parse(readFileSync(path.join(root, 'config/avatars.json'), 'utf8')) as Record<string, { avatarId?: string }>;
const out = path.join(root, 'config/portraits');
let done = 0;
for (const c of cast) {
  const name = c.firstName.toLowerCase();
  const avatarId = c.avatarId ?? avatars[c.firstName]?.avatarId;
  if (!avatarId) continue;
  if (existsSync(path.join(out, `${name}.jpg`)) && existsSync(path.join(out, `${name}-sq.jpg`))) continue;
  console.log(`capturing ${c.firstName}`);
  const r = spawnSync('uv', ['run', 'python', 'capture.py', name, avatarId, out], { cwd: path.join(root, 'voice'), stdio: 'inherit' });
  if (r.status !== 0) console.error(`failed for ${c.firstName}`);
  else done++;
}
console.log(done ? `${done} captured` : 'nothing to capture (no avatar ids, or the files already exist)');
