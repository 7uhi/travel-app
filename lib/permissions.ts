import type { TripRole } from "@/types";

/**
 * Who may record a repayment: either person involved — so a viewer can log
 * "I paid Alex back" — or an owner/editor keeping the group's books. Viewers
 * can't log repayments between other people.
 */
export function canRecordRepayment(
  role: TripRole,
  actorId: string,
  fromUserId: string,
  toUserId: string,
): boolean {
  return role !== "VIEWER" || actorId === fromUserId || actorId === toUserId;
}

/**
 * Who may remove a recorded repayment: whoever recorded it, either person
 * involved, or the trip owner.
 */
export function canRemoveRepayment(
  role: TripRole,
  actorId: string,
  repayment: { fromUserId: string; toUserId: string; createdById: string | null },
): boolean {
  return (
    role === "OWNER" ||
    actorId === repayment.createdById ||
    actorId === repayment.fromUserId ||
    actorId === repayment.toUserId
  );
}

/** Title and destination are part of planning, so editors may change them. */
export function canEditTripDetails(role: TripRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}

/** Who may create invite links: anyone who can plan the trip. */
export function canCreateInvite(role: TripRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}

/**
 * Who may revoke an invite link: the owner, or whoever created it — an editor
 * can take back a link they sent without being able to cancel the owner's.
 */
export function canRevokeInvite(
  role: TripRole,
  actorId: string,
  invite: { createdById: string },
): boolean {
  return role === "OWNER" || actorId === invite.createdById;
}

/**
 * Removing members, changing roles, and handing over ownership are the
 * owner's alone; there is exactly one owner per trip.
 */
export function canManageMembers(role: TripRole): boolean {
  return role === "OWNER";
}

/**
 * Anyone but the owner may leave. The owner hands ownership to someone else
 * first, so a trip is never left without one.
 */
export function canLeaveTrip(role: TripRole): boolean {
  return role !== "OWNER";
}
