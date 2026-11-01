export type UserRole = 'owner' | 'admin' | 'member';
export type UserStatus = 'active' | 'invited' | 'suspended';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  twoFactorEnabled: boolean;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'deleted';
}

export interface RegisterOrganizationInput {
  organizationName: string;
  name: string;
  email: string;
  password: string;
}

export interface RegisterOrganizationResponse {
  accessToken: string;
  user: AuthUser;
  organization: Organization;
}

/** Shape returned by the API in every 4xx body (confirmed by the .bru pack). */
export interface ValidationIssue {
  path: string;    // e.g. 'email', 'password', 'organizationName', 'name'
  message: string; // human-readable, safe to show next to the field
}

export type AuthErrorCode = 'EMAIL_TAKEN'| 'VALIDATION_ERROR'|'INVALID_INVITE'| 'NOT_FOUND'| 'FORBIDDEN'| 'CONFLICT';