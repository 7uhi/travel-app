import { describe, expect, it } from "vitest";

import {
  canCreateInvite,
  canEditTripDetails,
  canLeaveTrip,
  canManageMembers,
  canRevokeInvite,
} from "./permissions";

describe("trip lifecycle permissions", () => {
  it("lets owners and editors edit details and create invites", () => {
    for (const check of [canEditTripDetails, canCreateInvite]) {
      expect(check("OWNER")).toBe(true);
      expect(check("EDITOR")).toBe(true);
      expect(check("VIEWER")).toBe(false);
    }
  });

  it("keeps member management with the owner", () => {
    expect(canManageMembers("OWNER")).toBe(true);
    expect(canManageMembers("EDITOR")).toBe(false);
    expect(canManageMembers("VIEWER")).toBe(false);
  });

  it("lets everyone but the owner leave", () => {
    expect(canLeaveTrip("OWNER")).toBe(false);
    expect(canLeaveTrip("EDITOR")).toBe(true);
    expect(canLeaveTrip("VIEWER")).toBe(true);
  });

  it("lets the owner or the link's creator revoke an invite", () => {
    const invite = { createdById: "ed" };
    expect(canRevokeInvite("OWNER", "owner", invite)).toBe(true);
    expect(canRevokeInvite("EDITOR", "ed", invite)).toBe(true);
    expect(canRevokeInvite("EDITOR", "other-editor", invite)).toBe(false);
    expect(canRevokeInvite("VIEWER", "ed", invite)).toBe(true);
    expect(canRevokeInvite("VIEWER", "viewer", invite)).toBe(false);
  });
});
