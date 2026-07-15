"use server";

import { revalidatePath } from "next/cache";

import { fail, type ActionResult } from "@/lib/action-result";
import {
  BUILTIN_TEMPLATES,
  getBuiltinTemplate,
  isBuiltinTemplateId,
} from "@/lib/packing-templates";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/session";
import type {
  PackingCategory,
  PackingTemplateInput,
  PackingTemplateSummary,
  TemplateImportResult,
} from "@/types";

/** Item and template names longer than this are almost certainly a paste mistake. */
const MAX_NAME_LENGTH = 80;
/** Enough for any real packing list; guards against runaway payloads. */
const MAX_TEMPLATE_ITEMS = 100;

const CATEGORIES: readonly PackingCategory[] = [
  "GEAR",
  "CLOTHING",
  "TOILETRIES",
  "ELECTRONICS",
  "DOCUMENTS",
  "FOOD",
  "OTHER",
];

/* ------------------------------------------------------------------ */
/* Actions                                                              */
/* ------------------------------------------------------------------ */

/**
 * Lists the templates available on a trip: the built-ins plus any custom
 * ones members have created. Requires membership on the trip.
 */
export async function getPackingTemplates(
  tripId: string,
): Promise<ActionResult<PackingTemplateSummary[]>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to view this trip.");
  if (!tripId) return fail("Trip id is required.");

  try {
    const gate = await tripMemberGate(tripId, userId);
    if ("error" in gate) return fail(gate.error);

    const custom = await prisma.packingTemplate.findMany({
      where: { tripId },
      include: { items: { select: { name: true, category: true } } },
      orderBy: { createdAt: "asc" },
    });

    return {
      success: true,
      data: [
        ...BUILTIN_TEMPLATES,
        ...custom.map((t) => ({
          id: t.id,
          name: t.name,
          builtin: false,
          items: t.items,
        })),
      ],
    };
  } catch (error) {
    console.error("getPackingTemplates failed:", error);
    return fail("Failed to load packing templates. Please try again.");
  }
}

/**
 * Creates a custom template on a trip, usable by every member. Requires
 * OWNER or EDITOR membership.
 */
export async function createPackingTemplate(
  tripId: string,
  data: PackingTemplateInput,
): Promise<ActionResult<PackingTemplateSummary>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit this trip.");
  if (!tripId) return fail("Trip id is required.");

  const input = validateTemplateInput(data);
  if ("error" in input) return fail(input.error);

  try {
    const gate = await tripEditGate(tripId, userId);
    if ("error" in gate) return fail(gate.error);

    const template = await prisma.packingTemplate.create({
      data: { tripId, name: input.name, items: { create: input.items } },
      include: { items: { select: { name: true, category: true } } },
    });

    revalidatePath(`/trips/${tripId}/packing`);
    return {
      success: true,
      data: {
        id: template.id,
        name: template.name,
        builtin: false,
        items: template.items,
      },
    };
  } catch (error) {
    console.error("createPackingTemplate failed:", error);
    return fail("Failed to create the template. Please try again.");
  }
}

/**
 * Replaces a custom template's name and items. Requires OWNER or EDITOR
 * membership; built-in templates can't be edited (copy them to a custom
 * template instead).
 */
export async function updatePackingTemplate(
  templateId: string,
  data: PackingTemplateInput,
): Promise<ActionResult<PackingTemplateSummary>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit this trip.");
  if (!templateId) return fail("Template id is required.");
  if (isBuiltinTemplateId(templateId)) {
    return fail("Built-in templates can't be edited.");
  }

  const input = validateTemplateInput(data);
  if ("error" in input) return fail(input.error);

  try {
    const existing = await prisma.packingTemplate.findUnique({
      where: { id: templateId },
      select: {
        tripId: true,
        trip: {
          select: { members: { where: { userId }, select: { role: true } } },
        },
      },
    });
    const membership = existing?.trip.members[0];
    if (!existing || !membership) return fail("Template not found.");
    if (membership.role === "VIEWER") {
      return fail("You don't have permission to edit this trip.");
    }

    // Items are replaced wholesale — the dialog always submits the full list.
    const template = await prisma.$transaction(async (tx) => {
      await tx.packingTemplateItem.deleteMany({ where: { templateId } });
      return tx.packingTemplate.update({
        where: { id: templateId },
        data: { name: input.name, items: { create: input.items } },
        include: { items: { select: { name: true, category: true } } },
      });
    });

    revalidatePath(`/trips/${existing.tripId}/packing`);
    return {
      success: true,
      data: {
        id: template.id,
        name: template.name,
        builtin: false,
        items: template.items,
      },
    };
  } catch (error) {
    console.error("updatePackingTemplate failed:", error);
    return fail("Failed to update the template. Please try again.");
  }
}

/** Deletes a custom template. Requires OWNER or EDITOR membership; built-in
 * templates can't be deleted. */
export async function deletePackingTemplate(
  templateId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit this trip.");
  if (!templateId) return fail("Template id is required.");
  if (isBuiltinTemplateId(templateId)) {
    return fail("Built-in templates can't be deleted.");
  }

  try {
    const template = await prisma.packingTemplate.findUnique({
      where: { id: templateId },
      select: {
        tripId: true,
        trip: {
          select: { members: { where: { userId }, select: { role: true } } },
        },
      },
    });
    const membership = template?.trip.members[0];
    if (!template || !membership) return fail("Template not found.");
    if (membership.role === "VIEWER") {
      return fail("You don't have permission to edit this trip.");
    }

    await prisma.packingTemplate.delete({ where: { id: templateId } });

    revalidatePath(`/trips/${template.tripId}/packing`);
    return { success: true, data: { id: templateId } };
  } catch (error) {
    console.error("deletePackingTemplate failed:", error);
    return fail("Failed to delete the template. Please try again.");
  }
}

/**
 * Copies a template's items into the caller's personal checklist for a trip.
 * Any member may import; items whose name (case-insensitive) is already on
 * their personal list are skipped so re-importing doesn't duplicate.
 */
export async function importPackingTemplate(
  tripId: string,
  templateId: string,
): Promise<ActionResult<TemplateImportResult>> {
  const userId = await currentUserId();
  if (!userId) return fail("You must be signed in to edit this trip.");
  if (!tripId) return fail("Trip id is required.");
  if (!templateId) return fail("Template id is required.");

  try {
    const gate = await tripMemberGate(tripId, userId);
    if ("error" in gate) return fail(gate.error);

    let items: { name: string; category: PackingCategory }[];
    if (isBuiltinTemplateId(templateId)) {
      const builtin = getBuiltinTemplate(templateId);
      if (!builtin) return fail("Template not found.");
      items = builtin.items;
    } else {
      const template = await prisma.packingTemplate.findFirst({
        where: { id: templateId, tripId },
        select: { items: { select: { name: true, category: true } } },
      });
      if (!template) return fail("Template not found.");
      items = template.items;
    }

    const existing = await prisma.packingItem.findMany({
      where: { tripId, ownerId: userId },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((i) => i.name.toLowerCase()));
    const fresh = items.filter((i) => !existingNames.has(i.name.toLowerCase()));

    if (fresh.length > 0) {
      await prisma.packingItem.createMany({
        data: fresh.map((i) => ({
          tripId,
          ownerId: userId,
          name: i.name,
          category: i.category,
        })),
      });
    }

    revalidatePath(`/trips/${tripId}/packing`);
    return {
      success: true,
      data: { imported: fresh.length, skipped: items.length - fresh.length },
    };
  } catch (error) {
    console.error("importPackingTemplate failed:", error);
    return fail("Failed to import the template. Please try again.");
  }
}

/* ------------------------------------------------------------------ */
/* Helpers (module-private: "use server" files may only export          */
/* async functions and types)                                           */
/* ------------------------------------------------------------------ */

/** Trims, drops blank rows, and bounds-checks a template payload. */
function validateTemplateInput(
  data: PackingTemplateInput,
):
  | { name: string; items: { name: string; category: PackingCategory }[] }
  | { error: string } {
  const name = data.name?.trim();
  if (!name) return { error: "Template name is required." };
  if (name.length > MAX_NAME_LENGTH) {
    return {
      error: `Template name must be ${MAX_NAME_LENGTH} characters or fewer.`,
    };
  }
  const items = (data.items ?? [])
    .map((i) => ({ name: i.name?.trim() ?? "", category: i.category }))
    .filter((i) => i.name.length > 0);
  if (items.length === 0) {
    return { error: "A template needs at least one item." };
  }
  if (items.length > MAX_TEMPLATE_ITEMS) {
    return { error: `A template can hold at most ${MAX_TEMPLATE_ITEMS} items.` };
  }
  for (const item of items) {
    if (item.name.length > MAX_NAME_LENGTH) {
      return {
        error: `Item names must be ${MAX_NAME_LENGTH} characters or fewer.`,
      };
    }
    if (!CATEGORIES.includes(item.category)) {
      return { error: "Invalid packing category." };
    }
  }
  return { name, items };
}

/** Checks the caller is a member of a trip, any role. */
async function tripMemberGate(
  tripId: string,
  userId: string,
): Promise<Record<string, never> | { error: string }> {
  const member = await prisma.tripMember.findUnique({
    where: { userId_tripId: { userId, tripId } },
    select: { id: true },
  });
  if (!member) return { error: "Trip not found." };
  return {};
}

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
