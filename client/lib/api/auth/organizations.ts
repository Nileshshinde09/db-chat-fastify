// src/lib/api/organizations.ts
import { useAuthStore } from "@/stores/useAuthStore"
import { apiClient } from "../client"
import { AuthApiError } from "../errors"
import type { AuthErrorCode, ValidationIssue } from "./auth.types"
import {
  OrganizationSchema,
  User,
  UsersResponse,
  type Organization,
  type UpdateOrganizationInput,
} from "./organizations.types"
const { accessToken } = useAuthStore.getState()
/**
 * Fetch a single organization by id.
 * ASSUMED endpoint — confirm against the .bru pack.
 */
export async function getOrganization(id: string): Promise<Organization> {
  try {
    const raw = await apiClient<unknown>(
      `/api/v1/organizations/${encodeURIComponent(id)}`
    )
    return OrganizationSchema.parse(raw) // fails loudly on drift
  } catch (err) {
    throw normalizeOrgError(err)
  }
}

/**
 * Fetch a list of members
 * ASSUMED endpoint — confirm against the .bru pack.
 */
export async function getMembersOfOrg(): Promise<User[]> {
  try {
    const raw = await apiClient<UsersResponse>(`/api/v1/auth/users`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    return raw.users
  } catch (err) {
    throw normalizeOrgError(err)
  }
}

/**
 * Current org is already returned by /auth/me — call the auth service instead
 * of hitting the network twice. Kept here so components import one module.
 */
export { me as getCurrentOrganization } from "./auth"

/**
 * Update the org. Only `name` / `slug` are modelled — add fields if the
 * backend accepts them. ASSUMED endpoint + PATCH verb.
 */
export async function updateOrganization(
  id: string,
  patch: UpdateOrganizationInput
): Promise<Organization> {
  try {
    const raw = await apiClient<unknown>(
      `/api/v1/organizations/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(patch) }
    )
    return OrganizationSchema.parse(raw)
  } catch (err) {
    throw normalizeOrgError(err)
  }
}

/** Reuse the auth normalizer — same envelope on every endpoint. */
function normalizeOrgError(err: unknown): AuthApiError {
  if (err instanceof AuthApiError) return err
  const e = err as any
  const status: number = e?.status ?? e?.response?.status ?? 0
  const body: any = e?.body ?? e?.response?.data ?? e?.data ?? {}
  const known: AuthErrorCode[] = [
    "EMAIL_TAKEN",
    "VALIDATION_ERROR",
    "NOT_FOUND",
    "FORBIDDEN",
    "CONFLICT",
  ]
  const code: AuthErrorCode = known.includes(body?.code) ? body.code : "UNKNOWN"
  const issues: ValidationIssue[] | undefined = Array.isArray(body?.issues)
    ? body.issues
    : undefined
  return new AuthApiError(
    status,
    code,
    body?.message ?? e?.message ?? "Organization request failed",
    issues
  )
}
