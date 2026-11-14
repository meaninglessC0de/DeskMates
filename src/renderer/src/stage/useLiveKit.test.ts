import { describe, expect, it } from 'vitest';
import { pickMedia } from './useLiveKit';

const e = (identity: string, kind: 'audio' | 'video', track = `${identity}-${kind}`) => ({ identity, kind, track });

describe('pickMedia', () => {
  it('nothing remote gives nothing', () => {
    expect(pickMedia([])).toEqual({ video: null, audio: null });
  });
  it('audio-only: the agent voice, no video', () => {
    const r = pickMedia([e('agent', 'audio')]);
    expect(r.video).toBeNull();
    expect(r.audio?.identity).toBe('agent');
  });
  it('avatar: the video and the audio of the same participant, even when another audio track came first', () => {
    const r = pickMedia([e('agent', 'audio'), e('synthesia-avatar-agent', 'video'), e('synthesia-avatar-agent', 'audio')]);
    expect(r.video?.identity).toBe('synthesia-avatar-agent');
    expect(r.audio?.identity).toBe('synthesia-avatar-agent');
  });
  it('video without its own audio falls back to any audio', () => {
    const r = pickMedia([e('agent', 'audio'), e('avatar', 'video')]);
    expect(r.audio?.identity).toBe('agent');
  });
});
