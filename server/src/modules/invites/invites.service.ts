import type { FastifyInstance } from "fastify";
import { env } from "../../config/env";
import { Invite, type IInvite } from "../../models/invite.model";
import { Organization } from "../../models/organization.model";
import { User, type Role } from "../../models/user.model";
import { badRequest, conflict, forbidden, notFound } from "../../utils/errors";
import { hashPassword } from "../../utils/hash";
import { randomToken, sha256 } from "../../utils/tokens";
import { issueSession, type RequestMeta } from "../auth/auth.service";
import { decryptToken, encryptToken } from "../../utils/token-encryption";

export interface Actor {
  sub: string;
  orgId: string;
  role: Role;
}

export function toPublicInvite(
  i: Pick<IInvite, "_id" | "email" | "role" | "expiresAt" | "createdAt">,
) {

  return {
    id: i._id.toString(),
    email: i.email,
    role: i.role,
    expiresAt: i.expiresAt,
    createdAt: i.createdAt,
  };
}

export async function createInvite(
  actor: Actor,
  input: { email: string; role: "admin" | "member" },
) {
  if (actor.role === "admin" && input.role !== "member") {
    throw forbidden("Admins can only invite members");
  }

  if (await User.exists({ email: input.email })) {
    throw conflict("A user with this email already exists", "EMAIL_TAKEN");
  }

  await Invite.deleteMany({
    orgId: actor.orgId,
    email: input.email,
    acceptedAt: null,
  });

  const token = randomToken();

  const invite = await Invite.create({
    orgId: actor.orgId,
    email: input.email,
    role: input.role,
    tokenHash: sha256(token),
    encryptedToken: encryptToken(token),
    invitedBy: actor.sub,
    expiresAt: new Date(Date.now() + env.INVITE_TTL_HOURS * 60 * 60 * 1000),
  });

  const inviteLink = `${env.APP_URL}/accept-invite?token=${token}`;

  await sendInviteEmail(input.email, inviteLink);

  return {
    invite: toPublicInvite(invite),
    inviteLink,
  };
}

/**
 * TODO(prod): plug in your mail provider (SES, Resend, Postmark, ...).
 * Until then the link is logged in development and also returned by the API.
 */
async function sendInviteEmail(to: string, link: string): Promise<void> {
  if (env.NODE_ENV === "development") {
    console.log(`[invite] ${to} -> ${link}`);
  }
}

export async function listPendingInvites(orgId: string) {
  const invites = await Invite.find({
    orgId,
    acceptedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  return invites.map((invite) => {
    const token = decryptToken(invite.encryptedToken);

    return {
      ...toPublicInvite(invite),
      inviteLink: `${env.APP_URL}/accept-invite?token=${token}`,
    };
  });
}

export async function revokeInvite(
  orgId: string,
  inviteId: string,
): Promise<void> {
  const res = await Invite.deleteOne({
    _id: inviteId,
    orgId,
    acceptedAt: null,
  });
  if (res.deletedCount === 0) throw notFound("Invite not found");
}

export async function acceptInvite(
  app: FastifyInstance,
  input: { token: string; name: string; password: string },
  meta: RequestMeta,
) {
  // Atomically claim the invite so it can only ever be used once.
  const now = new Date();
  const invite = await Invite.findOneAndUpdate(
    {
      tokenHash: sha256(input.token),
      acceptedAt: null,
      expiresAt: { $gt: now },
    },
    { acceptedAt: now },
  );
  if (!invite)
    throw badRequest("Invite is invalid or has expired", "INVALID_INVITE");

  try {
    const org = await Organization.findById(invite.orgId)
      .select("status")
      .lean();
    if (org?.status !== "active")
      throw badRequest("Organization is not active", "ORG_INACTIVE");

    const user = await User.create({
      orgId: invite.orgId,
      email: invite.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      role: invite.role,
      status: "active",
      lastLoginAt: now,
    });

    const session = await issueSession(app, user, meta);
    return { user, session };
  } catch (err) {
    // Release the invite so the employee can retry (e.g. after a transient failure).
    await Invite.updateOne({ _id: invite._id }, { acceptedAt: null });
    throw err;
  }
}
