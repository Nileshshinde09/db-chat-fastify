import { z } from "zod";
import {
  LlmError,
  type ConnectionTestResult,
  type LlmChatRequest,
  type LlmClient,
  type LlmConnection,
  type LlmEvent,
  type SchemaTable,
} from "./types";

const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({
    type: z.literal("sql"),
    sql: z.string(),
    dialect: z.string().optional(),
  }),
  z.object({
    type: z.literal("table"),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.unknown())),
    rowCount: z.number().optional(),
    truncated: z.boolean().optional(),
    title: z.string().optional(),
  }),
  z.object({
    type: z.literal("chart"),
    spec: z.record(z.string(), z.unknown()),
  }),
  z.object({ type: z.literal("title"), title: z.string() }),
  z.object({
    type: z.literal("done"),
    usage: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    type: z.literal("error"),
    code: z.string().default("LLM_ERROR"),
    message: z.string(),
  }),
]);

export async function* parseSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, "");
        const data = raw
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n");
        if (data) yield data;
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith("data:")) yield tail.slice(5).trim();
  } finally {
    reader.releaseLock();
  }
}

export interface HttpLlmClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export class HttpLlmClient implements LlmClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: HttpLlmClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${this.opts.apiKey}`,
      ...extra,
    };
  }

  private withTimeout(signal?: AbortSignal): AbortSignal {
    const timeout = AbortSignal.timeout(this.opts.timeoutMs);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const url = `${this.base}${path}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "GET",
        headers: this.headers(),
        signal: this.withTimeout(signal),
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new LlmError(
        "LLM_UNREACHABLE",
        `Could not reach ${url}: ${(err as Error).message}`,
      );
    }
    if (!res.ok) {
      throw new LlmError(
        "LLM_UPSTREAM_ERROR",
        `[${res.status}] ${await readError(res)}`,
        res.status,
      );
    }
    return (await res.json()) as T;
  }

  private async post<T>(
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: this.withTimeout(signal),
      });
    } catch (err) {
      throw new LlmError(
        "LLM_UNREACHABLE",
        `Could not reach the LLM server: ${(err as Error).message}`,
      );
    }
    if (!res.ok) {
      throw new LlmError(
        "LLM_UPSTREAM_ERROR",
        await readError(res),
        res.status,
      );
    }
    return (await res.json()) as T;
  }

  // ── Chat Bridge ───────────────────────────────────────────────────────
  // FastAPI returns a single JSON response. We synthesize SSE events
  // so the Fastify messages.service.ts works without modification.
  async *streamChat(
    req: LlmChatRequest,
    signal: AbortSignal,
  ): AsyncGenerator<LlmEvent> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/api/v1/chat`, {
        method: "POST",
        headers: this.headers({
          "x-user-id": req.userId,               // FastAPI auth stub
          "x-organization-id": req.orgId,        // FastAPI auth stub
        }),
        body: JSON.stringify({
          threadId: req.conversationId,          // maps to FastAPI threadId
          connectionId: req.connection?.id ?? "unknown",
          message: req.messages[req.messages.length - 1]?.content ?? "",
          connection: req.connection,            // full config with decrypted password
          reportId: req.reportId,                // optional: for editing
        }),
        signal: this.withTimeout(signal),
      });
    } catch (err) {
      if (signal.aborted) return;
      throw new LlmError(
        "LLM_UNREACHABLE",
        `Could not reach the LLM server: ${(err as Error).message}`,
      );
    }

    if (!res.ok) {
      throw new LlmError(
        "LLM_UPSTREAM_ERROR",
        await readError(res),
        res.status,
      );
    }

    const data = (await res.json()) as {
      answer: string;
      query?: string | object;
      query_kind?: string;
      row_count?: number;
      report_id?: string;
      is_edit?: boolean;
    };

    if (signal.aborted) return;

    // 1. Synthesize the SQL block (if the LLM generated a query)
    if (data.query) {
      yield {
        type: "sql",
        sql: typeof data.query === "string" ? data.query : JSON.stringify(data.query),
        dialect: data.query_kind,
      };
    }

    // 2. Synthesize the text answer (yielded as one large delta)
    yield { type: "delta", text: data.answer ?? "" };

    // 3. Synthesize the done event with metadata for the UI
    yield {
      type: "done",
      usage: {
        row_count: data.row_count,
        report_id: data.report_id,
        query: data.query,
        query_kind: data.query_kind,
        is_edit: data.is_edit,
      },
    };
  }

  // ── Connections ───────────────────────────────────────────────────────
  testConnection(
    conn: Omit<LlmConnection, "id" | "name">,
    signal?: AbortSignal,
  ): Promise<ConnectionTestResult> {
    return this.post<ConnectionTestResult>(
      "/api/v1/connections/test",             // ← Fixed: plural "connections"
      { connection: conn },
      signal,
    );
  }

  // ── Schema ────────────────────────────────────────────────────────────
  getSchema(
    conn: Omit<LlmConnection, "id" | "name">,
    signal?: AbortSignal,
  ): Promise<{ tables: SchemaTable[] }> {
    // Note: FastAPI currently only has /api/v1/schema/index (which indexes, not fetches).
    // If you need a fetch endpoint, it must be added to FastAPI.
    return this.post<{ tables: SchemaTable[] }>(
      "/api/v1/schema/index",
      { connection_id: (conn as any).connection_id ?? "" },
      signal,
    );
  }

  // ── Reports ───────────────────────────────────────────────────────────
  createReport(
    body: {
      connection_id: string;
      query: string | object;
      format: "csv" | "xlsx";
      title?: string;
    },
    signal?: AbortSignal,
  ): Promise<{ reportId: string; status: string }> {
    // Note: FastAPI requires X-User-Id and X-Organization-Id headers
    // for the /reports endpoint. It's better to proxy this from a Fastify route
    // instead of the internal HttpLlmClient.
    return this.post("/api/v1/reports", body, signal);
  }

  getReportStatus(
    reportId: string,
    signal?: AbortSignal,
  ): Promise<{
    report_id: string;
    status: string;
    row_count?: number;
    size_bytes?: number;
    error?: string;
    created_at: string;
  }> {
    return this.get(`/api/v1/reports/${reportId}`, signal);
  }

  downloadReportUrl(reportId: string): string {
    return `${this.base}/api/v1/reports/${reportId}/download`;
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const text = (await res.text()).slice(0, 300);
    return text || `LLM server responded with ${res.status}`;
  } catch {
    return `LLM server responded with ${res.status}`;
  }
}