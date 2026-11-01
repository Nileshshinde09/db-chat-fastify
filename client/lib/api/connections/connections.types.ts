// src/lib/api/connections.types.ts
import { z } from "zod"
import type { ValidationIssue } from "../auth/auth.types"

/**
 * Keep in sync with backend `DB_TYPES` (models/db-connection.model.ts).
 * Being a tuple means drift fails loudly on `.parse` — same philosophy as OrganizationSchema.
 */
export const DB_TYPES = [
  "postgres",
  "cockroachdb",
  "mysql",
  "mariadb",
  "mongodb",
  "mssql",
  "oracle",
  "redis",
] as const

export type DbType = (typeof DB_TYPES)[number]

/** Keep in sync with backend `DEFAULT_PORTS`. Used only to prefill the form. */
export const DEFAULT_PORTS: Record<DbType, number> = {
  postgres: 5432,
  cockroachdb: 26257,
  mysql: 3306,
  mariadb: 3306,
  mongodb: 27017,
  mssql: 1433,
  oracle: 1521,
  redis: 6379,
}

export function defaultPortFor(type: DbType): number {
  return DEFAULT_PORTS[type]
}

// ─── Response shapes ──────────────────────────────────────────────────────────

const optionValue = z.union([z.string(), z.number(), z.boolean()])
const optionsSchema = z.record(z.string(), optionValue)

/**
 * Public shape produced by the backend's `toPublicConnection`.
 * Host / port / username / ssl / options / lastTestMessage are only present
 * for owner/admin — members get the reduced shape.
 */
export const DbConnectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(DB_TYPES),
  database: z.string(),
  readOnly: z.boolean(),
  lastTestedAt: z.coerce.date().nullable(),
  lastTestStatus: z.enum(["ok", "failed"]).nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),

  // owner/admin only
  host: z.string().optional(),
  port: z.number().optional(),
  username: z.string().optional(),
  ssl: z.boolean().optional(),
  options: optionsSchema.optional(),
  lastTestMessage: z.string().nullable().optional(),
})

export type DbConnection = z.infer<typeof DbConnectionSchema>

export const ConnectionResponseSchema = z.object({
  connection: DbConnectionSchema,
})

export const ConnectionListResponseSchema = z.object({
  connections: z.array(DbConnectionSchema),
})

/** Returned by POST /test and POST /:id/test. Passthrough for forward-compat. */
export const ConnectionTestResultSchema = z
  .object({
    ok: z.boolean(),
    message: z.string().optional(),
  })
  .passthrough()

export type ConnectionTestResult = z.infer<typeof ConnectionTestResultSchema>

/**
 * Schema introspection is served by the LLM server — its shape isn't modelled
 * here yet. Refine this once the contract is stable.
 */
export type ConnectionSchema = unknown

// ─── Request input types (mirror connections.schemas.ts) ─────────────────────

export type ConnectionOptions = Record<string, string | number | boolean>

export interface CreateConnectionInput {
  name: string
  description?: string
  type: DbType
  host: string
  port?: number
  database: string
  username?: string
  password?: string
  ssl?: boolean
  readOnly?: boolean
  options?: ConnectionOptions
}

/** Backend enforces "at least one field" — see `updateConnection` in the service. */
export type UpdateConnectionInput = Partial<CreateConnectionInput>

export interface TestConnectionInput {
  type: DbType
  host: string
  port?: number
  database: string
  username?: string
  password?: string
  ssl?: boolean
  options?: ConnectionOptions
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export type ConnectionErrorCode =
  | "CONNECTION_NAME_TAKEN"
  | "CONNECTION_LIMIT"
  | "CREDENTIALS_UNREADABLE"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "UNKNOWN"

/**
 * Mirrors `AuthApiError`. Kept separate because the connection routes emit
 * extra codes (CONNECTION_NAME_TAKEN, CONNECTION_LIMIT, CREDENTIALS_UNREADABLE)
 * that aren't part of `AuthErrorCode`.
 */
export class ConnectionApiError extends Error {
  readonly status: number
  readonly code: ConnectionErrorCode
  readonly issues?: ValidationIssue[]

  constructor(
    status: number,
    code: ConnectionErrorCode,
    message: string,
    issues?: ValidationIssue[]
  ) {
    super(message)
    this.name = "ConnectionApiError"
    this.status = status
    this.code = code
    this.issues = issues
  }
}