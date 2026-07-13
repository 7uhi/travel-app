import type { PackingCategory, PackingItemWithAssignee } from "@/types";

/** Display order and labels for packing categories. */
export const CATEGORY_ORDER: readonly PackingCategory[] = [
  "GEAR",
  "CLOTHING",
  "TOILETRIES",
  "ELECTRONICS",
  "DOCUMENTS",
  "FOOD",
  "OTHER",
];

export const CATEGORY_LABELS: Record<PackingCategory, string> = {
  GEAR: "Gear",
  CLOTHING: "Clothing",
  TOILETRIES: "Toiletries",
  ELECTRONICS: "Electronics",
  DOCUMENTS: "Documents",
  FOOD: "Food & snacks",
  OTHER: "Other",
};

export interface CategoryGroup {
  category: PackingCategory;
  label: string;
  items: PackingItemWithAssignee[];
}

/**
 * Groups items by category in CATEGORY_ORDER, dropping empty categories.
 * Items keep their incoming order within a group (the query sorts them).
 */
export function groupByCategory(
  items: PackingItemWithAssignee[],
): CategoryGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);
}
