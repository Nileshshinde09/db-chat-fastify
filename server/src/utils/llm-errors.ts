import { LlmError } from '../services/llm/types';
import { AppError } from './errors';

/** Turns an LLM-server transport failure into a clean 502 for API clients. */
export function llmErrorToAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof LlmError) {
    return new AppError(502, err.code, err.message);
  }
  return new AppError(502, 'LLM_UNAVAILABLE', 'The AI service is currently unavailable');
}
