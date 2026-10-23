import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { FastifyInstance } from 'fastify';
import { connectDb, disconnectDb } from '../src/config/db';

let mongod: MongoMemoryServer | undefined;
const external = process.env.TEST_MONGODB_URI;

/**
 * Uses TEST_MONGODB_URI (a throwaway database name is generated) when set,
 * otherwise spins up an in-memory MongoDB.
 */
export async function startTestDb(): Promise<void> {
  if (external) {
    const url = new URL(external);
    url.pathname = `/test_${randomBytes(4).toString('hex')}`;
    await connectDb(url.toString());
  } else {
    mongod = await MongoMemoryServer.create();
    await connectDb(mongod.getUri());
  }
}

export async function stopTestDb(): Promise<void> {
  if (external) await mongoose.connection.dropDatabase();
  await disconnectDb();
  await mongod?.stop();
}

export async function clearDb(): Promise<void> {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

/* ---------------------------------------------------------------- HTTP client */

export interface ApiResponse<T = any> {
  status: number;
  json: T;
  text: string;
  headers: Headers;
}

export function createClient(base: string) {
  return async function api<T = any>(
    method: string,
    path: string,
    opts: { token?: string; body?: unknown; form?: FormData; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    let body: string | FormData | undefined;
    if (opts.form) {
      body = opts.form;
    } else if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const res = await fetch(`${base}${path}`, { method, headers, body });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON (SSE, CSV, ...) */
    }
    return { status: res.status, json, text, headers: res.headers };
  };
}

export type Api = ReturnType<typeof createClient>;

export async function listen(app: FastifyInstance): Promise<string> {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (!addr || typeof addr === 'string') throw new Error('server did not start');
  return `http://127.0.0.1:${addr.port}`;
}

export const PASSWORD = 'Sup3r-secret-pw';

export async function registerOrg(api: Api, name: string, email: string) {
  const res = await api('POST', '/api/v1/auth/register-organization', {
    body: { organizationName: name, name: 'Owner', email, password: PASSWORD },
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.text}`);
  return { token: res.json.accessToken as string, user: res.json.user, org: res.json.organization };
}

/** Owner invites an employee and the employee accepts. Returns the employee's session. */
export async function onboard(api: Api, ownerToken: string, email: string, role: 'admin' | 'member' = 'member') {
  const inv = await api('POST', '/api/v1/auth/invites', { token: ownerToken, body: { email, role } });
  if (inv.status !== 201) throw new Error(`invite failed: ${inv.text}`);
  const token = /token=([^&]+)/.exec(inv.json.inviteLink)![1]!;
  const acc = await api('POST', '/api/v1/auth/invites/accept', { body: { token, name: 'Employee', password: PASSWORD } });
  if (acc.status !== 201) throw new Error(`accept failed: ${acc.text}`);
  return { token: acc.json.accessToken as string, user: acc.json.user };
}

export interface SseEvent {
  event: string;
  data: any;
}

export function parseSse(text: string): SseEvent[] {
  return text
    .split(/\n\n/)
    .map((b) => b.trim())
    .filter((b) => b && !b.startsWith(':'))
    .map((block) => ({
      event: /^event: (.*)$/m.exec(block)?.[1] ?? 'message',
      data: JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? 'null'),
    }));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitFor<T>(fn: () => Promise<T | undefined | false>, timeoutMs = 3000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await sleep(40);
  }
  throw new Error('waitFor timed out');
}

export const PG = {
  name: 'Warehouse',
  type: 'postgres',
  host: 'db.example.com',
  database: 'analytics',
  username: 'readonly_user',
  password: 'p@ss-w0rd-Secret!',
};
