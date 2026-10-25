import { afterEach, describe, expect, it, vi } from "vitest";

import { logSuggestionFailure } from "@/lib/ai/log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logSuggestionFailure", () => {
  it("logs only static, allowlisted metadata", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSuggestionFailure();
    expect(spy).toHaveBeenCalledWith("suggestActivityIdeas failed", {
      code: "generation_failed",
    });
  });

  it("never includes private content from an error body", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "severe peanut allergy, token abc123, member note";
    // Even when a caller is tempted to pass the error, the helper takes no
    // error argument — this assertion pins that contract.
    logSuggestionFailure();
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain("peanut");
    expect(logged).not.toContain("abc123");
    expect(logged).not.toContain(secret);
  });
});
