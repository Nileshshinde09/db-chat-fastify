import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { clearDb, startTestDb, stopTestDb } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  await startTestDb();
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await stopTestDb();
});

beforeEach(async () => {
  await clearDb();
});

const PASSWORD = 'Sup3r-secret-pw';

async function post(url: string, payload: object, headers: Record<string, string> = {}, cookies = {}) {
  return app.inject({ method: 'POST', url, payload, headers, cookies });
}

async function registerOrg(name: string, email: string) {
  const res = await post('/api/v1/auth/register-organization', {
    organizationName: name,
    name: 'Owner',
    email,
    password: PASSWORD,
  });
  expect(res.statusCode).toBe(201);
  return {
    body: res.json(),
    token: res.json().accessToken as string,
    refresh: res.cookies.find((c) => c.name === 'refresh_token')!.value,
  };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Owner invites an employee and the employee accepts. Returns the employee's session. */
async function onboardEmployee(ownerToken: string, email: string, role: 'admin' | 'member' = 'member') {
  const inv = await post('/api/v1/auth/invites', { email, role }, bearer(ownerToken));
  expect(inv.statusCode).toBe(201);
  const token = new URL(inv.json().inviteLink).searchParams.get('token')!;
  const acc = await post('/api/v1/auth/invites/accept', { token, name: 'Employee', password: PASSWORD });
  expect(acc.statusCode).toBe(201);
  return { token: acc.json().accessToken as string, user: acc.json().user };
}

describe('organization registration & login', () => {
  it('creates org + owner, and the owner can log in and fetch /me', async () => {
    const { body } = await registerOrg('Acme Inc', 'owner@acme.com');
    expect(body.user.role).toBe('owner');
    expect(body.user.passwordHash).toBeUndefined();
    expect(body.organization.slug).toBe('acme-inc');

    const login = await post('/api/v1/auth/login', { email: 'owner@acme.com', password: PASSWORD });
    expect(login.statusCode).toBe(200);

    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: bearer(login.json().accessToken) });
    expect(me.json().user.email).toBe('owner@acme.com');
  });

  it('rejects duplicate emails and wrong passwords with generic errors', async () => {
    await registerOrg('Acme', 'owner@acme.com');
    const dup = await post('/api/v1/auth/register-organization', {
      organizationName: 'Other', name: 'X', email: 'owner@acme.com', password: PASSWORD,
    });
    expect(dup.statusCode).toBe(409);

    const bad = await post('/api/v1/auth/login', { email: 'owner@acme.com', password: 'wrong-password' });
    const ghost = await post('/api/v1/auth/login', { email: 'nobody@acme.com', password: 'wrong-password' });
    expect(bad.statusCode).toBe(401);
    expect(ghost.json().message).toBe(bad.json().message);
  });

  it('validates input', async () => {
    const res = await post('/api/v1/auth/register-organization', { email: 'not-an-email', password: '123' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('does not enforce 2FA while TWO_FACTOR_ENABLED=false', async () => {
    await registerOrg('Acme', 'owner@acme.com');
    const res = await post('/api/v1/auth/2fa/setup', {}, bearer((await post('/api/v1/auth/login', { email: 'owner@acme.com', password: PASSWORD })).json().accessToken));
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('TWO_FACTOR_DISABLED');
  });
});

describe('refresh token rotation', () => {
  it('rotates tokens and revokes everything when an old token is reused', async () => {
    const { refresh } = await registerOrg('Acme', 'owner@acme.com');

    const first = await post('/api/v1/auth/refresh', {}, {}, { refresh_token: refresh });
    expect(first.statusCode).toBe(200);
    const rotated = first.cookies.find((c) => c.name === 'refresh_token')!.value;
    expect(rotated).not.toBe(refresh);

    // Replaying the old token = theft signal.
    const replay = await post('/api/v1/auth/refresh', {}, {}, { refresh_token: refresh });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().code).toBe('TOKEN_REUSED');

    // ...which also kills the legitimately rotated token.
    const afterReplay = await post('/api/v1/auth/refresh', {}, {}, { refresh_token: rotated });
    expect(afterReplay.statusCode).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const { refresh } = await registerOrg('Acme', 'owner@acme.com');
    await post('/api/v1/auth/logout', {}, {}, { refresh_token: refresh });
    const res = await post('/api/v1/auth/refresh', {}, {}, { refresh_token: refresh });
    expect(res.statusCode).toBe(401);
  });
});

describe('employee onboarding via invites', () => {
  it('owner invites -> employee accepts -> employee can log in; invite is single-use', async () => {
    const { token: ownerToken } = await registerOrg('Acme', 'owner@acme.com');
    const inv = await post('/api/v1/auth/invites', { email: 'Emp@Acme.com', role: 'member' }, bearer(ownerToken));
    const inviteToken = new URL(inv.json().inviteLink).searchParams.get('token')!;

    const accept = await post('/api/v1/auth/invites/accept', { token: inviteToken, name: 'Emp', password: PASSWORD });
    expect(accept.statusCode).toBe(201);
    expect(accept.json().user.role).toBe('member');
    expect(accept.json().user.orgId).toBe(accept.json().organization.id);

    const login = await post('/api/v1/auth/login', { email: 'emp@acme.com', password: PASSWORD });
    expect(login.statusCode).toBe(200);

    const reuse = await post('/api/v1/auth/invites/accept', { token: inviteToken, name: 'Emp', password: PASSWORD });
    expect(reuse.statusCode).toBe(400);
    expect(reuse.json().code).toBe('INVALID_INVITE');
  });

  it('members cannot invite or list users; admins cannot invite admins', async () => {
    const { token: ownerToken } = await registerOrg('Acme', 'owner@acme.com');
    const member = await onboardEmployee(ownerToken, 'member@acme.com', 'member');
    const admin = await onboardEmployee(ownerToken, 'admin@acme.com', 'admin');

    expect((await post('/api/v1/auth/invites', { email: 'x@acme.com' }, bearer(member.token))).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/users', headers: bearer(member.token) })).statusCode).toBe(403);

    expect((await post('/api/v1/auth/invites', { email: 'x@acme.com', role: 'admin' }, bearer(admin.token))).statusCode).toBe(403);
    expect((await post('/api/v1/auth/invites', { email: 'x@acme.com', role: 'member' }, bearer(admin.token))).statusCode).toBe(201);
  });

  it('only the owner can change roles', async () => {
    const { token: ownerToken } = await registerOrg('Acme', 'owner@acme.com');
    const admin = await onboardEmployee(ownerToken, 'admin@acme.com', 'admin');
    const member = await onboardEmployee(ownerToken, 'member@acme.com', 'member');

    const asAdmin = await app.inject({
      method: 'PATCH', url: `/api/v1/auth/users/${member.user.id}/role`,
      headers: bearer(admin.token), payload: { role: 'admin' },
    });
    expect(asAdmin.statusCode).toBe(403);

    const asOwner = await app.inject({
      method: 'PATCH', url: `/api/v1/auth/users/${member.user.id}/role`,
      headers: bearer(ownerToken), payload: { role: 'admin' },
    });
    expect(asOwner.statusCode).toBe(200);
    expect(asOwner.json().user.role).toBe('admin');
  });

  it('disabling a user blocks their existing access token and logins immediately', async () => {
    const { token: ownerToken } = await registerOrg('Acme', 'owner@acme.com');
    const member = await onboardEmployee(ownerToken, 'member@acme.com');

    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/auth/users/${member.user.id}/status`,
      headers: bearer(ownerToken), payload: { status: 'disabled' },
    });
    expect(res.statusCode).toBe(200);

    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: bearer(member.token) });
    expect(me.statusCode).toBe(401);
    const login = await post('/api/v1/auth/login', { email: 'member@acme.com', password: PASSWORD });
    expect(login.statusCode).toBe(401);
  });
});

describe('tenant isolation', () => {
  it("one org's owner can't see or modify another org's users or invites", async () => {
    const a = await registerOrg('Org A', 'owner@a.com');
    const b = await registerOrg('Org B', 'owner@b.com');
    const aMember = await onboardEmployee(a.token, 'member@a.com');
    await post('/api/v1/auth/invites', { email: 'pending@a.com' }, bearer(a.token));

    const bUsers = await app.inject({ method: 'GET', url: '/api/v1/auth/users', headers: bearer(b.token) });
    expect(bUsers.json().users.map((u: { email: string }) => u.email)).toEqual(['owner@b.com']);

    const bInvites = await app.inject({ method: 'GET', url: '/api/v1/auth/invites', headers: bearer(b.token) });
    expect(bInvites.json().invites).toHaveLength(0);

    const cross = await app.inject({
      method: 'PATCH', url: `/api/v1/auth/users/${aMember.user.id}/status`,
      headers: bearer(b.token), payload: { status: 'disabled' },
    });
    expect(cross.statusCode).toBe(404);
  });
});
