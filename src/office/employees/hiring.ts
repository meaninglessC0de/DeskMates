import type { Candidate, Env, Persona, RolePreset } from '../../shared/index.ts';
import { z } from 'zod';
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

/** The part of `@anthropic-ai/sdk`'s client that hiring uses, so a fake can be injected in tests. */
export interface RoleClient {
  messages: {
    create(params: Record<string, unknown>): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

/** Offline and deterministic: the role is the description's first words. Used with MOCK_LLM=1 and as the fallback. */
export function describeRoleOffline(description: string): RoleSpec {
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

const ROLE_SCHEMA = {
  type: 'object',
  properties: {
    role: { type: 'string', description: 'A job title of one to three words, for example "Customer support".' },
    blurb: { type: 'string', description: 'What this person does, under 60 characters, no full stop.' },
    personality: { type: 'string', description: 'One line, two short sentences at most, describing how they come across.' },
    workingStyle: { type: 'string', description: 'One or two sentences on how they work: habits, what they check, when they ask.' },
    starters: { type: 'array', items: { type: 'string' }, description: 'Three short task starters of two to four words each.' },
  },
  required: ['role', 'blurb', 'personality', 'workingStyle', 'starters'],
  additionalProperties: false,
};

const ROLE_SYSTEM =
  'You turn a manager\'s description of a hire into the fields of a job profile for an AI employee who works on a computer. ' +
  'Write plainly, in sentence case, with no emoji and no marketing language. Never mention being an AI or a model.';

const RoleOut = z.object({
  role: z.string().min(1),
  blurb: z.string().min(1),
  personality: z.string().min(1),
  workingStyle: z.string().min(1),
  starters: z.array(z.string().min(1)).min(1),
});

function clean(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…';
}

export function parseRoleSpec(text: string): RoleSpec | null {
  try {
    const raw = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    const o = RoleOut.parse(JSON.parse(raw));
    return {
      role: clean(o.role, 30),
      blurb: clean(o.blurb, 80),
      personality: clean(o.personality, 100),
      workingStyle: clean(o.workingStyle, 220),
      starters: o.starters.slice(0, 3).map((x) => clean(x, 30)),
    };
  } catch {
    return null;
  }
}

/**
 * Turns a described role into a persona's role fields with one `VOICE_MODEL` (claude-haiku-5-5) call and a JSON schema
 * output (employee-runtime.md section 7). With MOCK_LLM=1, with no key, or when the call fails or returns something
 * unusable, it falls back to the offline version so that hiring never breaks.
 */
export async function describeRole(description: string, env: Env, deps: { client?: RoleClient } = {}): Promise<RoleSpec> {
  if (env.MOCK_LLM || (!deps.client && !env.ANTHROPIC_API_KEY)) return describeRoleOffline(description);
  try {
    let client = deps.client;
    if (!client) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 20_000, maxRetries: 1 }) as unknown as RoleClient;
    }
    const res = await client.messages.create({
      model: env.VOICE_MODEL,
      max_tokens: 700,
      system: ROLE_SYSTEM,
      messages: [{ role: 'user', content: `Description of the hire:\n${description.trim().slice(0, 600)}` }],
      output_config: { format: { type: 'json_schema', schema: ROLE_SCHEMA } },
    });
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    const spec = parseRoleSpec(text);
    if (spec) return spec;
    console.warn('[office] the role description came back unusable, using the offline version');
  } catch (err) {
    console.warn(`[office] could not describe the role with the model (${(err as Error).message}), using the offline version`);
  }
  return describeRoleOffline(description);
}

export interface CandidateInput {
  roleKey: string;
  description?: string;
  exclude?: string[];
}

export async function makeCandidate(
  input: CandidateInput,
  ctx: { env: Env; store: Store; presets: RolePreset[]; maxTeam: number; roleClient?: RoleClient },
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
        const spec = await describeRole(input.description!, ctx.env, { client: ctx.roleClient });
        return personaFromCast(pick, { role: spec.role, roleKey: 'custom', workingStyle: spec.workingStyle, starters: spec.starters }, spec.personality);
      })();
  return { token: encodeToken({ castId: pick.id, persona }), persona };
}
