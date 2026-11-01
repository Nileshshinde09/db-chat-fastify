// src/lib/api/invites.result.ts
import { createInvite, acceptInvite, revokeInvite } from "./invites"
import { AuthApiError } from "../errors"
import type { CreateInviteInput, AcceptInviteResponse } from "./invites.types"
import type { ValidationIssue } from "../auth/auth.types"

export type CreateInviteResult =
  | { ok: true; data: Awaited<ReturnType<typeof createInvite>> }
  | { ok: false; code: "EMAIL_TAKEN" }
  | { ok: false; code: "FORBIDDEN" }
  | { ok: false; code: "VALIDATION_ERROR"; issues: ValidationIssue[] }
  | { ok: false; code: "UNKNOWN"; message: string }

export async function createInviteResult(
  input: CreateInviteInput
): Promise<CreateInviteResult> {
  try {
    return { ok: true, data: await createInvite(input) }
  } catch (err) {
    if (err instanceof AuthApiError) {
      if (err.code === "EMAIL_TAKEN") return { ok: false, code: "EMAIL_TAKEN" }
      if (err.code === "FORBIDDEN") return { ok: false, code: "FORBIDDEN" }
      if (err.code === "VALIDATION_ERROR")
        return { ok: false, code: "VALIDATION_ERROR", issues: err.issues ?? [] }
      return { ok: false, code: "UNKNOWN", message: err.message }
    }
    throw err
  }
}

export type AcceptInviteResult =
  | { ok: true; data: AcceptInviteResponse }
  | { ok: false; code: "INVALID_INVITE" }
  | { ok: false; code: "VALIDATION_ERROR"; issues: ValidationIssue[] }
  | { ok: false; code: "UNKNOWN"; message: string }

export async function acceptInviteResult(
  input: Parameters<typeof acceptInvite>[0]
): Promise<AcceptInviteResult> {
  try {
    return { ok: true, data: await acceptInvite(input) }
  } catch (err) {
    if (err instanceof AuthApiError) {
      if (err.code === "INVALID_INVITE")
        return { ok: false, code: "INVALID_INVITE" }
      if (err.code === "VALIDATION_ERROR")
        return { ok: false, code: "VALIDATION_ERROR", issues: err.issues ?? [] }
      return { ok: false, code: "UNKNOWN", message: err.message }
    }
    throw err
  }
}

export type RevokeInviteResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" }
  | { ok: false; code: "VALIDATION_ERROR" } // malformed id (not-an-object-id)
  | { ok: false; code: "FORBIDDEN" }
  | { ok: false; code: "UNKNOWN"; message: string }

export async function revokeInviteResult(
  id: string
): Promise<RevokeInviteResult> {
  try {
    await revokeInvite(id)
    return { ok: true }
  } catch (err) {
    if (err instanceof AuthApiError) {
      if (err.code === "NOT_FOUND") return { ok: false, code: "NOT_FOUND" }
      if (err.code === "VALIDATION_ERROR")
        return { ok: false, code: "VALIDATION_ERROR" }
      if (err.code === "FORBIDDEN") return { ok: false, code: "FORBIDDEN" }
      return { ok: false, code: "UNKNOWN", message: err.message }
    }
    throw err
  }
}
