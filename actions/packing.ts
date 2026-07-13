"use server";

import { Prisma, type PackingItem as DbPackingItem } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { fail, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/session";
import type {
  PackingCategory,
  PackingItemInput,
  PackingItemWithAssignee,
} from "@/types";

export type { PackingItemInput };

/** Item names longer than this are almost certainly a paste mistake. */
const MAX_NAME_LENGTH = 80;

const CATEGORIES: readonly PackingCategory[] = [
  "GEAR",
  "CLOTHING",
  "TOILETRIES",
  "ELECTRONICS",
  "DOCUMENTS",
  "FOOD",
  "OTHER",
];

const ASSIGNEE_INCLUDE = {
  assignee: { select: { id: true, name: true, image: true } },
} as const;

/* ------------------------------------------------------------------ */
/* Actions                                                              */
/* ------------------------------------------------------------------ */

/** Lists a trip's packing items. Requires membership on the trip. */
export async function getPackingItems(
  tripId: string,
): Promise<ActionResult<PackingItemWithAssignee[]>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view this trip.");
  if (!tripId) return fail("Trip id is required.");

  try {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, members: { some: { userId } } },
      select: { id: true },
    });
    if (!trip) return fail("Trip not found.");

    const items = await prisma.packingItem.findMany({
      where: { tripId },
      include: ASSIGNEE_INCLUDE,
      orderBy: { createdAt: "asc" },
    });

    return { success: true, data: items.map(serializePackingItem) };
  } catch (error) {
    console.error("getPackingItems failed:", error);
    return fail("Failed to load the packing list. Please try again.");
  }
}

/**
 * Adds an item to a trip's packing list. Requires OWNER or EDITOR membership;
 * an optional assignee must themselves be a member of the trip.
 */
export async function addPackingItem(
  tripId: string,
  data: PackingItemInput,
): Promise<ActionResult<PackingItemWithAssignee>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit this trip.");
  if (!tripId) return fail("Trip id is required.");

  const name = data.name?.trim();
  if (!name) return fail("Item name is required.");
  if (name.length > MAX_NAME_LENGTH) {
    return fail(`Item name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }
  if (!CATEGORIES.includes(data.category)) {
    return fail("Invalid packing category.");
  }

  try {
    const gate = await tripEditGate(tripId, userId);
    if ("error" in gate) return fail(gate.error);

    const assigneeId = await resolveAssignee(data.assigneeId, tripId);
    if (assigneeId && "error" in assigneeId) return fail(assigneeId.error);

    const item = await prisma.packingItem.create({
      data: {
        tripId,
        name,
        category: data.category,
        assigneeId: assigneeId ? assigneeId.id : null,
      },
      include: ASSIGNEE_INCLUDE,
    });

    revalidatePath(`/trips/${tripId}/packing`);
    return { success: true, data: serializePackingItem(item) };
  } catch (error) {
    console.error("addPackingItem failed:", error);
    return fail("Failed to add the item. Please try again.");
  }
}

/** Reassigns (or clears) who's bringing an item. Requires OWNER or EDITOR. */
export async function updatePackingItem(
  itemId: string,
  data: { assigneeId: string | null },
): Promise<ActionResult<PackingItemWithAssignee>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit this trip.");
  if (!itemId) return fail("Item id is required.");

  try {
    const gate = await packingEditGate(itemId, userId);
    if ("error" in gate) return fail(gate.error);

    const assigneeId = await resolveAssignee(data.assigneeId, gate.tripId);
    if (assigneeId && "error" in assigneeId) return fail(assigneeId.error);

    const item = await prisma.packingItem.update({
      where: { id: itemId },
      data: { assigneeId: assigneeId ? assigneeId.id : null },
      include: ASSIGNEE_INCLUDE,
    });

    revalidatePath(`/trips/${gate.tripId}/packing`);
    return { success: true, data: serializePackingItem(item) };
  } catch (error) {
    console.error("updatePackingItem failed:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return fail("Packing item not found.");
    }
    return fail("Failed to update the item. Please try again.");
  }
}

/** Deletes a packing item. Requires OWNER or EDITOR membership on its trip. */
export async function deletePackingItem(
  itemId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit this trip.");
  if (!itemId) return fail("Item id is required.");

  try {
    const gate = await packingEditGate(itemId, userId);
    if ("error" in gate) return fail(gate.error);

    await prisma.packingItem.delete({ where: { id: itemId } });

    revalidatePath(`/trips/${gate.tripId}/packing`);
    return { success: true, data: { id: itemId } };
  } catch (error) {
    console.error("deletePackingItem failed:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return fail("Packing item not found.");
    }
    return fail("Failed to delete the item. Please try again.");
  }
}

/* ------------------------------------------------------------------ */
/* Helpers (module-private: "use server" files may only export          */
/* async functions and types)                                           */
/* ------------------------------------------------------------------ */

/** Checks the caller may edit a trip. Non-members and missing trips get the
 * same answer: no existence leaks. */
async function tripEditGate(
  tripId: string,
  userId: string,
): Promise<Record<string, never> | { error: string }> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { members: { where: { userId }, select: { role: true } } },
  });

  const membership = trip?.members[0];
  if (!trip || !membership) return { error: "Trip not found." };
  if (membership.role === "VIEWER") {
    return { error: "You don't have permission to edit this trip." };
  }
  return {};
}

/** Resolves a packing item to its trip and checks the caller may edit it. */
async function packingEditGate(
  itemId: string,
  userId: string,
): Promise<{ tripId: string } | { error: string }> {
  const item = await prisma.packingItem.findUnique({
    where: { id: itemId },
    select: {
      tripId: true,
      trip: {
        select: { members: { where: { userId }, select: { role: true } } },
      },
    },
  });

  const membership = item?.trip.members[0];
  if (!item || !membership) return { error: "Packing item not found." };
  if (membership.role === "VIEWER") {
    return { error: "You don't have permission to edit this trip." };
  }
  return { tripId: item.tripId };
}

/**
 * Validates an optional assignee is a member of the trip.
 * Returns `null` when unassigned, `{ id }` when valid, `{ error }` otherwise.
 */
async function resolveAssignee(
  assigneeId: string | null | undefined,
  tripId: string,
): Promise<{ id: string } | { error: string } | null> {
  if (!assigneeId) return null;
  const member = await prisma.tripMember.findUnique({
    where: { userId_tripId: { userId: assigneeId, tripId } },
    select: { id: true },
  });
  if (!member) return { error: "The assignee must be a member of this trip." };
  return { id: assigneeId };
}

/* Convert Prisma records (Date) into the JSON-safe shape from types/index.ts —
   server actions may only return serializable values. */

type DbPackingItemWithAssignee = DbPackingItem & {
  assignee: { id: string; name: string | null; image: string | null } | null;
};

function serializePackingItem(
  item: DbPackingItemWithAssignee,
): PackingItemWithAssignee {
  return {
    id: item.id,
    tripId: item.tripId,
    name: item.name,
    category: item.category,
    createdAt: item.createdAt.toISOString(),
    assigneeId: item.assigneeId,
    assignee: item.assignee
      ? {
          id: item.assignee.id,
          name: item.assignee.name,
          image: item.assignee.image,
        }
      : null,
  };
}
