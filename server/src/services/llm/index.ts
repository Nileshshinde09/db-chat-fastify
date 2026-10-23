import { env } from '../../config/env';
import { HttpLlmClient } from './http-client';
import { MockLlmClient } from './mock-client';
import type { LlmClient } from './types';

declare module 'fastify' {
  interface FastifyInstance {
    /** The client for the FastAPI LLM server (or the mock). Replaceable in tests. */
    llm: LlmClient;
  }
}

export function createLlmClient(): LlmClient {
  if (env.LLM_SERVER_MODE === 'http') {
    return new HttpLlmClient({
      baseUrl: env.LLM_SERVER_URL!,
      apiKey: env.LLM_SERVER_API_KEY!,
      timeoutMs: env.LLM_REQUEST_TIMEOUT_MS,
    });
  }
  return new MockLlmClient();
}

export * from './types';
export { MockLlmClient } from './mock-client';
export { HttpLlmClient, parseSse } from './http-client';
