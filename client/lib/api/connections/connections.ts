// src/lib/api/connections.ts
import { apiClient } from "../client"
import type { ValidationIssue } from "../auth/auth.types"
import {
  ConnectionApiError,
  ConnectionListResponseSchema,
  ConnectionResponseSchema,
  ConnectionTestResultSchema,
  type ConnectionErrorCode,
  type ConnectionSchema,
  type ConnectionTestResult,
  type CreateConnectionInput,
  type DbConnection,
  type TestConnectionInput,
  type UpdateConnectionInput,
} from "./connections.types"
import { useAuthStore } from "@/stores/useAuthStore"

// Re-export so components import a single module (same rationale as organizations.ts).
export * from "./connections.types"

/**
 * ASSUMED base path — confirm against the .bru pack.
 * Mirrors the Fastify `connectionRoutes` plugin.
 */
const BASE = "/api/v1/connections"
const { accessToken } = useAuthStore.getState()

const enc = (v: string) => encodeURIComponent(v)

// ─── Reads (any authenticated user; members see a reduced view) ──────────────

export async function listConnections(): Promise<DbConnection[]> {
  try {
    const raw = await apiClient<unknown>(BASE)
    return ConnectionListResponseSchema.parse(raw).connections
  } catch (err) {
    throw normalizeConnectionError(err)
  }
}

export async function getConnection(id: string): Promise<DbConnection> {
  try {
    const raw = await apiClient<unknown>(`${BASE}/${enc(id)}`)
    return ConnectionResponseSchema.parse(raw).connection
  } catch (err) {
    throw normalizeConnectionError(err)
  }
}

export async function getConnectionSchema(
  id: string
): Promise<ConnectionSchema> {
  try {
    return await apiClient<ConnectionSchema>(`${BASE}/${enc(id)}/schema`)
  } catch (err) {
    throw normalizeConnectionError(err)
  }
}

// ─── Writes (owner/admin only) ────────────────────────────────────────────────

export async function createConnection(
  input: CreateConnectionInput
): Promise<DbConnection> {
  try {
    const raw = await apiClient<unknown>(BASE, {
      method: "POST",
      body: JSON.stringify(input),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })
    return ConnectionResponseSchema.parse(raw).connection
  } catch (err) {
    throw normalizeConnectionError(err)
  }
}

export async function updateConnection(
  id: string,
  patch: UpdateConnectionInput
): Promise<DbConnection> {
  // Mirror the backend's `.refine` so callers get an immediate, typed error.
  if (Object.keys(patch).length === 0) {
    throw new ConnectionApiError(
      0,
      "VALIDATION_ERROR",
      "Provide at least one field to update"
    )
  }
  try {
    const raw = await apiClient<unknown>(`${BASE}/${enc(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })
    return ConnectionResponseSchema.parse(raw).connection
  } catch (err) {
    throw normalizeConnectionError(err)
  }
}

export async function deleteConnection(id: string): Promise<void> {
  try {
    await apiClient<void>(`${BASE}/${enc(id)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })
  } catch (err) {
    throw normalizeConnectionError(err)
  }
}

// ─── Test endpoints (owner/admin, rate-limited: 10 req/min → 429) ────────────

/** Test an unsaved configuration (e.g. "Test" button on the create form). */
export async function testUnsavedConnection(
  input: TestConnectionInput
): Promise<ConnectionTestResult> {
  try {
    const raw = await apiClient<unknown>(`${BASE}/test`, {
      method: "POST",
      body: JSON.stringify(input),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })
    return ConnectionTestResultSchema.parse(raw)
  } catch (err) {
    throw normalizeConnectionError(err)
  }
}

/** Re-test a saved connection; also updates lastTest* on the server. */
export async function testSavedConnection(
  id: string
): Promise<ConnectionTestResult> {
  try {
    const raw = await apiClient<unknown>(`${BASE}/${enc(id)}/test`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
    })
    return ConnectionTestResultSchema.parse(raw)
  } catch (err) {
    throw normalizeConnectionError(err)
  }
}

// ─── Error normalization ─────────────────────────────────────────────────────

const KNOWN_CODES = new Set<ConnectionErrorCode>([
  "CONNECTION_NAME_TAKEN",
  "CONNECTION_LIMIT",
  "CREDENTIALS_UNREADABLE",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "FORBIDDEN",
  "CONFLICT",
  "UNAUTHORIZED",
  "RATE_LIMITED",
  "UNKNOWN",
])

function normalizeConnectionError(err: unknown): ConnectionApiError {
  if (err instanceof ConnectionApiError) return err

  const e = err as {
    status?: number
    message?: string
    body?: unknown
    response?: { status?: number; data?: unknown }
    data?: unknown
  }

  const status = e?.status ?? e?.response?.status ?? 0
  const body = (e?.body ?? e?.response?.data ?? e?.data ?? {}) as {
    code?: unknown
    message?: unknown
    issues?: unknown
  }

  const code: ConnectionErrorCode =
    typeof body.code === "string" &&
    KNOWN_CODES.has(body.code as ConnectionErrorCode)
      ? (body.code as ConnectionErrorCode)
      : "UNKNOWN"

  const issues: ValidationIssue[] | undefined = Array.isArray(body.issues)
    ? (body.issues as ValidationIssue[])
    : undefined

  const message =
    typeof body.message === "string" && body.message.length > 0
      ? body.message
      : (e?.message ?? "Connection request failed")

  return new ConnectionApiError(status, code, message, issues)
}
