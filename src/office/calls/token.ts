import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk';
import type { Env } from '../../shared/index.ts';

export const AGENT_NAME = 'employee-call';

export interface DispatchParticipant {
  employeeId: string;
  firstName: string;
  role: string;
  voice: { provider: string; voiceId: string; model?: string };
  avatarId: string | null;
}

export interface DispatchMetadata {
  callId: string;
  officeUrl: string;
  speech: { stt: string; tts: string };
  avatar: boolean;
  participants: DispatchParticipant[];
}

/** The user's room token. Explicit agent dispatch; the metadata is a JSON string (sync_streams keeps avatar audio and video together). */
export async function mintUserToken(env: Pick<Env, 'LIVEKIT_API_KEY' | 'LIVEKIT_API_SECRET'>, opts: { room: string; identity: string; name: string; metadata: DispatchMetadata; ttlSeconds?: number }): Promise<string> {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: opts.identity,
    name: opts.name,
    ttl: opts.ttlSeconds ?? 2 * 60 * 60,
  });
  at.addGrant({ roomJoin: true, room: opts.room, canPublish: true, canSubscribe: true, canPublishData: true });
  at.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: AGENT_NAME, metadata: JSON.stringify(opts.metadata) })],
    syncStreams: true,
  });
  return at.toJwt();
}
