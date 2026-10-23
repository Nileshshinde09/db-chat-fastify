import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpLlmClient, parseSse } from '../src/services/llm/http-client';
import { LlmError, type LlmChatRequest, type LlmEvent } from '../src/services/llm/types';

const REQ: LlmChatRequest = {
  conversationId: 'c1',
  messageId: 'm1',
  orgId: 'o1',
  userId: 'u1',
  messages: [{ role: 'user', content: 'how many customers?' }],
  connection: null,
  files: [],
  options: { readOnly: true, rowLimit: 100 },
};

let server: Server | undefined;
const seen: { headers?: IncomingMessage['headers']; body?: any; url?: string } = {};

async function fakeLlm(handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>) {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen.headers = req.headers;
      seen.url = req.url;
      try {
        seen.body = JSON.parse(Buffer.concat(chunks).toString() || 'null');
      } catch {
        seen.body = null;
      }
      void handler(req, res);
    });
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return new HttpLlmClient({ baseUrl: `http://127.0.0.1:${port}/`, apiKey: 'test-key-0123456789', timeoutMs: 5000 });
}

afterEach(async () => {
  if (server) await new Promise((r) => server!.close(r));
  server = undefined;
});

async function collect(gen: AsyncGenerator<LlmEvent>) {
  const out: LlmEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const sse = (res: ServerResponse, ...events: unknown[]) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const e of events) res.write(`data: ${JSON.stringify(e)}\n\n`);
};

describe('parseSse', () => {
  it('reassembles events split across arbitrary chunk boundaries, CRLF and comments', async () => {
    const wire = ': ping\r\n\r\ndata: {"a":1}\r\n\r\nevent: x\ndata: {"b":\ndata: 2}\n\ndata: {"c":3}\n\n';
    const bytes = new TextEncoder().encode(wire);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 3) c.enqueue(bytes.slice(i, i + 3)); // 3-byte chunks
        c.close();
      },
    });
    const out: string[] = [];
    for await (const d of parseSse(stream)) out.push(d);
    expect(out).toEqual(['{"a":1}', '{"b":\n2}', '{"c":3}']);
  });
});

describe('HttpLlmClient.streamChat', () => {
  it('sends auth + payload and yields typed events in order', async () => {
    const client = await fakeLlm((_req, res) => {
      sse(
        res,
        { type: 'delta', text: 'Hel' },
        { type: 'delta', text: 'lo' },
        { type: 'sql', sql: 'SELECT 1', dialect: 'postgres' },
        { type: 'table', columns: ['n'], rows: [[1]], rowCount: 1 },
        { type: 'mystery', foo: 1 }, // unknown types are ignored
        { type: 'title', title: 'Customers' },
        { type: 'done', usage: { tokens: 5 } },
      );
      res.end();
    });
    const events = await collect(client.streamChat(REQ, new AbortController().signal));
    expect(events.map((e) => e.type)).toEqual(['delta', 'delta', 'sql', 'table', 'title', 'done']);
    expect(seen.url).toBe('/v1/chat/stream');
    expect(seen.headers?.authorization).toBe('Bearer test-key-0123456789');
    expect(seen.headers?.accept).toBe('text/event-stream');
    expect(seen.body.messages[0].content).toBe('how many customers?');
  });

  it('stops at an error event', async () => {
    const client = await fakeLlm((_req, res) => {
      sse(res, { type: 'delta', text: 'x' }, { type: 'error', code: 'QUERY_FAILED', message: 'bad sql' }, { type: 'delta', text: 'never' });
      res.end();
    });
    const events = await collect(client.streamChat(REQ, new AbortController().signal));
    expect(events.map((e) => e.type)).toEqual(['delta', 'error']);
  });

  it('skips malformed JSON lines instead of failing the answer', async () => {
    const client = await fakeLlm((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: {not json}\n\n');
      res.write('data: {"type":"delta","text":"ok"}\n\n');
      res.write('data: {"type":"done"}\n\n');
      res.end();
    });
    const events = await collect(client.streamChat(REQ, new AbortController().signal));
    expect(events.map((e) => e.type)).toEqual(['delta', 'done']);
  });

  it('turns non-2xx responses into LLM_UPSTREAM_ERROR', async () => {
    const client = await fakeLlm((_req, res) => {
      res.writeHead(500).end('model overloaded');
    });
    await expect(collect(client.streamChat(REQ, new AbortController().signal))).rejects.toMatchObject({
      code: 'LLM_UPSTREAM_ERROR',
      status: 500,
    });
  });

  it('detects a stream that ends without done', async () => {
    const client = await fakeLlm((_req, res) => {
      sse(res, { type: 'delta', text: 'partial' });
      res.end();
    });
    await expect(collect(client.streamChat(REQ, new AbortController().signal))).rejects.toMatchObject({
      code: 'LLM_STREAM_BROKEN',
    });
  });

  it('reports an unreachable server', async () => {
    const client = new HttpLlmClient({ baseUrl: 'http://127.0.0.1:1', apiKey: 'test-key-0123456789', timeoutMs: 2000 });
    await expect(collect(client.streamChat(REQ, new AbortController().signal))).rejects.toBeInstanceOf(LlmError);
  });

  it('stops promptly when aborted, without throwing', async () => {
    const client = await fakeLlm((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: {"type":"delta","text":"first"}\n\n'); // then stall forever
    });
    const ac = new AbortController();
    const got: LlmEvent[] = [];
    const started = Date.now();
    for await (const e of client.streamChat(REQ, ac.signal)) {
      got.push(e);
      ac.abort();
    }
    expect(got).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('HttpLlmClient connection helpers', () => {
  it('posts the connection to test/schema endpoints', async () => {
    const client = await fakeLlm((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(req.url === '/v1/connections/test' ? JSON.stringify({ ok: true, latencyMs: 3 }) : JSON.stringify({ tables: [] }));
    });
    const conn = { type: 'postgres' as const, host: 'h', port: 5432, database: 'd', username: 'u', password: 'p', ssl: false, options: {} };
    expect(await client.testConnection(conn)).toEqual({ ok: true, latencyMs: 3 });
    expect(seen.body.connection.password).toBe('p');
    expect(await client.getSchema(conn)).toEqual({ tables: [] });
  });

  it('wraps upstream failures in LlmError', async () => {
    const client = await fakeLlm((_req, res) => {
      res.writeHead(502).end('bad gateway');
    });
    await expect(client.testConnection({ type: 'postgres', host: 'h', port: 1, database: 'd', username: '', password: '', ssl: false, options: {} })).rejects.toMatchObject({ code: 'LLM_UPSTREAM_ERROR' });
  });
});
