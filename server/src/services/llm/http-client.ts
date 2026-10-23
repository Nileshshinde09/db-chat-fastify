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
    spec: z.record(z.string(), z.unknown()), // <-- Fixed
  }),
  z.object({ type: z.literal("title"), title: z.string() }),
  z.object({
    type: z.literal("done"),
    usage: z.record(z.string(), z.unknown()).optional(), // <-- Fixed
  }),
  z.object({
    type: z.literal("error"),
    code: z.string().default("LLM_ERROR"),
    message: z.string(),
  }),
]);

/**
 * Incrementally parses a Server-Sent-Events byte stream into the JSON payloads
 * of its `data:` lines. Comments (": ping") and unknown fields are ignored.
 */
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
      // An SSE event ends with a blank line (\n\n or \r\n\r\n)
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

  async *streamChat(
    req: LlmChatRequest,
    signal: AbortSignal,
  ): AsyncGenerator<LlmEvent> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/v1/chat/stream`, {
        method: "POST",
        headers: this.headers({ accept: "text/event-stream" }),
        body: JSON.stringify(req),
        signal: this.withTimeout(signal),
      });
    } catch (err) {
      if (signal.aborted) return;
      throw new LlmError(
        "LLM_UNREACHABLE",
        `Could not reach the LLM server: ${(err as Error).message}`,
      );
    }
    if (!res.ok || !res.body) {
      throw new LlmError(
        "LLM_UPSTREAM_ERROR",
        await readError(res),
        res.status,
      );
    }

    let sawDone = false;
    try {
      for await (const data of parseSse(res.body)) {
        let json: unknown;
        try {
          json = JSON.parse(data);
        } catch {
          continue; // ignore malformed lines instead of failing the whole answer
        }
        const parsed = eventSchema.safeParse(json);
        if (!parsed.success) continue; // unknown event types are ignored (forward compatible)
        yield parsed.data as LlmEvent;
        if (parsed.data.type === "done" || parsed.data.type === "error") {
          sawDone = true;
          break;
        }
      }
    } catch (err) {
      if (signal.aborted) return;
      throw new LlmError(
        "LLM_STREAM_BROKEN",
        `The LLM stream was interrupted: ${(err as Error).message}`,
      );
    }
    if (!sawDone && !signal.aborted) {
      throw new LlmError(
        "LLM_STREAM_BROKEN",
        "The LLM stream ended unexpectedly",
      );
    }
  }

  testConnection(
    conn: Omit<LlmConnection, "id" | "name">,
    signal?: AbortSignal,
  ): Promise<ConnectionTestResult> {
    return this.post<ConnectionTestResult>(
      "/api/v1/connection/test",
      { connection: conn },
      signal,
    );
  }

  createReport(
    body: {
      connection_id: string;
      query: string;
      format: "csv" | "xlsx";
      title?: string;
    },
    signal?: AbortSignal,
  ): Promise<{ reportId: string; status: string }> {
    return this.post("/v1/reports", body, signal);
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
    // post() only does POST, so add a small GET helper or use fetch directly
    return this.get(`/v1/reports/${reportId}`, signal);
  }

  downloadReportUrl(reportId: string): string {
    return `${this.base}/v1/reports/${reportId}/download`;
  }

  getSchema(
    conn: Omit<LlmConnection, "id" | "name">,
    signal?: AbortSignal,
  ): Promise<{ tables: SchemaTable[] }> {
    return this.post<{ tables: SchemaTable[] }>(
      "/api/v1/connection/schema",
      { connection: conn },
      signal,
    );
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
