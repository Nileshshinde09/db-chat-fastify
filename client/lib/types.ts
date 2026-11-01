export type Role = "owner" | "admin" | "member"
export type UserStatus = "active" | "disabled"

export type User = {
  id: string
  orgId: string
  email: string
  name: string
  role: Role
  status: UserStatus
  twoFactorEnabled: boolean
  lastLoginAt: string | null
  createdAt: string | null
}
export type Organization = {
  id: string
  name: string
  slug: string
  status: "active" | "suspended"
}
export type Invite = {
  id: string
  email: string
  role: "admin" | "member"
  expiresAt: string
  createdAt: string
}

export const demoUser: User = {
  id: "u_1",
  orgId: "org_1",
  email: "alex@northstar.io",
  name: "Alex Morgan",
  role: "owner",
  status: "active",
  twoFactorEnabled: false,
  lastLoginAt: new Date().toISOString(),
  createdAt: "2025-01-12T09:00:00Z",
}
export const demoOrganization: Organization = {
  id: "org_1",
  name: "Northstar Labs",
  slug: "northstar-labs",
  status: "active",
}
export const demoUsers: User[] = [
  // demoUser,
  // {
  //   id: "u_2",
  //   orgId: "org_1",
  //   email: "jamie@northstar.io",
  //   name: "Jamie Chen",
  //   role: "admin",
  //   status: "active",
  //   twoFactorEnabled: true,
  //   lastLoginAt: "2026-10-13T15:30:00Z",
  //   createdAt: "2025-03-21T09:00:00Z",
  // },
  // {
  //   id: "u_3",
  //   orgId: "org_1",
  //   email: "morgan@northstar.io",
  //   name: "Morgan Lee",
  //   role: "member",
  //   status: "disabled",
  //   twoFactorEnabled: false,
  //   lastLoginAt: null,
  //   createdAt: "2026-08-02T12:00:00Z",
  // },
]
export const demoInvites: Invite[] = [
  {
    id: "i_1",
    email: "taylor@northstar.io",
    role: "member",
    expiresAt: "2026-10-20T12:00:00Z",
    createdAt: "2026-10-12T12:00:00Z",
  },
  {
    id: "i_2",
    email: "riley@northstar.io",
    role: "admin",
    expiresAt: "2026-10-22T12:00:00Z",
    createdAt: "2026-10-14T09:30:00Z",
  },
]

export function getSession() {
  return { user: demoUser, organization: demoOrganization }
}
export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}
export function relativeTime(date: string | null) {
  if (!date) return "Never"
  const diff = new Date(date).getTime() - Date.now()
  const minutes = Math.round(diff / 60000)
  if (Math.abs(minutes) < 60)
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
      minutes,
      "minute"
    )
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24)
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
      hours,
      "hour"
    )
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
    Math.round(hours / 24),
    "day"
  )
}
export function roleLabel(role: Role) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}
export function canManageTeam(role: Role) {
  return role === "owner" || role === "admin"
}
export function canChangeRoles(role: Role) {
  return role === "owner"
}
export function canManageUser(actor: User, target: User) {
  return (
    actor.id !== target.id &&
    target.role !== "owner" &&
    (actor.role === "owner" ||
      (actor.role === "admin" && target.role === "member"))
  )
}
export function invitableRoles(role: Role): Array<"admin" | "member"> {
  return role === "owner" ? ["admin", "member"] : ["member"]
}

export type ErrorBody = {
  statusCode: number
  code: string
  message: string
  issues?: { path: string; message: string }[]
}
export class ApiError extends Error {
  statusCode: number
  code: string
  issues?: ErrorBody["issues"]
  constructor(body: ErrorBody) {
    super(body.message)
    this.statusCode = body.statusCode
    this.code = body.code
    this.issues = body.issues
  }
}
export const api = {
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`/api/v1/auth${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...options.headers },
    })
    if (!response.ok) {
      let body: ErrorBody = {
        statusCode: response.status,
        code: "UNKNOWN",
        message: "Something went wrong",
      }
      try {
        body = await response.json()
      } catch {}
      throw new ApiError(body)
    }
    return response.status === 204 ? (undefined as T) : response.json()
  },
}
export const permissions = {
  canManageTeam,
  canChangeRoles,
  canManageUser,
  invitableRoles,
}
export const schemas = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  password: /^.{8,128}$/,
  otp: /^\d{6}$/,
}
export const format = { initials, relativeTime }
