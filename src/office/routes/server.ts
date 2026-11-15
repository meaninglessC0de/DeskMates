import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { z } from 'zod';
import type { ClientEvent, ServerEvent } from '../../shared/index.ts';
import type { Office } from '../employees/office.ts';
import { OfficeError } from '../errors.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const CONFIG = path.join(ROOT, 'config');
const RENDERER = path.join(ROOT, 'out/renderer');

const permissionsSchema = z.object({
  level: z.enum(['asks_first', 'asks_big_steps', 'independent']),
  internet: z.boolean(),
  commands: z.boolean(),
  myScreen: z.boolean(),
  teammates: z.boolean(),
}).partial().strict();

const personaPatch = z.object({
  name: z.string().min(1).max(80),
  firstName: z.string().min(1).max(40),
  role: z.string().min(1).max(80),
  personality: z.string().max(300),
  workingStyle: z.string().max(600),
  starters: z.array(z.string()).max(3),
}).partial();

const schemas = {
  candidate: z.object({ roleKey: z.string().min(1), description: z.string().max(2000).optional(), exclude: z.array(z.string()).optional() }),
  hire: z.object({
    token: z.string().min(1),
    overrides: z.object({
      name: z.string().max(80).optional(),
      personality: z.string().max(300).optional(),
      permissions: permissionsSchema.optional(),
    }).optional(),
  }),
  patchEmployee: z.object({ persona: personaPatch.optional(), permissions: permissionsSchema.optional(), model: z.string().min(1).optional() }),
  control: z.object({ on: z.boolean() }),
  message: z.object({ text: z.string().min(1).max(20000) }),
  approval: z.object({ decision: z.enum(['approve', 'deny']), scope: z.enum(['once', 'task']).optional(), note: z.string().max(1000).optional() }),
  stream: z.object({ mode: z.enum(['view', 'control']).default('view') }),
  grant: z.object({ minutes: z.number().positive().nullable() }),
  call: z.object({ employeeIds: z.array(z.string()).min(1).max(4) }),
  address: z.object({ employeeId: z.string() }),
  ask: z.object({ question: z.string().min(1).max(2000), conversationId: z.string().optional() }),
  settings: z.object({
    userName: z.string().min(1).max(80),
    appearance: z.enum(['light', 'dark', 'system']),
    notifyMessages: z.boolean(),
    notifyDone: z.boolean(),
    captions: z.boolean(),
  }).partial(),
  range: z.enum(['today', 'week', 'month']),
  route: z.object({ utterance: z.string() }),
  voiceChat: z.object({
    model: z.string(),
    messages: z.array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string() })),
    stream: z.boolean().optional(),
  }),
  voiceEvent: z.object({ type: z.string() }).passthrough(),
};

function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value ?? {});
  if (!r.success) {
    const first = r.error.issues[0];
    const where = first?.path.join('.') ;
    throw new OfficeError(400, 'bad_request', `Invalid request${where ? ` (${where})` : ''}: ${first?.message ?? 'bad body'}.`);
  }
  return r.data;
}

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
};

async function serveConfigFile(reply: FastifyReply, dir: string, file: string): Promise<FastifyReply> {
  const safe = path.basename(file);
  const abs = path.join(CONFIG, dir, safe);
  if (safe !== file || !existsSync(abs)) throw new OfficeError(404, 'not_found', 'That file does not exist.');
  const buf = await readFile(abs);
  return reply.header('content-type', MIME[path.extname(safe).toLowerCase()] ?? 'application/octet-stream').header('cache-control', 'no-cache').send(buf);
}

function version(): string {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export async function buildServer(office: Office): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // POST and DELETE with a JSON content type and no body are normal for this API.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim() === '') return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      done(new OfficeError(400, 'bad_request', 'The request body is not valid JSON.'), undefined);
    }
  });

  app.setErrorHandler((err: Error & { status?: number; code?: string; statusCode?: number }, _req, reply) => {
    if (typeof err.status === 'number' && typeof err.code === 'string') {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: { code: 'bad_request', message: err.message } });
    }
    console.error('[office] unhandled error:', err);
    return reply.code(500).send({ error: { code: 'internal', message: 'Something went wrong on this Mac.' } });
  });

  app.setNotFoundHandler(async (req, reply) => {
    const url = req.url.split('?')[0];
    const isApi = ['/api', '/media', '/voice', '/ws'].some((p) => url === p || url.startsWith(p + '/'));
    if (req.method === 'GET' && !isApi && existsSync(path.join(RENDERER, 'index.html'))) {
      return reply.type('text/html').send(await readFile(path.join(RENDERER, 'index.html')));
    }
    return reply.code(404).send({ error: { code: 'not_found', message: 'That does not exist.' } });
  });

  await app.register(websocket);

  // ---- WebSocket

  app.get('/ws', { websocket: true }, (socket) => {
    const send = (e: ServerEvent) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(e));
    };
    const unsub = office.bus.subscribe(send);
    socket.on('message', (raw: Buffer) => {
      try {
        const m = JSON.parse(raw.toString()) as ClientEvent;
        void m; // only { type: 'ping' } exists; nothing to do
      } catch {
        /* ignore */
      }
    });
    socket.on('close', unsub);
    socket.on('error', unsub);
    void office.capabilities().then((capabilities) => send({ type: 'hello', capabilities }));
  });

  // ---- health, presets, candidates

  app.get('/api/health', async () => ({ ok: true, version: version(), capabilities: await office.capabilities() }));
  app.get('/api/presets', async () => office.listPresets());
  app.post('/api/candidates', async (req) => office.candidate(parse(schemas.candidate, req.body)));

  // ---- employees

  app.get('/api/employees', async () => office.listEmployees());
  app.post('/api/employees', async (req) => {
    const b = parse(schemas.hire, req.body);
    return office.hire(b.token, b.overrides);
  });
  app.get<{ Params: { id: string } }>('/api/employees/:id', async (req) => office.getEmployee(req.params.id));
  app.patch<{ Params: { id: string } }>('/api/employees/:id', async (req) => office.patchEmployee(req.params.id, parse(schemas.patchEmployee, req.body)));
  app.delete<{ Params: { id: string } }>('/api/employees/:id', async (req, reply) => {
    await office.removeEmployee(req.params.id);
    return reply.code(204).send();
  });
  app.post<{ Params: { id: string } }>('/api/employees/:id/pause', async (req) => office.pause(req.params.id));
  app.post<{ Params: { id: string } }>('/api/employees/:id/resume', async (req) => office.resume(req.params.id));
  app.post<{ Params: { id: string } }>('/api/employees/:id/control', async (req) => office.control(req.params.id, parse(schemas.control, req.body).on));
  app.post<{ Params: { id: string; action: string } }>('/api/employees/:id/desktop/:action', async (req) => {
    const a = req.params.action;
    if (a !== 'restart' && a !== 'reset' && a !== 'start' && a !== 'stop') throw new OfficeError(404, 'not_found', 'That does not exist.');
    return office.desktopAction(req.params.id, a);
  });

  // ---- thread and messages

  app.get<{ Params: { id: string }; Querystring: { before?: string; limit?: string } }>('/api/employees/:id/thread', async (req) => {
    const before = req.query.before !== undefined ? Number(req.query.before) : undefined;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    if ((before !== undefined && !Number.isFinite(before)) || (limit !== undefined && !Number.isFinite(limit))) {
      throw new OfficeError(400, 'bad_request', 'before and limit must be numbers.');
    }
    return office.thread(req.params.id, { before, limit });
  });
  app.post<{ Params: { id: string } }>('/api/employees/:id/messages', async (req) => office.sendMessage(req.params.id, parse(schemas.message, req.body).text));
  app.post<{ Params: { id: string } }>('/api/employees/:id/read', async (req, reply) => {
    office.markRead(req.params.id);
    return reply.code(204).send();
  });
  app.post<{ Params: { id: string } }>('/api/approvals/:id', async (req) => {
    const b = parse(schemas.approval, req.body);
    return office.decideApproval(req.params.id, b.decision, b.scope ?? 'task', b.note);
  });

  // ---- desktop media

  app.get<{ Params: { id: string } }>('/api/employees/:id/thumbnail.jpg', async (req, reply) =>
    reply.header('content-type', 'image/jpeg').header('cache-control', 'no-store').send(await office.thumbnail(req.params.id)));
  app.get<{ Params: { id: string } }>('/api/employees/:id/frame.jpg', async (req, reply) =>
    reply.header('content-type', 'image/jpeg').header('cache-control', 'no-store').send(await office.frame(req.params.id)));
  app.post<{ Params: { id: string } }>('/api/employees/:id/stream', async (req) => office.openStream(req.params.id, parse(schemas.stream, req.body).mode));
  app.post<{ Params: { id: string } }>('/api/employees/:id/screen-grant', async (req) => office.grantScreen(req.params.id, parse(schemas.grant, req.body).minutes));
  app.delete<{ Params: { id: string } }>('/api/employees/:id/screen-grant', async (req) => {
    office.getEmployee(req.params.id);
    await office.revokeScreen(req.params.id, 'taken_back');
    return office.getEmployee(req.params.id);
  });

  // ---- calls

  app.post('/api/calls', async (req) => office.startCall(parse(schemas.call, req.body).employeeIds));
  app.post<{ Params: { id: string } }>('/api/calls/:id/address', async (req, reply) => {
    await office.calls.address(req.params.id, parse(schemas.address, req.body).employeeId);
    return reply.code(204).send();
  });
  app.delete<{ Params: { id: string } }>('/api/calls/:id', async (req, reply) => {
    await office.calls.end(req.params.id);
    return reply.code(204).send();
  });

  // ---- team and settings

  app.get<{ Querystring: { range?: string } }>('/api/team', async (req) => office.team(parse(schemas.range, req.query.range ?? 'today')));
  app.post('/api/team/ask', async (req) => {
    const b = parse(schemas.ask, req.body);
    return office.ask(b.question, b.conversationId);
  });
  app.get('/api/settings', async () => office.getSettings());
  app.patch('/api/settings', async (req) => office.patchSettings(parse(schemas.settings, req.body)));

  // ---- media files (read from disk on every request, so files added later appear without a restart)

  app.get<{ Params: { file: string } }>('/media/portraits/:file', (req, reply) => serveConfigFile(reply, 'portraits', req.params.file));
  app.get<{ Params: { file: string } }>('/media/voices/:file', (req, reply) => serveConfigFile(reply, 'voices', req.params.file));

  // ---- voice worker endpoints

  app.post('/voice/v1/chat/completions', async (req, reply) => {
    const body = parse(schemas.voiceChat, req.body);
    const speaker = req.headers['x-speaker'];
    const ac = new AbortController();
    reply.raw.on('close', () => ac.abort());   // not req.raw: on current Node the request emits close as soon as its body is read
    const id = `chatcmpl-${Date.now()}`;
    const chunk = (delta: Record<string, string>, finish: string | null) =>
      `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    // start the stream before hijacking so that a thrown CallError still becomes a normal JSON error
    const iter = office.calls.chat(body.model, typeof speaker === 'string' ? speaker : undefined, body, ac.signal)[Symbol.asyncIterator]();
    const first = await iter.next();
    reply.hijack();
    reply.raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    reply.raw.write(chunk({ role: 'assistant' }, null));
    try {
      let r = first;
      while (!r.done) {
        reply.raw.write(chunk({ content: r.value }, null));
        r = await iter.next();
      }
      reply.raw.write(chunk({}, 'stop'));
    } catch {
      /* aborted by the caller */
    }
    reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();
  });
  app.post<{ Params: { id: string } }>('/voice/calls/:id/route', async (req) => ({
    speakers: await office.calls.route(req.params.id, parse(schemas.route, req.body).utterance),
  }));
  app.post<{ Params: { id: string } }>('/voice/calls/:id/events', async (req, reply) => {
    const ev = parse(schemas.voiceEvent, req.body);
    await office.calls.event(req.params.id, ev as never);
    return reply.code(204).send();
  });

  // ---- dev only

  if (office.env.MOCK_LLM) {
    app.post('/api/dev/seed', async (req, reply) => {
      office.devSeed((req.body ?? {}) as never);
      return reply.code(204).send();
    });
    app.post('/api/dev/capabilities', async (req) => {
      office.setCapabilityOverride((req.body ?? {}) as never);
      return office.capabilities();
    });
  }

  // ---- the built renderer, when there is one at boot

  if (existsSync(path.join(RENDERER, 'index.html'))) {
    await app.register(fastifyStatic, { root: RENDERER, wildcard: false });
  }

  return app;
}
