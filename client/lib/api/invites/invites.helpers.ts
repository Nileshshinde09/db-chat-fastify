// src/lib/api/invites.helpers.ts

/** Extract `?token=` from the inviteLink the backend returns in non-prod. */
export function extractInviteToken(inviteLink: string | undefined): string | null {
  if (!inviteLink) return null;
  const m = /[?&]token=([^&]+)/.exec(inviteLink);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * The API enforces these rules (403 / 400 in the pack). Mirror them in the UI
 * so the user never hits a round-trip to discover what they can't do.
 */
export function canInviteRole(
  currentRole: 'owner' | 'admin' | 'member',
  targetRole: 'admin' | 'member',
): boolean {
  if (currentRole === 'member') return false;               // member-cannot-invite → 403
  if (currentRole === 'admin') return targetRole === 'member'; // admin-cannot-invite-admin → 403
  return true;                                              // owner: both
}

export function canManageInvites(role: 'owner' | 'admin' | 'member'): boolean {
  return role !== 'member'; // member-cannot-list-invites → 403
}