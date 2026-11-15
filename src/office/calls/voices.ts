import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Env } from '../../shared/index.ts';

const CONFIG = path.resolve(import.meta.dirname, '../../../config');

export type SpeechProvider = 'livekit' | 'deepgram' | 'elevenlabs';

/** What the worker uses for speech to text and text to speech. office decides; the worker follows. */
export interface SpeechChoice {
  stt: 'livekit' | 'deepgram';
  tts: SpeechProvider;
}

export function chooseSpeech(env: Pick<Env, 'DEEPGRAM_API_KEY' | 'ELEVENLABS_API_KEY'>): SpeechChoice {
  return {
    stt: env.DEEPGRAM_API_KEY ? 'deepgram' : 'livekit',
    tts: env.ELEVENLABS_API_KEY ? 'elevenlabs' : env.DEEPGRAM_API_KEY ? 'deepgram' : 'livekit',
  };
}

export interface VoiceEntry {
  gender: string;
  label: string;
  livekit: { model: string; voiceId: string };
  deepgram: { voiceId: string };
  elevenlabs: { voiceId: string };
}

export function loadVoices(file = path.join(CONFIG, 'voices.json')): Record<string, VoiceEntry> {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const out: Record<string, VoiceEntry> = {};
    for (const [k, v] of Object.entries(raw)) if (!k.startsWith('_') && v && typeof v === 'object') out[k.toLowerCase()] = v as VoiceEntry;
    return out;
  } catch {
    return {};
  }
}

/** The voice for one person under the chosen provider: `{ provider, voiceId, model? }`. Empty voiceId = the worker's default. */
export function voiceFor(firstName: string, tts: SpeechProvider, voices = loadVoices()): { provider: SpeechProvider; voiceId: string; model?: string } {
  const v = voices[firstName.toLowerCase()];
  if (!v) return { provider: tts, voiceId: '' };
  if (tts === 'livekit') return { provider: tts, voiceId: v.livekit.voiceId, model: v.livekit.model };
  return { provider: tts, voiceId: v[tts].voiceId };
}

export interface AvatarEntry {
  avatarId: string;
  portrait: string;
}

/** config/avatars.json, keyed by lowercase first name. Used when the cast file has no avatar id for someone. */
export function loadAvatars(file = path.join(CONFIG, 'avatars.json')): Record<string, AvatarEntry> {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const out: Record<string, AvatarEntry> = {};
    for (const [k, v] of Object.entries(raw)) {
      const e = v as Partial<AvatarEntry> | null;
      if (!k.startsWith('_') && e && typeof e.avatarId === 'string' && e.avatarId) out[k.toLowerCase()] = { avatarId: e.avatarId, portrait: e.portrait ?? '' };
    }
    return out;
  } catch {
    return {};
  }
}
