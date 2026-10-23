import type {
  ConnectionTestResult,
  LlmChatRequest,
  LlmClient,
  LlmConnection,
  LlmEvent,
  SchemaTable,
} from './types';

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted || ms <= 0) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      signal.removeEventListener('abort', done);
      clearTimeout(t);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

/**
 * Deterministic stand-in for the FastAPI LLM server, for development and tests.
 * Magic words in the user's message: "error" -> emits an error event,
 * "slow" -> waits ~10s (abortable), "boom" -> throws a transport failure.
 */
export class MockLlmClient implements LlmClient {
  /** The last request received, handy for assertions in tests. */
  lastRequest: LlmChatRequest | null = null;

  constructor(private readonly opts: { delayMs?: number } = {}) {}

  async *streamChat(req: LlmChatRequest, signal: AbortSignal): AsyncGenerator<LlmEvent> {
    this.lastRequest = req;
    const delay = this.opts.delayMs ?? 15;
    const question = req.messages[req.messages.length - 1]?.content ?? '';
    const lower = question.toLowerCase();

    if (lower.includes('boom')) throw new Error('mock transport failure');
    if (lower.includes('slow')) await sleep(10_000, signal);
    if (signal.aborted) return;

    const source = req.connection
      ? `database "${req.connection.name}" (${req.connection.type})`
      : `${req.files.length} attached file(s)`;
    const fileNote = req.files.length
      ? ` Files: ${req.files.map((f) => `${f.name} [${(f.preview as { sheets?: { columns: string[] }[] })?.sheets?.[0]?.columns?.join(', ') ?? ''}]`).join('; ')}.`
      : '';
    const text = `Mock answer for "${question.slice(0, 80)}" using ${source}.${fileNote}`;

    for (const word of text.split(/(\s+)/)) {
      if (signal.aborted) return;
      yield { type: 'delta', text: word };
      await sleep(delay, signal);
    }
    if (signal.aborted) return;

    if (req.connection) {
      yield { type: 'sql', sql: 'SELECT id, name FROM customers LIMIT 3;', dialect: req.connection.type };
    }
    yield {
      type: 'table',
      title: 'Mock result',
      columns: ['id', 'name'],
      rows: [
        [1, 'Ada'],
        [2, 'Grace'],
        [3, 'Linus'],
      ],
      rowCount: 3,
    };
    if (lower.includes('error')) {
      yield { type: 'error', code: 'QUERY_FAILED', message: 'Mock query failed' };
      return;
    }
    yield { type: 'done', usage: { mock: true } };
  }

  async testConnection(conn: Omit<LlmConnection, 'id' | 'name'>): Promise<ConnectionTestResult> {
    if (conn.host.includes('unreachable')) {
      return { ok: false, message: 'Connection refused (mock)' };
    }
    return { ok: true, latencyMs: 12, serverVersion: 'mock-1.0', message: 'Connected (mock)' };
  }

  async getSchema(): Promise<{ tables: SchemaTable[] }> {
    return {
      tables: [
        {
          name: 'customers',
          schema: 'public',
          columns: [
            { name: 'id', type: 'integer', nullable: false },
            { name: 'name', type: 'text', nullable: false },
            { name: 'created_at', type: 'timestamp', nullable: true },
          ],
        },
        {
          name: 'orders',
          schema: 'public',
          columns: [
            { name: 'id', type: 'integer', nullable: false },
            { name: 'customer_id', type: 'integer', nullable: false },
            { name: 'total', type: 'numeric', nullable: false },
          ],
        },
      ],
    };
  }
}
