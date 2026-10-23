import type { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { env } from '../src/config/env';
import { loadForLlm } from '../src/modules/connections/connections.service';
import { MockLlmClient } from '../src/services/llm';
import { clearDb, createClient, listen, onboard, PG, registerOrg, startTestDb, stopTestDb, type Api } from './helpers';

let app: FastifyInstance;
let api: Api;

beforeAll(async () => {
  await startTestDb();
  app = await buildApp({ llm: new MockLlmClient({ delayMs: 0 }) });
  api = createClient(await listen(app));
});
afterAll(async () => {
  await app.close();
  await stopTestDb();
});
beforeEach(clearDb);

async function setup() {
  const owner = await registerOrg(api, 'Acme', 'owner@acme.com');
  const admin = await onboard(api, owner.token, 'admin@acme.com', 'admin');
  const member = await onboard(api, owner.token, 'member@acme.com', 'member');
  return { owner, admin, member };
}

const create = (token: string, body: object = PG) => api('POST', '/api/v1/connections', { token, body });

describe('creating connections', () => {
  it('owner creates one; response never contains the password; password is encrypted at rest', async () => {
    const { owner } = await setup();
    const res = await create(owner.token);
    expect(res.status).toBe(201);
    expect(res.json.connection).toMatchObject({ name: 'Warehouse', type: 'postgres', host: 'db.example.com', port: 5432, readOnly: true, ssl: false });
    expect(res.text).not.toContain(PG.password);
    expect(res.text).not.toContain('credentialsEnc');

    const raw = await mongoose.connection.collection('dbconnections').findOne({});
    expect(raw!.credentialsEnc).toMatch(/^v1\./);
    expect(JSON.stringify(raw)).not.toContain(PG.password);
    expect(raw!.username).toBe('readonly_user');
  });

  it('uses the default port per database type', async () => {
    const { owner } = await setup();
    const res = await create(owner.token, { ...PG, name: 'Mongo', type: 'mongodb' });
    expect(res.json.connection.port).toBe(27017);
  });

  it('admin can create too', async () => {
    const { admin } = await setup();
    expect((await create(admin.token)).status).toBe(201);
  });

  it('members cannot create, update, delete or test connections', async () => {
    const { owner, member } = await setup();
    const id = (await create(owner.token)).json.connection.id;
    expect((await create(member.token, { ...PG, name: 'Mine' })).status).toBe(403);
    expect((await api('PATCH', `/api/v1/connections/${id}`, { token: member.token, body: { name: 'x' } })).status).toBe(403);
    expect((await api('DELETE', `/api/v1/connections/${id}`, { token: member.token })).status).toBe(403);
    expect((await api('POST', `/api/v1/connections/${id}/test`, { token: member.token })).status).toBe(403);
    expect((await api('POST', '/api/v1/connections/test', { token: member.token, body: PG })).status).toBe(403);
  });

  it('requires authentication', async () => {
    expect((await api('GET', '/api/v1/connections')).status).toBe(401);
  });

  it('rejects invalid input', async () => {
    const { owner } = await setup();
    for (const bad of [
      { ...PG, host: 'postgres://db.example.com' }, // scheme
      { ...PG, host: 'db example.com' }, // space
      { ...PG, type: 'oracle' },
      { ...PG, port: 70000 },
      { ...PG, name: '' },
      { ...PG, extra: 'field' }, // strict
      { ...PG, options: { '$where': 'x' } }, // unsafe Mongo field names
      { ...PG, options: { 'a.b': 'x' } },
    ]) {
      const res = await create(owner.token, bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(res.json.code).toBe('VALIDATION_ERROR');
    }
  });

  it('keeps names unique per organization but not across organizations', async () => {
    const { owner } = await setup();
    await create(owner.token);
    const dup = await create(owner.token);
    expect(dup.status).toBe(409);
    expect(dup.json.code).toBe('CONNECTION_NAME_TAKEN');

    const other = await registerOrg(api, 'Globex', 'owner@globex.com');
    expect((await create(other.token)).status).toBe(201);
  });

  it('blocks private hosts when BLOCK_PRIVATE_HOSTS is enabled', async () => {
    const { owner } = await setup();
    env.BLOCK_PRIVATE_HOSTS = true;
    try {
      const res = await create(owner.token, { ...PG, host: '127.0.0.1' });
      expect(res.status).toBe(400);
      expect(res.json.code).toBe('HOST_NOT_ALLOWED');
    } finally {
      env.BLOCK_PRIVATE_HOSTS = false;
    }
  });
});

describe('reading connections', () => {
  it('members see a reduced view; owner/admin see connection details', async () => {
    const { owner, admin, member } = await setup();
    await create(owner.token);

    const asMember = (await api('GET', '/api/v1/connections', { token: member.token })).json.connections[0];
    expect(asMember).toMatchObject({ name: 'Warehouse', type: 'postgres', database: 'analytics' });
    for (const hidden of ['host', 'port', 'username', 'ssl', 'options']) expect(asMember).not.toHaveProperty(hidden);

    for (const t of [owner.token, admin.token]) {
      const full = (await api('GET', '/api/v1/connections', { token: t })).json.connections[0];
      expect(full).toMatchObject({ host: 'db.example.com', port: 5432, username: 'readonly_user' });
      expect(JSON.stringify(full)).not.toContain(PG.password);
    }
  });

  it('members can browse the schema of a connection', async () => {
    const { owner, member } = await setup();
    const id = (await create(owner.token)).json.connection.id;
    const res = await api('GET', `/api/v1/connections/${id}/schema`, { token: member.token });
    expect(res.status).toBe(200);
    expect(res.json.tables.map((t: { name: string }) => t.name)).toContain('customers');
  });
});

describe('updating and deleting', () => {
  it('keeps the saved password when it is not sent, replaces it when it is', async () => {
    const { owner } = await setup();
    const id = (await create(owner.token)).json.connection.id;
    const orgId = owner.user.orgId as string;

    const renamed = await api('PATCH', `/api/v1/connections/${id}`, { token: owner.token, body: { name: 'Warehouse v2', readOnly: false } });
    expect(renamed.status).toBe(200);
    expect(renamed.json.connection).toMatchObject({ name: 'Warehouse v2', readOnly: false });
    expect((await loadForLlm(orgId, id)).password).toBe(PG.password);

    await api('PATCH', `/api/v1/connections/${id}`, { token: owner.token, body: { password: 'new-secret' } });
    expect((await loadForLlm(orgId, id)).password).toBe('new-secret');
  });

  it('rejects an empty patch and renaming onto an existing name', async () => {
    const { owner } = await setup();
    const a = (await create(owner.token)).json.connection.id;
    await create(owner.token, { ...PG, name: 'Other' });
    expect((await api('PATCH', `/api/v1/connections/${a}`, { token: owner.token, body: {} })).status).toBe(400);
    const clash = await api('PATCH', `/api/v1/connections/${a}`, { token: owner.token, body: { name: 'Other' } });
    expect(clash.status).toBe(409);
  });

  it('delete removes it and detaches chats while keeping their history label', async () => {
    const { owner } = await setup();
    const id = (await create(owner.token)).json.connection.id;
    const conv = (await api('POST', '/api/v1/conversations', { token: owner.token, body: { connectionId: id } })).json.conversation;
    expect(conv.connectionName).toBe('Warehouse');

    expect((await api('DELETE', `/api/v1/connections/${id}`, { token: owner.token })).status).toBe(204);
    expect((await api('GET', `/api/v1/connections/${id}`, { token: owner.token })).status).toBe(404);
    expect((await api('DELETE', `/api/v1/connections/${id}`, { token: owner.token })).status).toBe(404);

    const after = (await api('GET', `/api/v1/conversations/${conv.id}`, { token: owner.token })).json.conversation;
    expect(after.connectionId).toBeNull();
    expect(after.connectionName).toBe('Warehouse');
  });
});

describe('testing connections', () => {
  it('records the result of testing a saved connection', async () => {
    const { owner } = await setup();
    const ok = (await create(owner.token)).json.connection.id;
    const bad = (await create(owner.token, { ...PG, name: 'Down', host: 'unreachable.example.com' })).json.connection.id;

    expect((await api('POST', `/api/v1/connections/${ok}/test`, { token: owner.token })).json).toMatchObject({ ok: true });
    expect((await api('POST', `/api/v1/connections/${bad}/test`, { token: owner.token })).json).toMatchObject({ ok: false });

    const list = (await api('GET', '/api/v1/connections', { token: owner.token })).json.connections;
    expect(list.find((c: { id: string }) => c.id === ok).lastTestStatus).toBe('ok');
    expect(list.find((c: { id: string }) => c.id === bad).lastTestStatus).toBe('failed');
  });

  it('changing connection details clears a stale "tested ok" status', async () => {
    const { owner } = await setup();
    const id = (await create(owner.token)).json.connection.id;
    await api('POST', `/api/v1/connections/${id}/test`, { token: owner.token });
    const patched = await api('PATCH', `/api/v1/connections/${id}`, { token: owner.token, body: { host: 'other.example.com' } });
    expect(patched.json.connection.lastTestStatus).toBeNull();
  });

  it('tests an unsaved configuration without saving it', async () => {
    const { owner } = await setup();
    const res = await api('POST', '/api/v1/connections/test', { token: owner.token, body: { type: 'postgres', host: 'db.example.com', database: 'x', username: 'u', password: 'p' } });
    expect(res.json.ok).toBe(true);
    expect((await api('GET', '/api/v1/connections', { token: owner.token })).json.connections).toHaveLength(0);
  });

  it('reports unreadable stored credentials (e.g. after an ENCRYPTION_KEY change)', async () => {
    const { owner } = await setup();
    const id = (await create(owner.token)).json.connection.id;
    await mongoose.connection.collection('dbconnections').updateMany({}, { $set: { credentialsEnc: 'v1.AAAA.BBBB.CCCC' } });
    const res = await api('POST', `/api/v1/connections/${id}/test`, { token: owner.token });
    expect(res.status).toBe(422);
    expect(res.json.code).toBe('CREDENTIALS_UNREADABLE');
  });
});

describe('tenant isolation', () => {
  it("another organization can't see, change or delete a connection", async () => {
    const { owner } = await setup();
    const id = (await create(owner.token)).json.connection.id;
    const other = await registerOrg(api, 'Globex', 'owner@globex.com');

    expect((await api('GET', '/api/v1/connections', { token: other.token })).json.connections).toHaveLength(0);
    expect((await api('GET', `/api/v1/connections/${id}`, { token: other.token })).status).toBe(404);
    expect((await api('PATCH', `/api/v1/connections/${id}`, { token: other.token, body: { name: 'hax' } })).status).toBe(404);
    expect((await api('DELETE', `/api/v1/connections/${id}`, { token: other.token })).status).toBe(404);
    expect((await api('POST', `/api/v1/connections/${id}/test`, { token: other.token })).status).toBe(404);
    expect((await api('GET', `/api/v1/connections/${id}/schema`, { token: other.token })).status).toBe(404);
    expect((await api('GET', `/api/v1/connections/${id}`, { token: owner.token })).status).toBe(200);
  });
});
