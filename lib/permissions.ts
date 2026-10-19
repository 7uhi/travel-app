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
