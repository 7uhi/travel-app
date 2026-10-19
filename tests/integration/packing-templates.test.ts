import { describe, expect, it } from "vitest";

import { importPackingTemplate, updatePackingTemplate } from "@/actions/packing-templates";
import { BUILTIN_TEMPLATES } from "@/lib/packing-templates";
import { prisma } from "@/lib/prisma";

import { seedPackingTemplate, seedTripWithRoles } from "./factories";
import { actAs } from "./helpers";

const list = (...names: string[]) => names.map((name) => ({ name, category: "OTHER" as const }));

describe("updatePackingTemplate", () => {
  it("leaves exactly one submitted list when two saves race", async () => {
    const { trip, editor } = await seedTripWithRoles();
    const template = await seedPackingTemplate(trip.id, ["Towel"]);
    actAs(editor.id);
    const first = ["Hat", "Sunscreen"];
    const second = ["Adapter", "Charger", "Passport"];

    const results = await Promise.all([
      updatePackingTemplate(template.id, { name: "Beach bag", items: list(...first) }),
      updatePackingTemplate(template.id, { name: "Beach bag", items: list(...second) }),
    ]);

    expect(results.every((r) => r.success)).toBe(true);
    const items = await prisma.packingTemplateItem.findMany({
      where: { templateId: template.id },
      orderBy: { name: "asc" },
    });
    expect([first, second]).toContainEqual(items.map((i) => i.name));
  });

  it("refuses viewers", async () => {
    const { trip, viewer } = await seedTripWithRoles();
    const template = await seedPackingTemplate(trip.id, ["Towel"]);
    actAs(viewer.id);

    expect(await updatePackingTemplate(template.id, { name: "Mine", items: list("Hat") })).toEqual({
      success: false,
      error: "You don't have permission to edit this trip.",
    });
  });
});

describe("importPackingTemplate", () => {
  it("imports each item once even when the import is submitted twice at once", async () => {
    const { trip, viewer } = await seedTripWithRoles();
    const builtin = BUILTIN_TEMPLATES[0];
    actAs(viewer.id);

    const results = await Promise.all([
      importPackingTemplate(trip.id, builtin.id),
      importPackingTemplate(trip.id, builtin.id),
    ]);

    expect(results.every((r) => r.success)).toBe(true);
    const names = new Set(builtin.items.map((i) => i.name.toLowerCase()));
    expect(await prisma.packingItem.count({ where: { tripId: trip.id, ownerId: viewer.id } })).toBe(
      names.size,
    );
  });
});
