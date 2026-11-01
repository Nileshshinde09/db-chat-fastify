import { ValidationIssue } from "./auth/auth.types"

export type AuthErrorCode =
  | "EMAIL_TAKEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_INVITE"
  | "CONFLICT"
  | "UNKNOWN"

export class AuthApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: AuthErrorCode,
    message: string,
    public readonly issues?: ValidationIssue[]
  ) {
    super(message)
    this.name = "AuthApiError"
  }

  /** Form-friendly: `{ email: 'Email already taken', password: '...' }` */
  get fieldErrors(): Record<string, string> {
    if (!this.issues) return {}
    return this.issues.reduce<Record<string, string>>((acc, i) => {
      if (!acc[i.path]) acc[i.path] = i.message
      return acc
    }, {})
  }

  is(code: AuthErrorCode) {
    return this.code === code
  }
}
