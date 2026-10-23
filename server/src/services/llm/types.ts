import type { DbType } from '../../models/db-connection.model';

/** Everything the LLM server needs to reach one database. Contains the decrypted password. */
export interface LlmConnection {
  id: string;
  name: string;
  type: DbType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  options: Record<string, string | number | boolean>;
}

export interface LlmFileRef {
  id: string;
  name: string;
  kind: 'csv' | 'xlsx';
  size: number;
  /** Short-lived signed URL the LLM server can GET without credentials. */
  url: string;
  preview: unknown;
}

export interface LlmChatRequest {
  conversationId: string;
  messageId: string;
  orgId: string;
  userId: string;
  /** Recent history; the newest user message is last. */
  messages: { role: 'user' | 'assistant'; content: string }[];
  /** Null when the chat only uses attached files. */
  connection: LlmConnection | null;
  files: LlmFileRef[];
  options: { readOnly: boolean; rowLimit: number };
}

export type LlmEvent =
  | { type: 'delta'; text: string }
  | { type: 'sql'; sql: string; dialect?: string }
  | { type: 'table'; columns: string[]; rows: unknown[][]; rowCount?: number; truncated?: boolean; title?: string }
  | { type: 'chart'; spec: Record<string, unknown> }
  | { type: 'title'; title: string }
  | { type: 'done'; usage?: Record<string, unknown> }
  | { type: 'error'; code: string; message: string };

export interface ConnectionTestResult {
  ok: boolean;
  message?: string;
  latencyMs?: number;
  serverVersion?: string;
}

export interface SchemaTable {
  name: string;
  schema?: string;
  columns: { name: string; type: string; nullable?: boolean }[];
}

export interface LlmClient {
  /** Streams the answer. Must stop promptly when `signal` aborts. */
  streamChat(req: LlmChatRequest, signal: AbortSignal): AsyncGenerator<LlmEvent>;
  testConnection(conn: Omit<LlmConnection, 'id' | 'name'>, signal?: AbortSignal): Promise<ConnectionTestResult>;
  getSchema(conn: Omit<LlmConnection, 'id' | 'name'>, signal?: AbortSignal): Promise<{ tables: SchemaTable[] }>;
}

/** Transport / protocol failure talking to the LLM server. */
export class LlmError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
