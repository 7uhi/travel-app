import { describe, expect, it } from "vitest";

import { groupByCategory } from "@/lib/packing";
import type { PackingCategory, PackingItemWithAssignee } from "@/types";

/** Minimal packing item for grouping tests. */
const item = (
  id: string,
  category: PackingCategory,
): PackingItemWithAssignee => ({
  id,
  tripId: "t1",
  name: id,
  category,
  createdAt: new Date().toISOString(),
  assigneeId: null,
  assignee: null,
});

describe("groupByCategory", () => {
  it("returns groups in CATEGORY_ORDER regardless of input order", () => {
    const groups = groupByCategory([
      item("a", "OTHER"),
      item("b", "GEAR"),
      item("c", "CLOTHING"),
    ]);
    expect(groups.map((g) => g.category)).toEqual([
      "GEAR",
      "CLOTHING",
      "OTHER",
    ]);
  });

  it("drops empty categories and keeps item order within a group", () => {
    const groups = groupByCategory([
      item("first", "GEAR"),
      item("second", "GEAR"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("GEAR");
    expect(groups[0].items.map((i) => i.id)).toEqual(["first", "second"]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
