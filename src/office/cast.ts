import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Persona } from '../shared/index.ts';

const CONFIG = path.resolve(import.meta.dirname, '../../config');

export interface CastMember {
  id: string;
  name: string;
  firstName: string;
  roleKey: string;
  role: string;
  personality: string;
  portrait: string;                 // file name under config/portraits/
  gender: 'woman' | 'man';
  voice: { provider: 'livekit' | 'deepgram' | 'elevenlabs'; voiceId: string; label: string };
  avatarId: string | null;
}

/** Read on every call so avatar ids and portraits added while office runs are picked up. */
export function loadCast(): CastMember[] {
  return JSON.parse(readFileSync(path.join(CONFIG, 'cast.json'), 'utf8')) as CastMember[];
}

export function portraitUrlFor(file: string): string {
  return file && existsSync(path.join(CONFIG, 'portraits', file)) ? `/media/portraits/${file}` : '';
}

/** `config/voices/<first name lowercase>.(mp3|wav|m4a|ogg)`; null (the UI hides "Hear") when none exists. */
export function voiceSampleUrlFor(firstName: string): string | null {
  for (const ext of ['mp3', 'wav', 'm4a', 'ogg']) {
    const f = `${firstName.toLowerCase()}.${ext}`;
    if (existsSync(path.join(CONFIG, 'voices', f))) return `/media/voices/${f}`;
  }
  return null;
}

export function personaFromCast(c: CastMember, role: { role: string; roleKey: string; workingStyle: string; starters: string[] }, personality?: string): Persona {
  return {
    name: c.name,
    firstName: c.firstName,
    role: role.role,
    roleKey: role.roleKey,
    personality: personality ?? c.personality,
    workingStyle: role.workingStyle,
    starters: role.starters,
    portraitUrl: portraitUrlFor(c.portrait),
    voice: { ...c.voice, sampleUrl: voiceSampleUrlFor(c.firstName) },
    avatarId: c.avatarId,
  };
}
