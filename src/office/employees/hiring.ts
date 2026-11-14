import type { Candidate, Env, Persona, RolePreset } from '../../shared/index.ts';
import { loadCast, personaFromCast } from '../cast.ts';
import { OfficeError } from '../errors.ts';
import type { Store } from '../store/store.ts';

interface TokenBody {
  castId: string;
  persona: Persona;
}

export function encodeToken(body: TokenBody): string {
  return Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
}

export function decodeToken(token: string): TokenBody | null {
  try {
    const b = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as TokenBody;
    return b && typeof b.castId === 'string' && b.persona ? b : null;
  } catch {
    return null;
  }
}

export interface RoleSpec {
  role: string;
  blurb: string;
  personality: string;
  workingStyle: string;
  starters: string[];
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

/**
 * Turns a described role into a persona's role fields. Deterministic and offline: the role is the description's
 * first words. W2 replaces this with one `claude-haiku-5-5` call (employee-runtime.md section 7).
 */
export async function describeRole(description: string, _env: Env): Promise<RoleSpec> {
  const words = description.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
  const role = titleCase(words.slice(0, 3).join(' ')) || 'Specialist';
  return {
    role,
    blurb: description.trim().slice(0, 80),
    personality: 'Capable and calm. Gets on with it.',
    workingStyle: `Focuses on this: ${description.trim().slice(0, 140)}. Works in small steps and checks the result before saying done.`,
    starters: ['Get started', 'Make a plan', 'Show me what you have'],
  };
}

export interface CandidateInput {
  roleKey: string;
  description?: string;
  exclude?: string[];
}

export async function makeCandidate(
  input: CandidateInput,
  ctx: { env: Env; store: Store; presets: RolePreset[]; maxTeam: number },
): Promise<Candidate> {
  if (ctx.store.countEmployees() >= ctx.maxTeam) {
    throw new OfficeError(409, 'team_full', 'Your team is full. Remove someone to hire again.');
  }
  const preset = input.roleKey === 'custom' ? null : ctx.presets.find((p) => p.key === input.roleKey);
  if (input.roleKey !== 'custom' && !preset) throw new OfficeError(400, 'bad_request', 'That role does not exist.');
  if (!preset && !input.description?.trim()) throw new OfficeError(400, 'bad_request', 'Describe the role you need.');

  const cast = loadCast();
  const hired = new Set(ctx.store.castIdsInUse());
  const excluded = new Set((input.exclude ?? []).map((t) => decodeToken(t)?.castId).filter((x): x is string => !!x));
  let pool = cast.filter((c) => !hired.has(c.id) && !excluded.has(c.id));
  if (pool.length === 0) pool = cast.filter((c) => !hired.has(c.id));
  if (pool.length === 0) throw new OfficeError(409, 'team_full', 'Your team is full. Remove someone to hire again.');
  const pick = (preset && pool.find((c) => c.roleKey === preset.key)) || pool[0];

  const persona = preset
    ? personaFromCast(pick, { role: preset.role, roleKey: preset.key, workingStyle: preset.workingStyle, starters: preset.starters })
    : await (async () => {
        const spec = await describeRole(input.description!, ctx.env);
        return personaFromCast(pick, { role: spec.role, roleKey: 'custom', workingStyle: spec.workingStyle, starters: spec.starters }, spec.personality);
      })();
  return { token: encodeToken({ castId: pick.id, persona }), persona };
}
