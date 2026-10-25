import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addIdea } from "@/actions/activity-ideas";
import { suggestActivityIdeas } from "@/actions/ai-suggestions";
import { prisma } from "@/lib/prisma";

import { seedTripWithRoles } from "./factories";
import { actAs } from "./helpers";

beforeEach(() => {
  process.env.AI_SUGGESTIONS_ENABLED = "1";
});

afterEach(() => {
  delete process.env.AI_SUGGESTIONS_ENABLED;
});

describe("suggestActivityIdeas", () => {
  it("generates mock suggestions for any trip member, including viewers", async () => {
    const seed = await seedTripWithRoles();
    actAs(seed.viewer.id);

    const result = await suggestActivityIdeas(seed.trip.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.suggestions.length).toBeGreaterThan(0);
    }
    // Read-only: generation writes nothing.
    expect(await prisma.activityIdea.count()).toBe(0);
  });

  it("reports a missing trip exactly like one the caller can't see", async () => {
    const seed = await seedTripWithRoles();
    actAs(seed.outsider.id);

    expect(await suggestActivityIdeas(seed.trip.id)).toEqual({
      success: false,
      error: "Trip not found.",
    });
    expect(await suggestActivityIdeas("missing-trip")).toEqual({
      success: false,
      error: "Trip not found.",
    });
  });

  it("refuses cross-trip access", async () => {
    const first = await seedTripWithRoles();
    const second = await seedTripWithRoles();
    actAs(first.viewer.id);

    expect(await suggestActivityIdeas(second.trip.id)).toEqual({
      success: false,
      error: "Trip not found.",
    });
  });

  it("requires a session", async () => {
    const seed = await seedTripWithRoles();

    expect(await suggestActivityIdeas(seed.trip.id)).toEqual({
      success: false,
      error: "You must be signed in to view this trip.",
    });
  });

  it("is disabled unless explicitly enabled", async () => {
    const seed = await seedTripWithRoles();
    actAs(seed.owner.id);
    delete process.env.AI_SUGGESTIONS_ENABLED;

    expect(await suggestActivityIdeas(seed.trip.id)).toEqual({
      success: false,
      error: "AI suggestions are not enabled for this workspace.",
    });
  });

  it("applies a suggestion through the existing idea authorization", async () => {
    const seed = await seedTripWithRoles();
    actAs(seed.viewer.id);
    const generated = await suggestActivityIdeas(seed.trip.id);
    expect(generated.success).toBe(true);
    if (!generated.success) return;
    const [suggestion] = generated.data.suggestions;

    // Viewers can't add ideas — the suggestion path grants nothing extra.
    expect(
      await addIdea(seed.trip.id, {
        title: suggestion.title,
        description: suggestion.description,
      }),
    ).toEqual({
      success: false,
      error: "You don't have permission to edit this trip.",
    });
    expect(await prisma.activityIdea.count()).toBe(0);

    // Editors go through the normal validated path.
    actAs(seed.editor.id);
    const applied = await addIdea(seed.trip.id, {
      title: suggestion.title,
      description: suggestion.description,
    });
    expect(applied.success).toBe(true);
    expect(await prisma.activityIdea.count()).toBe(1);
  });
});
