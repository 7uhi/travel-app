import type { PackingTemplateItem, PackingTemplateSummary } from "@/types";

/**
 * Built-in packing templates for common trip types. They ship in code rather
 * than the database so every trip gets them without seeding; ids carry the
 * `builtin:` prefix so actions can tell them apart from custom template cuids.
 */

const BUILTIN_PREFIX = "builtin:";

const T = (name: string, category: PackingTemplateItem["category"]) => ({
  name,
  category,
});

const BUILTIN_DEFINITIONS: { key: string; name: string; items: PackingTemplateItem[] }[] = [
  {
    key: "domestic-flight",
    name: "Domestic Trip by Flight",
    items: [
      T("Government ID", "DOCUMENTS"),
      T("Boarding pass", "DOCUMENTS"),
      T("Phone charger", "ELECTRONICS"),
      T("Headphones", "ELECTRONICS"),
      T("Portable battery", "ELECTRONICS"),
      T("Toiletries kit (TSA-size)", "TOILETRIES"),
      T("Change of clothes", "CLOTHING"),
      T("Comfortable shoes", "CLOTHING"),
      T("Snacks for the flight", "FOOD"),
      T("Empty water bottle", "OTHER"),
    ],
  },
  {
    key: "international-flight",
    name: "International Trip by Flight",
    items: [
      T("Passport", "DOCUMENTS"),
      T("Visa / entry documents", "DOCUMENTS"),
      T("Travel insurance details", "DOCUMENTS"),
      T("Copies of important documents", "DOCUMENTS"),
      T("Local currency / cards", "OTHER"),
      T("Travel power adapter", "ELECTRONICS"),
      T("Phone charger", "ELECTRONICS"),
      T("Medications", "TOILETRIES"),
      T("Toiletries kit (TSA-size)", "TOILETRIES"),
      T("Clothes for the climate", "CLOTHING"),
      T("Comfortable walking shoes", "CLOTHING"),
      T("Neck pillow", "OTHER"),
    ],
  },
  {
    key: "road-trip",
    name: "Road Trip",
    items: [
      T("Driver's license", "DOCUMENTS"),
      T("Car documents / insurance", "DOCUMENTS"),
      T("Car phone charger", "ELECTRONICS"),
      T("Phone mount", "ELECTRONICS"),
      T("Sunglasses", "OTHER"),
      T("Snacks", "FOOD"),
      T("Water bottles", "FOOD"),
      T("First-aid kit", "GEAR"),
      T("Roadside emergency kit", "GEAR"),
      T("Blanket", "GEAR"),
      T("Comfortable clothes", "CLOTHING"),
      T("Trash bags", "OTHER"),
    ],
  },
  {
    key: "camping",
    name: "Camping Trip",
    items: [
      T("Tent", "GEAR"),
      T("Sleeping bag", "GEAR"),
      T("Sleeping pad", "GEAR"),
      T("Headlamp / flashlight", "GEAR"),
      T("Camp stove & fuel", "GEAR"),
      T("Cookware & utensils", "GEAR"),
      T("Lighter / matches", "GEAR"),
      T("First-aid kit", "GEAR"),
      T("Multi-tool", "GEAR"),
      T("Bug spray", "TOILETRIES"),
      T("Sunscreen", "TOILETRIES"),
      T("Warm layers", "CLOTHING"),
      T("Rain jacket", "CLOTHING"),
      T("Hiking boots", "CLOTHING"),
      T("Food & snacks", "FOOD"),
      T("Water / filter", "FOOD"),
    ],
  },
];

export const BUILTIN_TEMPLATES: PackingTemplateSummary[] =
  BUILTIN_DEFINITIONS.map((t) => ({
    id: `${BUILTIN_PREFIX}${t.key}`,
    name: t.name,
    builtin: true,
    items: t.items,
  }));

export function isBuiltinTemplateId(id: string): boolean {
  return id.startsWith(BUILTIN_PREFIX);
}

export function getBuiltinTemplate(
  id: string,
): PackingTemplateSummary | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
