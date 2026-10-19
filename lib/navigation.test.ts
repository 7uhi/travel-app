import { describe, expect, it } from "vitest";

import { safeLocalPath } from "@/lib/navigation";

describe("safeLocalPath", () => {
  it("keeps in-app paths with their query and hash", () => {
    expect(safeLocalPath("/trips/abc/preferences?tab=1#top", "/trips")).toBe(
      "/trips/abc/preferences?tab=1#top",
    );
  });

  it("rejects other origins however they're spelled", () => {
    for (const next of [
      "//evil.example",
      "/\\evil.example",
      "/\\/evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "https://evil.example",
      "evil.example",
      "",
    ]) {
      expect(safeLocalPath(next, "/trips")).toBe("/trips");
    }
  });

  it("falls back for missing or non-string values", () => {
    expect(safeLocalPath(undefined, "/trips")).toBe("/trips");
    expect(safeLocalPath(["/trips/x"], "/trips")).toBe("/trips");
  });
});
