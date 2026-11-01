import { apiClient } from "../client"
import { useAuthStore } from "@/stores/useAuthStore"
import {
  ListUsersResponseSchema,
  UserResponseSchema,
  UserApiError,
  type DbUser,
  type Role,
  type UserStatus,
  type UpdateRoleInput,
  type UpdateStatusInput,
} from "./users.types"

// Re-export so components import a single module
export * from "./users.types"

// Matches the Fastify prefix in main.ts/server.ts
const BASE = "/api/v1/auth/users"

const getToken = () => useAuthStore.getState().accessToken
const enc = (v: string) => encodeURIComponent(v)

// ─── Reads (Owner / Admin) ───────────────────────────────────────────────────

export async function listUsers(): Promise<DbUser[]> {
  try {
    const raw = await apiClient<unknown>(BASE, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    return ListUsersResponseSchema.parse(raw).users
  } catch (err) {
    throw normalizeUserError(err)
  }
}

// ─── Writes (Owner / Admin) ──────────────────────────────────────────────────

/**
 * Change a user's role.
 * ⚠️ Backend restricts this to the "Owner" role only.
 */
export async function updateUserRole(
  id: string,
  role: Role
): Promise<DbUser> {
  try {
    const raw = await apiClient<unknown>(`${BASE}/${enc(id)}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role } as UpdateRoleInput),
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
    })
    return UserResponseSchema.parse(raw).user
  } catch (err) {
    throw normalizeUserError(err)
  }
}

/**
 * Enable or disable a user's access.
 * ⚠️ Backend restricts this to "Owner" and "Admin" roles.
 */
export async function updateUserStatus(
  id: string,
  status: UserStatus
): Promise<DbUser> {
  try {
    const raw = await apiClient<unknown>(`${BASE}/${enc(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status } as UpdateStatusInput),
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
    })
    return UserResponseSchema.parse(raw).user
  } catch (err) {
    throw normalizeUserError(err)
  }
}

// ─── Error normalization ─────────────────────────────────────────────────────

function normalizeUserError(err: unknown): UserApiError {
  if (err instanceof UserApiError) return err

  const e = err as {
    status?: number
    message?: string
    body?: unknown
    response?: { status?: number; data?: unknown }
  }

  const status = e?.status ?? e?.response?.status ?? 0
  const body = (e?.body ?? e?.response?.data ?? {}) as {
    code?: string
    message?: string
  }

  const knownCodes = ["NOT_FOUND", "FORBIDDEN", "CONFLICT", "UNAUTHORIZED"]
  const code = knownCodes.includes(body.code as string)
    ? (body.code as UserApiError["code"])
    : "UNKNOWN"

  const message =
    typeof body.message === "string" && body.message.length > 0
      ? body.message
      : (e?.message ?? "User request failed")

  return new UserApiError(status, code, message)
}