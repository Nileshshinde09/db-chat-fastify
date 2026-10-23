import { existsSync } from 'node:fs';
import ExcelJS from 'exceljs';
import type { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { Attachment } from '../src/models/attachment.model';
import { Message } from '../src/models/message.model';
import { MockLlmClient, type LlmChatRequest, type LlmEvent } from '../src/services/llm';
import { pathFor } from '../src/services/storage';
import { signFileUrl } from '../src/utils/signing';
import { clearDb, createClient, listen, onboard, parseSse, PG, registerOrg, startTestDb, stopTestDb, waitFor, type Api } from './helpers';

let app: FastifyInstance;
let api: Api;
let base: string;
let llm: MockLlmClient;

beforeAll(async () => {
  await startTestDb();
  llm = new MockLlmClient({ delayMs: 0 });
  app = await buildApp({ llm });
  base = await listen(app);
  api = createClient(base);
});
afterAll(async () => {
  await app.close();
  await stopTestDb();
});
beforeEach(async () => {
  await clearDb();
  llm.lastRequest = null;
});

async function setup() {
  const owner = await registerOrg(api, 'Acme', 'owner@acme.com');
  const member = await onboard(api, owner.token, 'member@acme.com');
  const conn = (await api('POST', '/api/v1/connections', { token: owner.token, body: PG })).json.connection;
  return { owner, member, conn };
}

const newChat = async (token: string, body: object = {}) =>
  (await api('POST', '/api/v1/conversations', { token, body })).json.conversation as { id: string; [k: string]: any };

const send = (token: string, id: string, content: string, attachmentIds: string[] = []) =>
  api('POST', `/api/v1/conversations/${id}/messages`, { token, body: { content, attachmentIds } });

function csvForm(name: string, content: string | Uint8Array, type = 'text/csv') {
  const form = new FormData();
  form.append('file', new Blob([content as unknown as ArrayBuffer], { type }), name);
  return form;
}
const upload = (token: string, name: string, content: string | Uint8Array, type?: string) =>
  api('POST', '/api/v1/attachments', { token, form: csvForm(name, content, type) });

/* ================================================================ conversations */

describe('conversations', () => {
  it('creates, lists, renames, pins and archives', async () => {
    const { owner } = await setup();
    const c = await newChat(owner.token);
    expect(c).toMatchObject({ title: 'New chat', connectionId: null, pinned: false, archived: false, messageCount: 0, busy: false });

    const renamed = await api('PATCH', `/api/v1/conversations/${c.id}`, { token: owner.token, body: { title: 'Revenue questions', pinned: true } });
    expect(renamed.json.conversation).toMatchObject({ title: 'Revenue questions', pinned: true });

    expect((await api('GET', '/api/v1/conversations', { token: owner.token })).json.conversations).toHaveLength(1);
    expect((await api('GET', '/api/v1/conversations?pinned=true', { token: owner.token })).json.conversations).toHaveLength(1);
    expect((await api('GET', '/api/v1/conversations?pinned=false', { token: owner.token })).json.conversations).toHaveLength(0);

    await api('PATCH', `/api/v1/conversations/${c.id}`, { token: owner.token, body: { archived: true } });
    expect((await api('GET', '/api/v1/conversations', { token: owner.token })).json.conversations).toHaveLength(0);
    expect((await api('GET', '/api/v1/conversations?archived=true', { token: owner.token })).json.conversations).toHaveLength(1);
  });

  it('paginates newest-first with a stable cursor and supports title search', async () => {
    const { owner } = await setup();
    for (const title of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) await newChat(owner.token, { title });

    const p1 = (await api('GET', '/api/v1/conversations?limit=2', { token: owner.token })).json;
    expect(p1.conversations.map((c: any) => c.title)).toEqual(['epsilon', 'delta']);
    const p2 = (await api('GET', `/api/v1/conversations?limit=2&cursor=${p1.nextCursor}`, { token: owner.token })).json;
    expect(p2.conversations.map((c: any) => c.title)).toEqual(['gamma', 'beta']);
    const p3 = (await api('GET', `/api/v1/conversations?limit=2&cursor=${p2.nextCursor}`, { token: owner.token })).json;
    expect(p3.conversations.map((c: any) => c.title)).toEqual(['alpha']);
    expect(p3.nextCursor).toBeNull();

    expect((await api('GET', '/api/v1/conversations?q=ELTA', { token: owner.token })).json.conversations.map((c: any) => c.title)).toEqual(['delta']);
    expect((await api('GET', '/api/v1/conversations?cursor=bogus', { token: owner.token })).status).toBe(400);
  });

  it('is private: not even the owner can read a member\'s chat; other orgs cannot either', async () => {
    const { owner, member } = await setup();
    const mine = await newChat(member.token);
    await send(member.token, mine.id, 'hello', []).then(() => undefined);
    for (const t of [owner.token, (await registerOrg(api, 'Globex', 'o@globex.com')).token]) {
      expect((await api('GET', `/api/v1/conversations/${mine.id}`, { token: t })).status).toBe(404);
      expect((await api('GET', `/api/v1/conversations/${mine.id}/messages`, { token: t })).status).toBe(404);
      expect((await api('PATCH', `/api/v1/conversations/${mine.id}`, { token: t, body: { title: 'x' } })).status).toBe(404);
      expect((await api('DELETE', `/api/v1/conversations/${mine.id}`, { token: t })).status).toBe(404);
      expect((await send(t, mine.id, 'hi')).status).toBe(404);
    }
    expect((await api('GET', '/api/v1/conversations', { token: owner.token })).json.conversations).toHaveLength(0);
  });

  it('members can use the organization\'s connections', async () => {
    const { member, conn } = await setup();
    const c = await newChat(member.token, { connectionId: conn.id });
    expect(c.connectionName).toBe('Warehouse');
  });
});

describe('switching databases', () => {
  it('switches, detaches, and validates the target connection', async () => {
    const { owner, conn } = await setup();
    const second = (await api('POST', '/api/v1/connections', { token: owner.token, body: { ...PG, name: 'Billing', type: 'mysql' } })).json.connection;
    const c = await newChat(owner.token, { connectionId: conn.id });

    const sw = await api('PATCH', `/api/v1/conversations/${c.id}`, { token: owner.token, body: { connectionId: second.id } });
    expect(sw.json.conversation).toMatchObject({ connectionId: second.id, connectionName: 'Billing' });

    const off = await api('PATCH', `/api/v1/conversations/${c.id}`, { token: owner.token, body: { connectionId: null } });
    expect(off.json.conversation).toMatchObject({ connectionId: null, connectionName: null });

    const missing = await api('PATCH', `/api/v1/conversations/${c.id}`, { token: owner.token, body: { connectionId: '64b64b64b64b64b64b64b64b' } });
    expect(missing.status).toBe(404);
    expect(missing.json.code).toBe('CONNECTION_NOT_FOUND');

    const foreign = await registerOrg(api, 'Globex', 'o@globex.com');
    const foreignConn = (await api('POST', '/api/v1/connections', { token: foreign.token, body: PG })).json.connection;
    expect((await api('PATCH', `/api/v1/conversations/${c.id}`, { token: owner.token, body: { connectionId: foreignConn.id } })).status).toBe(404);
  });

  it('answers each message with the database that was active when it was sent', async () => {
    const { owner, conn } = await setup();
    const second = (await api('POST', '/api/v1/connections', { token: owner.token, body: { ...PG, name: 'Billing', password: 'other-pw' } })).json.connection;
    const c = await newChat(owner.token, { connectionId: conn.id });
    await send(owner.token, c.id, 'first');
    expect(llm.lastRequest!.connection).toMatchObject({ name: 'Warehouse', password: PG.password });

    await api('PATCH', `/api/v1/conversations/${c.id}`, { token: owner.token, body: { connectionId: second.id } });
    await send(owner.token, c.id, 'second');
    expect(llm.lastRequest!.connection).toMatchObject({ name: 'Billing', password: 'other-pw' });

    const msgs = (await api('GET', `/api/v1/conversations/${c.id}/messages`, { token: owner.token })).json.messages;
    expect(msgs.filter((m: any) => m.role === 'assistant').map((m: any) => m.connectionName)).toEqual(['Warehouse', 'Billing']);
  });
});

/* ===================================================================== chat */

describe('sending messages', () => {
  it('streams SSE events in order and persists the exchange', async () => {
    const { owner, conn } = await setup();
    const c = await newChat(owner.token, { connectionId: conn.id });

    const res = await send(owner.token, c.id, 'How many customers do we have?');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toContain('no-cache');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff'); // helmet headers survive hijack

    const events = parseSse(res.text);
    const names = events.map((e) => e.event);
    expect(names[0]).toBe('message_start');
    expect(names.filter((n) => n === 'delta').length).toBeGreaterThan(3);
    expect(names).toEqual(expect.arrayContaining(['block', 'title', 'done']));
    expect(names[names.length - 1]).toBe('done');

    const done = events.find((e) => e.event === 'done')!.data;
    const streamed = events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
    expect(done.assistantMessage.content).toBe(streamed);
    expect(done.assistantMessage.status).toBe('complete');
    expect(done.assistantMessage.blocks.map((b: any) => b.type)).toEqual(['sql', 'table']);
    expect(done.conversation.title).toBe('How many customers do we have?');
    expect(done.conversation.busy).toBe(false);

    const list = (await api('GET', `/api/v1/conversations/${c.id}/messages`, { token: owner.token })).json.messages;
    expect(list.map((m: any) => m.role)).toEqual(['user', 'assistant']);
    expect(list[1].content).toBe(streamed);
    expect(list[1].blocks[1].rows).toHaveLength(3);
  });

  it('can return a single JSON response with ?stream=false', async () => {
    const { owner, conn } = await setup();
    const c = await newChat(owner.token, { connectionId: conn.id });
    const res = await api('POST', `/api/v1/conversations/${c.id}/messages?stream=false`, { token: owner.token, body: { content: 'hello' } });
    expect(res.status).toBe(201);
    expect(res.json.userMessage.role).toBe('user');
    expect(res.json.assistantMessage).toMatchObject({ role: 'assistant', status: 'complete' });
    expect(res.json.conversation.messageCount).toBe(2);
  });

  it('sends recent history and honors the read-only flag', async () => {
    const { owner, conn } = await setup();
    const c = await newChat(owner.token, { connectionId: conn.id });
    await send(owner.token, c.id, 'first question');
    await send(owner.token, c.id, 'second question');
    const req = llm.lastRequest!;
    expect(req.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(req.messages[req.messages.length - 1]!.content).toBe('second question');
    expect(req.options).toMatchObject({ readOnly: true });

    await api('PATCH', `/api/v1/connections/${conn.id}`, { token: owner.token, body: { readOnly: false } });
    await send(owner.token, c.id, 'third');
    expect(llm.lastRequest!.options.readOnly).toBe(false);
  });

  it('pages through long histories oldest-to-newest', async () => {
    const { owner, conn } = await setup();
    const c = await newChat(owner.token, { connectionId: conn.id });
    for (const q of ['q1', 'q2', 'q3']) await send(owner.token, c.id, q);

    const latest = (await api('GET', `/api/v1/conversations/${c.id}/messages?limit=4`, { token: owner.token })).json;
    expect(latest.messages).toHaveLength(4);
    expect(latest.messages[3].role).toBe('assistant');
    const older = (await api('GET', `/api/v1/conversations/${c.id}/messages?limit=4&before=${latest.nextCursor}`, { token: owner.token })).json;
    expect(older.messages.map((m: any) => m.role)).toEqual(['user', 'assistant']);
    expect(older.nextCursor).toBeNull();
  });

  it('validates input and requires a data source', async () => {
    const { owner } = await setup();
    const empty = await newChat(owner.token);
    const noSource = await send(owner.token, empty.id, 'hello');
    expect(noSource.status).toBe(400);
    expect(noSource.json.code).toBe('NO_DATA_SOURCE');

    expect((await send(owner.token, empty.id, '   ')).status).toBe(400);
    expect((await send(owner.token, empty.id, 'x'.repeat(8001))).status).toBe(400);
    expect((await send(owner.token, '64b64b64b64b64b64b64b64b', 'hi')).status).toBe(404);
    expect(await Message.countDocuments({})).toBe(0); // nothing saved by rejected sends
  });

  it('saves an error answer when the LLM reports a failure', async () => {
    const { owner, conn } = await setup();
    const c = await newChat(owner.token, { connectionId: conn.id });
    const done = parseSse((await send(owner.token, c.id, 'trigger an error please')).text).find((e) => e.event === 'done')!.data;
    expect(done.assistantMessage.status).toBe('error');
    expect(done.assistantMessage.error).toMatchObject({ code: 'QUERY_FAILED' });
  });

  it('handles a transport failure without leaking details or locking the chat', async () => {
    const { owner, conn } = await setup();
    const c = await newChat(owner.token, { connectionId: conn.id });
    const res = await send(owner.token, c.id, 'boom');
    const done = parseSse(res.text).find((e) => e.event === 'done')!.data;
    expect(done.assistantMessage.status).toBe('error');
    expect(done.assistantMessage.error.code).toBe('CHAT_FAILED');
    expect(res.text).not.toContain('mock transport failure');
    // the conversation is usable again right away
    expect((await send(owner.token, c.id, 'hello again')).status).toBe(200);
  });

  it('allows one answer at a time per conversation and releases the lock after "stop"', async () => {
    const { owner, conn } = await setup();
    const c = await newChat(owner.token, { connectionId: conn.id });

    const ac = new AbortController();
    const first = fetch(`${base}/api/v1/conversations/${c.id}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'this one is slow' }),
      signal: ac.signal,
    }).catch(() => undefined);

    await waitFor(async () => (await api('GET', `/api/v1/conversations/${c.id}`, { token: owner.token })).json.conversation.busy);

    const second = await send(owner.token, c.id, 'me too');
    expect(second.status).toBe(409);
    expect(second.json.code).toBe('CONVERSATION_BUSY');
    expect((await api('PATCH', `/api/v1/conversations/${c.id}`, { token: owner.token, body: { connectionId: null } })).status).toBe(409);
    expect((await api('DELETE', `/api/v1/conversations/${c.id}`, { token: owner.token })).status).toBe(409);

    ac.abort(); // the user pressed "stop"
    await first;

    // whatever was produced is saved as a stopped answer, and the lock is released
    const stopped = await waitFor(async () => {
      const m = (await api('GET', `/api/v1/conversations/${c.id}/messages`, { token: owner.token })).json.messages;
      return m.find((x: any) => x.role === 'assistant');
    });
    expect(stopped.status).toBe('stopped');
    await waitFor(async () => !(await api('GET', `/api/v1/conversations/${c.id}`, { token: owner.token })).json.conversation.busy);
    expect((await send(owner.token, c.id, 'ok now')).status).toBe(200);
  });

  it('a stale lock from a crashed server does not block the chat forever', async () => {
    const { owner, conn } = await setup();
    const c = await newChat(owner.token, { connectionId: conn.id });
    await mongoose.connection.collection('conversations').updateMany({}, { $set: { activeRunAt: new Date(Date.now() - 60 * 60 * 1000) } });
    expect((await send(owner.token, c.id, 'hello')).status).toBe(200);
  });
});

/* ================================================================== files */

describe('file uploads', () => {
  it('uploads a CSV, shows a preview, and lets you chat over it without any database', async () => {
    const { owner } = await setup();
    const up = await upload(owner.token, 'sales.csv', 'region,revenue\nEU,100\nUS,250\nAPAC,75\n');
    expect(up.status).toBe(201);
    expect(up.json.attachment).toMatchObject({ name: 'sales.csv', kind: 'csv', attached: false });
    expect(up.json.attachment.preview.sheets[0]).toMatchObject({ columns: ['region', 'revenue'], rowCount: 3 });

    const c = await newChat(owner.token); // no connection
    const done = parseSse((await send(owner.token, c.id, 'total revenue?', [up.json.attachment.id])).text).find((e) => e.event === 'done')!.data;
    expect(done.assistantMessage.status).toBe('complete');
    expect(llm.lastRequest!.connection).toBeNull();
    expect(llm.lastRequest!.files).toHaveLength(1);
    expect(llm.lastRequest!.files[0]).toMatchObject({ name: 'sales.csv', kind: 'csv' });

    const msgs = (await api('GET', `/api/v1/conversations/${c.id}/messages`, { token: owner.token })).json.messages;
    expect(msgs[0].attachments[0]).toMatchObject({ name: 'sales.csv', attached: true });

    // follow-up questions keep the file in context
    await send(owner.token, c.id, 'and the average?');
    expect(llm.lastRequest!.files.map((f) => f.name)).toEqual(['sales.csv']);
  });

  it('reads Excel workbooks with several sheets', async () => {
    const { owner } = await setup();
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Q1').addRows([['product', 'units'], ['A', 3], ['B', 5]]);
    wb.addWorksheet('Q2').addRows([['product', 'units'], ['A', 4]]);
    const buf = new Uint8Array(await wb.xlsx.writeBuffer());
    const up = await upload(owner.token, 'sales.xlsx', buf, 'application/octet-stream');
    expect(up.status).toBe(201);
    expect(up.json.attachment.preview.sheets.map((s: any) => s.name)).toEqual(['Q1', 'Q2']);
  });

  it('rejects unsupported, mislabeled, empty and oversized files', async () => {
    const { owner } = await setup();
    expect((await upload(owner.token, 'virus.exe', 'MZ')).status).toBe(415);
    expect((await upload(owner.token, 'notes.txt', 'hello')).status).toBe(415);
    const fake = await upload(owner.token, 'fake.csv', new Uint8Array([0x4d, 0x5a, 0x00, 0x01, 0x02]));
    expect(fake.status).toBe(415);
    expect(fake.json.code).toBe('INVALID_FILE_TYPE');
    const emptyRes = await upload(owner.token, 'empty.csv', '');
    expect(emptyRes.status).toBe(422);
    expect((await upload(owner.token, 'fakebook.xlsx', 'a,b\n1,2\n')).status).toBe(415);

    const big = await upload(owner.token, 'big.csv', `a\n${'x'.repeat(11 * 1024 * 1024)}`);
    expect(big.status).toBe(413);
    expect(big.json.code).toBe('FILE_TOO_LARGE');
    expect(await Attachment.countDocuments({})).toBe(0); // failed uploads leave nothing behind
  });

  it('requires multipart and authentication', async () => {
    const { owner } = await setup();
    expect((await api('POST', '/api/v1/attachments', { token: owner.token, body: { x: 1 } })).status).toBe(400);
    expect((await api('POST', '/api/v1/attachments', { form: csvForm('a.csv', 'a\n1\n') })).status).toBe(401);
  });

  it('a file can only be sent once, and only by the user who uploaded it', async () => {
    const { owner, member } = await setup();
    const up = (await upload(owner.token, 'a.csv', 'a\n1\n')).json.attachment;
    const c1 = await newChat(owner.token);
    expect((await send(owner.token, c1.id, 'q', [up.id])).status).toBe(200);

    const c2 = await newChat(owner.token);
    const reuse = await send(owner.token, c2.id, 'again', [up.id]);
    expect(reuse.status).toBe(400);
    expect(reuse.json.code).toBe('INVALID_ATTACHMENT');

    const other = (await upload(owner.token, 'b.csv', 'a\n1\n')).json.attachment;
    const mc = await newChat(member.token);
    expect((await send(member.token, mc.id, 'steal', [other.id])).status).toBe(400);
    expect((await send(owner.token, c2.id, 'x', ['64b64b64b64b64b64b64b64b'])).status).toBe(400);
  });

  it('downloads are private to the uploader', async () => {
    const { owner, member } = await setup();
    const up = (await upload(owner.token, 'a.csv', 'a,b\n1,2\n')).json.attachment;
    const dl = await api('GET', `/api/v1/attachments/${up.id}/download`, { token: owner.token });
    expect(dl.status).toBe(200);
    expect(dl.text).toBe('a,b\n1,2\n');
    expect(dl.headers.get('content-disposition')).toContain("filename*=UTF-8''a.csv");
    for (const t of [member.token, (await registerOrg(api, 'Globex', 'o@globex.com')).token]) {
      expect((await api('GET', `/api/v1/attachments/${up.id}/download`, { token: t })).status).toBe(404);
      expect((await api('GET', `/api/v1/attachments/${up.id}`, { token: t })).status).toBe(404);
    }
  });

  it('only unsent files can be removed', async () => {
    const { owner } = await setup();
    const pending = (await upload(owner.token, 'a.csv', 'a\n1\n')).json.attachment;
    expect((await api('DELETE', `/api/v1/attachments/${pending.id}`, { token: owner.token })).status).toBe(204);
    expect((await api('GET', `/api/v1/attachments/${pending.id}`, { token: owner.token })).status).toBe(404);

    const sent = (await upload(owner.token, 'b.csv', 'a\n1\n')).json.attachment;
    const c = await newChat(owner.token);
    await send(owner.token, c.id, 'q', [sent.id]);
    const res = await api('DELETE', `/api/v1/attachments/${sent.id}`, { token: owner.token });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('ATTACHMENT_IN_USE');
  });

  it('limits how many unsent files a user can pile up', async () => {
    const { owner } = await setup();
    for (let i = 0; i < 20; i++) expect((await upload(owner.token, `f${i}.csv`, 'a\n1\n')).status).toBe(201);
    const res = await upload(owner.token, 'one-too-many.csv', 'a\n1\n');
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('TOO_MANY_PENDING_UPLOADS');
  });
});

describe('signed file urls for the LLM server', () => {
  it('lets the LLM server download exactly the file it was given, and nothing else', async () => {
    const { owner } = await setup();
    const a = (await upload(owner.token, 'a.csv', 'col\nvalue-a\n')).json.attachment;
    const b = (await upload(owner.token, 'b.csv', 'col\nvalue-b\n')).json.attachment;
    const c = await newChat(owner.token);
    await send(owner.token, c.id, 'q', [a.id]);

    const url = new URL(llm.lastRequest!.files[0]!.url);
    const path = `${url.pathname}${url.search}`; // INTERNAL_BASE_URL is not the test server's port
    const ok = await api('GET', path); // no Authorization header
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('col\nvalue-a\n');
    expect(ok.headers.get('cache-control')).toContain('no-store');

    const sig = url.searchParams.get('sig')!;
    const exp = url.searchParams.get('exp')!;
    // same signature on a different file
    expect((await api('GET', `/api/v1/internal/files/${b.id}?exp=${exp}&sig=${sig}`)).status).toBe(403);
    // tampered signature / missing params / expired link
    expect((await api('GET', `${url.pathname}?exp=${exp}&sig=${'0'.repeat(64)}`)).status).toBe(403);
    expect((await api('GET', url.pathname)).status).toBe(403);
    const expired = new URL(signFileUrl(a.id, -5));
    expect((await api('GET', `${expired.pathname}${expired.search}`)).status).toBe(403);
  });
});

describe('deleting conversations', () => {
  it('removes messages, files on disk and attachment records', async () => {
    const { owner, conn } = await setup();
    const up = (await upload(owner.token, 'a.csv', 'a\n1\n')).json.attachment;
    const doc = await Attachment.findById(up.id);
    const file = pathFor(doc!.storageKey);
    expect(existsSync(file)).toBe(true);

    const c = await newChat(owner.token, { connectionId: conn.id });
    await send(owner.token, c.id, 'q', [up.id]);

    expect((await api('DELETE', `/api/v1/conversations/${c.id}`, { token: owner.token })).status).toBe(204);
    expect(existsSync(file)).toBe(false);
    expect(await Attachment.countDocuments({})).toBe(0);
    expect(await Message.countDocuments({})).toBe(0);
    expect((await api('GET', `/api/v1/connections/${conn.id}`, { token: owner.token })).status).toBe(200); // connection untouched
  });
});

describe('structured output storage', () => {
  it('stores chart specs with "$schema" keys and large tables safely', async () => {
    class ChartLlm extends MockLlmClient {
      override async *streamChat(_req: LlmChatRequest, _signal: AbortSignal): AsyncGenerator<LlmEvent> {
        yield { type: 'delta', text: 'Here is your chart.' };
        yield { type: 'chart', spec: { $schema: 'https://vega.github.io/schema/vega-lite/v5.json', mark: 'bar', 'a.b': 1 } };
        yield { type: 'table', columns: ['n'], rows: Array.from({ length: 5000 }, (_, i) => [i]) };
        yield { type: 'done' };
      }
    }
    const chartApp = await buildApp({ llm: new ChartLlm() });
    const chartApi = createClient(await listen(chartApp));
    try {
      const owner = await registerOrg(chartApi, 'Charts Inc', 'owner@charts.com');
      const conn = (await chartApi('POST', '/api/v1/connections', { token: owner.token, body: PG })).json.connection;
      const c = (await chartApi('POST', '/api/v1/conversations', { token: owner.token, body: { connectionId: conn.id } })).json.conversation;
      const res = await chartApi('POST', `/api/v1/conversations/${c.id}/messages?stream=false`, { token: owner.token, body: { content: 'chart it' } });
      expect(res.status).toBe(201);
      const [chart, table] = res.json.assistantMessage.blocks;
      expect(chart.spec.$schema).toContain('vega-lite');
      expect(table.rows.length).toBe(1000); // capped at CHAT_ROW_LIMIT
      expect(table.truncated).toBe(true);
      expect(table.rowCount).toBe(5000);

      const saved = (await chartApi('GET', `/api/v1/conversations/${c.id}/messages`, { token: owner.token })).json.messages[1];
      expect(saved.blocks[0].spec.$schema).toContain('vega-lite');
      expect(saved.blocks[1].rows).toHaveLength(1000);
    } finally {
      await chartApp.close();
    }
  });
});
