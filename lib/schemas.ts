import { z } from "zod";

import type {
  ActivityIdeaInput,
  ActivityInput,
  ExpenseInput,
  PackingItemInput,
  PackingTemplateInput,
  TripInput,
} from "@/types";

/**
 * Shape checks for server action arguments. Server actions are public POST
 * endpoints, so their TypeScript parameter types are only a promise about
 * well-behaved clients; these schemas enforce the shape at runtime before any
 * business validation runs. They only check types and payload bounds — the
 * user-facing rules (required fields, length limits, ranges) stay in each
 * action, where they produce specific messages.
 *
 * Numbers accept NaN so a mistyped field reaches the action's own "must be a
 * number" message instead of a generic rejection.
 */

const text = z.string().max(10_000);
const id = z.string().min(1).max(200);
const numeric = z.union([z.number(), z.nan()]);

export const INVALID_INPUT = "That request wasn't in the expected format.";

export const idSchema = id;

/** An ISO 4217 code; actions check it against lib/currencies for a specific message. */
export const currencySchema = z.string().max(3);

export const tripInputSchema: z.ZodType<TripInput> = z.object({
  title: text,
  destination: text.optional(),
  startDate: text.optional(),
  endDate: text.optional(),
  windowStart: text.optional(),
  windowEnd: text.optional(),
  durationDays: numeric.optional(),
  currency: currencySchema.optional(),
  totalBudget: numeric.nullish(),
});

export const activityInputSchema: z.ZodType<Omit<ActivityInput, "tripDayId">> =
  z.object({
    title: text,
    description: text.nullish(),
    time: text.nullish(),
    locationName: text.nullish(),
    latitude: numeric.nullish(),
    longitude: numeric.nullish(),
    cost: numeric.nullish(),
  });

const splitSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("EQUAL"), participantIds: z.array(id).max(500) }),
  z.object({
    mode: z.literal("EXACT"),
    shares: z.array(z.object({ userId: id, amountCents: numeric })).max(500),
  }),
  z.object({
    mode: z.literal("PERCENT"),
    shares: z.array(z.object({ userId: id, percent: numeric })).max(500),
  }),
]);

export const expenseInputSchema: z.ZodType<ExpenseInput> = z.object({
  description: text,
  amountCents: numeric,
  category: z.string() as z.ZodType<ExpenseInput["category"]>,
  date: text,
  paidById: id.optional(),
  split: splitSchema,
});

export const repaymentInputSchema = z.object({
  fromUserId: id,
  toUserId: id,
  amountCents: numeric,
});

export const packingItemInputSchema: z.ZodType<PackingItemInput> = z.object({
  name: text,
  category: z.string() as z.ZodType<PackingItemInput["category"]>,
  assigneeId: id.nullish(),
  personal: z.boolean().optional(),
});

export const packingItemUpdateSchema = z.object({
  name: text.optional(),
  category: (z.string() as z.ZodType<PackingItemInput["category"]>).optional(),
  assigneeId: id.nullable().optional(),
});

export const packingTemplateInputSchema: z.ZodType<PackingTemplateInput> =
  z.object({
    name: text,
    items: z
      .array(
        z.object({
          name: text,
          category: z.string() as z.ZodType<PackingItemInput["category"]>,
        }),
      )
      .max(1_000),
  });

export const activityIdeaInputSchema: z.ZodType<ActivityIdeaInput> = z.object({
  title: text,
  description: text.nullish(),
  locationName: text.nullish(),
  link: text.nullish(),
  estimatedCost: numeric.nullish(),
});

export const promoteIdeaInputSchema = z.object({
  title: text,
  time: text.nullish(),
});

export const availabilityDatesSchema = z.array(text).max(400);

/** Parses an action argument against its schema; null when it doesn't fit. */
export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}
