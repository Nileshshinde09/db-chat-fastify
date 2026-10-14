import { User, type Role, type UserStatus } from '../../models/user.model';
import { badRequest, forbidden, notFound } from '../../utils/errors';
import { revokeAllUserTokens } from '../auth/auth.service';

interface Actor {
  sub: string;
  orgId: string;
  role: Role;
}

/** Every lookup is scoped by orgId, so users from other tenants are simply "not found". */
async function findTarget(actor: Actor, targetId: string) {
  const target = await User.findOne({ _id: targetId, orgId: actor.orgId });
  if (!target) throw notFound('User not found');
  if (target.role === 'owner') throw forbidden('The organization owner cannot be modified');
  if (target._id.toString() === actor.sub) throw badRequest('You cannot modify your own account here');
  return target;
}

export function listUsers(orgId: string) {
  return User.find({ orgId }).sort({ createdAt: 1 });
}

export async function updateRole(actor: Actor, targetId: string, role: 'admin' | 'member') {
  const target = await findTarget(actor, targetId); // route restricts this to owners
  target.role = role;
  await target.save();
  return target;
}

export async function updateStatus(actor: Actor, targetId: string, status: UserStatus) {
  const target = await findTarget(actor, targetId);
  if (actor.role === 'admin' && target.role !== 'member') {
    throw forbidden('Admins can only manage members');
  }
  target.status = status;
  await target.save();
  if (status === 'disabled') await revokeAllUserTokens(target._id);
  return target;
}
