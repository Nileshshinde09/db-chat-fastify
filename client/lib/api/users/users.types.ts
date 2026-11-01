import { z } from "zod"

// ─── Enums ───────────────────────────────────────────────────────────────────

export const ROLES = ["owner", "admin", "member"] as const
export type Role = (typeof ROLES)[number]

export const USER_STATUSES = ["active", "disabled"] as const
export type UserStatus = (typeof USER_STATUSES)[number]

// ─── Response Shapes ─────────────────────────────────────────────────────────

export const UserSchema = z.object({
  id: z.string(),
  orgId: z.string().optional(), // Might be omitted by toPublicUser
  email: z.string().email(),
  name: z.string(),
  role: z.enum(ROLES),
  status: z.enum(USER_STATUSES),
  lastLoginAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
})

export type DbUser = z.infer<typeof UserSchema>

export const ListUsersResponseSchema = z.object({
  users: z.array(UserSchema),
})

export const UserResponseSchema = z.object({
  user: UserSchema,
})

// ─── Request Inputs ──────────────────────────────────────────────────────────

export interface UpdateRoleInput {
  role: Role
}

export interface UpdateStatusInput {
  status: UserStatus
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export type UserErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "UNKNOWN"

export class UserApiError extends Error {
  readonly status: number
  readonly code: UserErrorCode

  constructor(status: number, code: UserErrorCode, message: string) {
    super(message)
    this.name = "UserApiError"
    this.status = status
    this.code = code
  }
}