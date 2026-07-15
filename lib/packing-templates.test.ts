import { describe, expect, it } from "vitest";

import { CATEGORY_ORDER } from "@/lib/packing";
import {
  BUILTIN_TEMPLATES,
  getBuiltinTemplate,
  isBuiltinTemplateId,
} from "@/lib/packing-templates";

describe("built-in packing templates", () => {
  it("all have builtin ids, unique names, and at least one item", () => {
    const ids = BUILTIN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of BUILTIN_TEMPLATES) {
      expect(isBuiltinTemplateId(template.id)).toBe(true);
      expect(template.builtin).toBe(true);
      expect(template.items.length).toBeGreaterThan(0);
    }
  });

  it("only use valid packing categories", () => {
    for (const template of BUILTIN_TEMPLATES) {
      for (const item of template.items) {
        expect(CATEGORY_ORDER).toContain(item.category);
      }
    }
  });

  it("resolves templates by id and rejects unknown ids", () => {
    expect(getBuiltinTemplate(BUILTIN_TEMPLATES[0].id)).toBe(
      BUILTIN_TEMPLATES[0],
    );
    expect(getBuiltinTemplate("builtin:nope")).toBeUndefined();
    expect(isBuiltinTemplateId("cmrlb9xyk000116glp1urnfko")).toBe(false);
  });
});
