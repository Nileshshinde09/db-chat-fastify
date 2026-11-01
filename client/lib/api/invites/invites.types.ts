// src/lib/api/invites.types.ts
import { z } from "zod"

export const InvitableRole = z.enum(["admin", "member"]) // 'owner' rejected by API (400)
export type InvitableRole = z.infer<typeof InvitableRole>

/** Matches `res.body.invite` from POST/GET /auth/invites. */
export const InviteSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(["owner", "admin", "member"]), // or InvitableRole if invites are only member/admin
  expiresAt: z.string().datetime(), // or z.coerce.date()
  createdAt: z.string().datetime(),
  inviteLink: z.string().nullable().default(null),
})
export type Invite = z.infer<typeof InviteSchema>

export const CreateInviteInput = z.object({
  email: z.string().email(),
  role: InvitableRole,
})
export type CreateInviteInput = z.infer<typeof CreateInviteInput>

/** `inviteLink` is only present outside production (per the .bru test). */
export interface CreateInviteResponse {
  invite: Invite
  inviteLink?: string // prod: undefined — the backend emails it instead
}

export interface ListInvitesResponse {
  invites: Invite[]
}

/** Same envelope as register-organization, plus `user.orgId`. */
export interface AcceptInviteResponse {
  accessToken: string
  user: {
    id: string
    email: string
    name: string
    role: "admin" | "member"
    orgId: string // ← confirmed by accept-admin/accept-member assertions
    status: "active"
    twoFactorEnabled: boolean
  }
  organization: {
    id: string
    name: string
    slug: string
    status: "active"
  }
}

export const AcceptInviteInput = z.object({
  token: z.string().min(1),
  name: z.string().min(2),
  password: z.string().min(8), // server enforces policy; keep client in sync
})
export type AcceptInviteInput = z.infer<typeof AcceptInviteInput>
