import type { FastifyInstance } from 'fastify';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { env } from '../../config/env';
import { Organization } from '../../models/organization.model';
import { RefreshToken } from '../../models/refresh-token.model';
import { User, type IUser } from '../../models/user.model';
import { AppError, forbidden, notFound, unauthorized } from '../../utils/errors';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../utils/hash';
import { uniqueOrgSlug } from '../../utils/slug';
import { randomToken, sha256 } from '../../utils/tokens';
import type { LoginInput, RegisterOrgInput } from './auth.schemas';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function verifyTotp(secret: string, token: string): boolean {
  // epochTolerance: 30 accepts the previous/next 30s window to absorb clock drift.
  return verifySync({ secret, token, strategy: 'totp', epochTolerance: 30 }).valid;
}

/** Creates an access JWT plus a new, hashed-at-rest refresh token. */
export async function issueSession(
  app: FastifyInstance,
  user: Pick<IUser, '_id' | 'orgId' | 'role'>,
  meta: RequestMeta,
): Promise<Session> {
  const accessToken = app.jwt.sign({
    sub: user._id.toString(),
    orgId: user.orgId.toString(),
    role: user.role,
  });

  const refreshToken = randomToken();
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);

  await RefreshToken.create({
    userId: user._id,
    tokenHash: sha256(refreshToken),
    expiresAt: refreshExpiresAt,
    userAgent: meta.userAgent,
    ip: meta.ip,
  });

  return { accessToken, refreshToken, refreshExpiresAt };
}

export async function revokeAllUserTokens(userId: IUser['_id']): Promise<void> {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
}

/**
 * Creates the organization and its first user (role "owner").
 * Done without a Mongo transaction so it also works on a standalone local
 * MongoDB; on failure the partially created documents are cleaned up.
 */
export async function registerOrganization(
  app: FastifyInstance,
  input: RegisterOrgInput,
  meta: RequestMeta,
) {
  if (await User.exists({ email: input.email })) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }

  const organization = await Organization.create({
    name: input.organizationName,
    slug: await uniqueOrgSlug(input.organizationName),
  });

  try {
    const user = await User.create({
      orgId: organization._id,
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      role: 'owner',
      status: 'active',
      lastLoginAt: new Date(),
    });

    organization.ownerId = user._id;
    await organization.save();

    const session = await issueSession(app, user, meta);
    return { organization, user, session };
  } catch (err) {
    await User.deleteMany({ orgId: organization._id });
    await Organization.deleteOne({ _id: organization._id });
    throw err;
  }
}

export async function login(app: FastifyInstance, input: LoginInput, meta: RequestMeta) {
  const user = await User.findOne({ email: input.email }).select(
    '+passwordHash +twoFactor.secret',
  );

  // Same error and similar timing whether the email exists or not.
  let passwordOk = false;
  if (user) {
    passwordOk = await verifyPassword(user.passwordHash, input.password);
  } else {
    await burnPasswordCheck(input.password);
  }

  const org = user ? await Organization.findById(user.orgId).select('status').lean() : null;

  if (!user || !passwordOk || user.status !== 'active' || org?.status !== 'active') {
    throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // Two-factor: only enforced when the global flag is on AND the user enrolled.
  if (env.TWO_FACTOR_ENABLED && user.twoFactor.enabled) {
    if (!input.otp) throw unauthorized('One-time code required', 'OTP_REQUIRED');
    if (!user.twoFactor.secret || !verifyTotp(user.twoFactor.secret, input.otp)) {
      throw unauthorized('Invalid one-time code', 'INVALID_OTP');
    }
  }

  user.lastLoginAt = new Date();
  await user.save();

  const session = await issueSession(app, user, meta);
  return { user, session };
}

/**
 * Rotates a refresh token. The revoke step is a single atomic update, so two
 * concurrent requests can't both succeed with the same token. Presenting an
 * already-revoked token is treated as theft: every session of that user is revoked.
 */
export async function refreshSession(app: FastifyInstance, rawToken: string, meta: RequestMeta) {
  const tokenHash = sha256(rawToken);
  const now = new Date();

  const stored = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { revokedAt: now },
  );

  if (!stored) {
    const reused = await RefreshToken.findOne({ tokenHash, revokedAt: { $ne: null } });
    if (reused) {
      await revokeAllUserTokens(reused.userId);
      throw unauthorized('Refresh token reuse detected, please log in again', 'TOKEN_REUSED');
    }
    throw unauthorized('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }

  const user = await User.findById(stored.userId);
  if (!user || user.status !== 'active') {
    throw unauthorized('Account is not active');
  }

  const session = await issueSession(app, user, meta);
  return { user, session };
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await RefreshToken.updateOne({ tokenHash: sha256(rawToken), revokedAt: null }, { revokedAt: new Date() });
}

export async function getMe(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw notFound('User not found');
  const organization = await Organization.findById(user.orgId);
  if (!organization) throw notFound('Organization not found');
  return { user, organization };
}

/* ----------------------------- Two-factor (TOTP) ----------------------------- */

function assertTwoFactorAvailable(): void {
  if (!env.TWO_FACTOR_ENABLED) {
    throw forbidden('Two-factor authentication is disabled in this environment', 'TWO_FACTOR_DISABLED');
  }
}

/** Step 1: generate a secret. 2FA stays off until the user confirms a valid code. */
export async function setupTwoFactor(userId: string) {
  assertTwoFactorAvailable();
  const user = await User.findById(userId);
  if (!user) throw notFound('User not found');

  const secret = generateSecret();
  await User.updateOne({ _id: user._id }, { 'twoFactor.secret': secret, 'twoFactor.enabled': false });

  return {
    secret,
    otpauthUrl: generateURI({ issuer: 'DatabaseChat', label: user.email, secret }),
  };
}

/** Step 2: prove the authenticator app works, then switch 2FA on. */
export async function confirmTwoFactor(userId: string, otp: string): Promise<void> {
  assertTwoFactorAvailable();
  const user = await User.findById(userId).select('+twoFactor.secret');
  if (!user?.twoFactor.secret) {
    throw new AppError(400, 'TWO_FACTOR_NOT_STARTED', 'Call /2fa/setup first');
  }
  if (!verifyTotp(user.twoFactor.secret, otp)) {
    throw unauthorized('Invalid one-time code', 'INVALID_OTP');
  }
  await User.updateOne({ _id: user._id }, { 'twoFactor.enabled': true });
}
