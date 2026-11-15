import { describe, expect, it } from 'vitest';
import { AGENT_NAME, mintUserToken, type DispatchMetadata } from './token.ts';
import { chooseSpeech, loadVoices, voiceFor } from './voices.ts';

const decode = (jwt: string): Record<string, any> => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));

describe('mintUserToken', () => {
  it('encodes the room, identity, grants and the agent dispatch with a JSON string of metadata', async () => {
    const metadata: DispatchMetadata = {
      callId: 'call_1', officeUrl: 'http://127.0.0.1:4327', speech: { stt: 'livekit', tts: 'livekit' }, avatar: false,
      participants: [{ employeeId: 'e1', firstName: 'Maya', role: 'Web developer', voice: { provider: 'livekit', voiceId: 'harmonia', model: 'deepgram/aura-2' }, avatarId: null }],
    };
    const jwt = await mintUserToken({ LIVEKIT_API_KEY: 'APIkey123', LIVEKIT_API_SECRET: 'secret-secret-secret-secret-0123456789' }, { room: 'room-x', identity: 'manager', name: 'Sam', metadata });
    const c = decode(jwt);
    expect(c.iss).toBe('APIkey123');
    expect(c.sub).toBe('manager');
    expect(c.name).toBe('Sam');
    expect(c.video).toMatchObject({ roomJoin: true, room: 'room-x', canPublish: true, canSubscribe: true, canPublishData: true });
    expect(c.exp - c.nbf).toBeGreaterThan(3600);
    const agent = c.roomConfig.agents[0];
    expect(agent.agentName).toBe(AGENT_NAME);
    expect(typeof agent.metadata).toBe('string');
    expect(JSON.parse(agent.metadata)).toEqual(metadata);
    expect(c.roomConfig.syncStreams).toBe(true);
  });
});

describe('voices', () => {
  it('config/voices.json has eight distinct voices per provider', () => {
    const v = loadVoices();
    const names = ['maya', 'priya', 'jonas', 'ines', 'kenji', 'amara', 'marcus', 'hannah'];
    expect(Object.keys(v).sort()).toEqual([...names].sort());
    for (const p of ['livekit', 'deepgram', 'elevenlabs'] as const) {
      const ids = names.map((n) => (v[n][p] as { voiceId: string }).voiceId);
      expect(new Set(ids).size).toBe(8);
      expect(ids.every(Boolean)).toBe(true);
    }
  });
  it('voiceFor follows the chosen provider and is case-insensitive', () => {
    expect(voiceFor('Maya', 'livekit')).toEqual({ provider: 'livekit', voiceId: 'harmonia', model: 'deepgram/aura-2' });
    expect(voiceFor('MAYA', 'deepgram').voiceId).toBe('aura-2-harmonia-en');
    expect(voiceFor('Nobody', 'elevenlabs')).toEqual({ provider: 'elevenlabs', voiceId: '' });
  });
  it('chooseSpeech: LiveKit Inference alone, Deepgram when its key exists, ElevenLabs speech when its key exists', () => {
    expect(chooseSpeech({ DEEPGRAM_API_KEY: '', ELEVENLABS_API_KEY: '' })).toEqual({ stt: 'livekit', tts: 'livekit' });
    expect(chooseSpeech({ DEEPGRAM_API_KEY: 'd', ELEVENLABS_API_KEY: '' })).toEqual({ stt: 'deepgram', tts: 'deepgram' });
    expect(chooseSpeech({ DEEPGRAM_API_KEY: 'd', ELEVENLABS_API_KEY: 'e' })).toEqual({ stt: 'deepgram', tts: 'elevenlabs' });
    expect(chooseSpeech({ DEEPGRAM_API_KEY: '', ELEVENLABS_API_KEY: 'e' })).toEqual({ stt: 'livekit', tts: 'elevenlabs' });
  });
});
