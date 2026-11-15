// Saves a three-second voice sample per cast member into config/voices/<first name>.mp3 (the "Hear" button).
// Uses ElevenLabs when ELEVENLABS_API_KEY is set, else Deepgram Aura when DEEPGRAM_API_KEY is set. Skips existing files.
// Voices come from config/voices.json. Does nothing without one of the two keys.
//   npx tsx scripts/capture-voices.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const root = path.resolve(import.meta.dirname, '..');
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });

const eleven = process.env.ELEVENLABS_API_KEY;
const deepgram = process.env.DEEPGRAM_API_KEY;
if (!eleven && !deepgram) {
  console.log('skipped: no ELEVENLABS_API_KEY or DEEPGRAM_API_KEY (LiveKit Inference voices cannot be sampled outside a room)');
  process.exit(0);
}

type Voices = Record<string, { elevenlabs?: { voiceId: string }; deepgram?: { voiceId: string } }>;
const voices = JSON.parse(readFileSync(path.join(root, 'config/voices.json'), 'utf8')) as Voices;
const dir = path.join(root, 'config/voices');
mkdirSync(dir, { recursive: true });

const line = (name: string): string => `Hi, I'm ${name}. Good to meet you. I'm ready when you are.`;
let done = 0;
for (const [name, v] of Object.entries(voices)) {
  if (name.startsWith('_')) continue;
  const file = path.join(dir, `${name.toLowerCase()}.mp3`);
  if (existsSync(file)) continue;
  let res: Response;
  if (eleven && v.elevenlabs?.voiceId) {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${v.elevenlabs.voiceId}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': eleven, 'content-type': 'application/json' },
      body: JSON.stringify({ text: line(name), model_id: 'eleven_flash_v2_5' }),
    });
  } else if (deepgram && v.deepgram?.voiceId) {
    res = await fetch(`https://api.deepgram.com/v1/speak?model=${v.deepgram.voiceId}&encoding=mp3`, {
      method: 'POST',
      headers: { authorization: `Token ${deepgram}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: line(name) }),
    });
  } else continue;
  if (!res.ok) {
    console.error(`${name}: ${res.status} ${(await res.text()).slice(0, 120)}`);
    continue;
  }
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`saved ${path.relative(root, file)}`);
  done++;
}
console.log(done ? `${done} saved` : 'nothing to save (files exist)');
