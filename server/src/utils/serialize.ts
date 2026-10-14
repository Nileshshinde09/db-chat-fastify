import type { IUser } from '../models/user.model';
import type { IOrganization } from '../models/organization.model';

type UserLike = Pick<IUser, '_id' | 'orgId' | 'email' | 'name' | 'role' | 'status'> &
  Partial<Pick<IUser, 'lastLoginAt' | 'createdAt'>> & { twoFactor?: { enabled?: boolean } };

/** Explicit allow-list: passwordHash / 2FA secret can never leak through here. */
export function toPublicUser(u: UserLike) {
  return {
    id: u._id.toString(),
    orgId: u.orgId.toString(),
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    twoFactorEnabled: Boolean(u.twoFactor?.enabled),
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt ?? null,
  };
}

export function toPublicOrg(o: Pick<IOrganization, '_id' | 'name' | 'slug' | 'status'>) {
  return { id: o._id.toString(), name: o.name, slug: o.slug, status: o.status };
}
