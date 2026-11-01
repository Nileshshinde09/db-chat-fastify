import { apiClient } from "../client"
import { AuthApiError } from "../errors"
import { useAuthStore } from "@/stores/useAuthStore"
import {
  InviteSchema,
  type AcceptInviteInput,
  type AcceptInviteResponse,
  type CreateInviteInput,
  type CreateInviteResponse,
  type ListInvitesResponse,
  type Invite
} from "./invites.types"
import type { AuthErrorCode, ValidationIssue } from "../auth/auth.types"

const { accessToken } = useAuthStore.getState()

/* ───────────────  Create invite  ─────────────── */

export async function createInvite(
  input: CreateInviteInput
): Promise<CreateInviteResponse> {
  try {
    const raw = await apiClient<CreateInviteResponse>("/api/v1/auth/invites", {
      method: "POST",
      body: JSON.stringify(input),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })
    return {
      invite: InviteSchema.parse(raw.invite),
      inviteLink: raw.inviteLink,
    }
  } catch (err) {
    console.log(err)
    throw toAuthError(err, "Invite failed")
  }
}

/* ───────────────  List pending invites  ─────────────── */

export async function listInvites(): Promise<ListInvitesResponse> {
  try {
    const raw = await apiClient<unknown[]>(
      "/api/v1/auth/invites",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )
    return { invites: raw.map((i) => InviteSchema.parse(i)) }
  } catch (err) {
    throw toAuthError(err, "Could not load invites")
  }
}

/* ───────────────  Revoke invite (204, no body)  ─────────────── */

export async function revokeInvite(id: string): Promise<void> {
  try {
    await apiClient<null>(`/api/v1/auth/invites/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })
  } catch (err) {
    throw toAuthError(err, "Could not revoke invite")
  }
}

/* ───────────────  Accept invite (anonymous)  ─────────────── */

export async function acceptInvite(
  input: AcceptInviteInput
): Promise<AcceptInviteResponse> {
  try {
    const data = await apiClient<AcceptInviteResponse>(
      "/api/v1/auth/invites/accept",
      {
        method: "POST",
        body: JSON.stringify(input),
        skipAuth: true, // no token yet — same as register-organization
        skipRefresh: true, // 401 here is a real failure
      }
    )

    const store = useAuthStore.getState()
    store.setSession({ accessToken: data.accessToken, user: data.user })
    useAuthStore.setState({
      organization: data.organization,
      status: "authenticated",
    })

    return data
  } catch (err) {
    throw toAuthError(err, "Could not accept invite")
  }
}

/* ───────────────  Shared normalizer  ─────────────── */

function toAuthError(err: unknown, fallback: string): AuthApiError {
  if (err instanceof AuthApiError) return err
  const e = err as any
  const status: number = e?.status ?? e?.response?.status ?? 0
  const body: any = e?.body ?? e?.response?.data ?? e?.data ?? {}
  const known: AuthErrorCode[] = [
    "EMAIL_TAKEN",
    "VALIDATION_ERROR",
    "FORBIDDEN",
    "NOT_FOUND",
    "INVALID_INVITE",
    "CONFLICT",
  ]
  const code: AuthErrorCode = known.includes(body?.code) ? body.code : "UNKNOWN"
  const issues: ValidationIssue[] | undefined = Array.isArray(body?.issues)
    ? body.issues
    : undefined
  return new AuthApiError(status, code, body?.message ?? fallback, issues)
}
