import { formatCents } from "@/lib/format";
import type { TripAmountExample } from "@/types";

/**
 * Currencies a trip can be denominated in. A curated ISO 4217 subset keeps
 * the picker manageable and doubles as server-side validation — every code
 * here is understood by Intl.NumberFormat, so formatting never throws.
 */
export const CURRENCIES = [
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "AUD", label: "Australian Dollar" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "CHF", label: "Swiss Franc" },
  { code: "CNY", label: "Chinese Yuan" },
  { code: "KRW", label: "South Korean Won" },
  { code: "INR", label: "Indian Rupee" },
  { code: "SGD", label: "Singapore Dollar" },
  { code: "HKD", label: "Hong Kong Dollar" },
  { code: "NZD", label: "New Zealand Dollar" },
  { code: "SEK", label: "Swedish Krona" },
  { code: "NOK", label: "Norwegian Krone" },
  { code: "DKK", label: "Danish Krone" },
  { code: "PLN", label: "Polish Złoty" },
  { code: "CZK", label: "Czech Koruna" },
  { code: "MXN", label: "Mexican Peso" },
  { code: "BRL", label: "Brazilian Real" },
  { code: "THB", label: "Thai Baht" },
  { code: "VND", label: "Vietnamese Dong" },
  { code: "AED", label: "UAE Dirham" },
  { code: "ZAR", label: "South African Rand" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return CURRENCIES.some((c) => c.code === code);
}

/**
 * The smallest amount a currency can hold, in the hundredths every amount is
 * stored in (`amountCents`): 1 for cent currencies like USD, 100 for
 * zero-decimal ones like JPY, where ¥1 is stored as 100. Storage stays in
 * hundredths for every currency so existing rows never need rewriting; this
 * unit is what keeps a ¥1000 bill from splitting into unpayable ¥333.33s.
 *
 * Derived from Intl so it always agrees with how amounts are displayed.
 * Three-decimal currencies (KWD, BHD) can't be represented in hundredths at
 * all, so they throw instead of silently losing a digit — none are listed.
 */
export function currencyUnitCents(currency: string): number {
  const digits =
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  if (digits > 2) {
    throw new Error(
      `${currency} has ${digits} decimal places, which amounts stored in hundredths can't represent.`,
    );
  }
  return 10 ** (2 - digits);
}

/** Currencies with no minor unit (JPY, KRW, VND): amounts are whole numbers. */
export function isZeroDecimal(currency: string): boolean {
  return currencyUnitCents(currency) === 100;
}

/** Whether an amount in hundredths is a whole number of the currency's unit. */
export function isWholeUnit(cents: number, currency: string): boolean {
  return Number.isInteger(cents) && cents % currencyUnitCents(currency) === 0;
}

/** "The amount must be a whole number in JPY, which has no decimal places." */
export function wholeUnitsMessage(subject: string, currency: string): string {
  return `${subject} must be a whole number in ${currency}, which has no decimal places.`;
}

/**
 * Attributes for a money <input>: whole numbers and a digits-only keypad for
 * zero-decimal currencies, cents for the rest.
 */
export function amountInputProps(currency: string) {
  const unit = currencyUnitCents(currency);
  return {
    type: "number",
    step: String(unit / 100),
    inputMode: unit === 1 ? "decimal" : "numeric",
  } as const;
}

/** Amount input text → integer hundredths; empty or unparseable reads as 0. */
export function parseAmountInput(raw: string): number {
  return Math.round((Number.parseFloat(raw) || 0) * 100);
}

/**
 * Integer hundredths → text for prefilling an amount input: "45.00" in USD,
 * "4500" in JPY. An amount that isn't a whole unit keeps its cents, so an
 * edit form never rounds a stored value away without the user seeing it.
 */
export function amountInputValue(cents: number, currency: string): string {
  const digits = isWholeUnit(cents, currency)
    ? Math.round(Math.log10(100 / currencyUnitCents(currency)))
    : 2;
  return (cents / 100).toFixed(digits);
}

/** The amounts a trip stores, as summarizeTripAmounts reads them. */
export interface TripAmountsInput {
  /** Major units, as on Trip.totalBudget. */
  totalBudget: number | null;
  /** Newest first, so the example is an expense people recognize. */
  expenses: {
    description: string;
    amountCents: number;
    splits: { amountCents: number }[];
  }[];
  settlementCents: number[];
  /** Planned itinerary costs, in major units. */
  activityCosts: { title: string; cost: number | null }[];
}

/**
 * What a currency change would touch, for both the server check and the
 * confirmation that explains it:
 *
 * - `example`: a real amount from the trip, or null when it holds none — then
 *   the currency can change without relabeling anything.
 * - `fractional`: the first expense, share, repayment, or budget amount with
 *   cents. A zero-decimal currency can't hold it, so switching to one is
 *   refused until it's edited. Planned activity costs are estimates rather
 *   than ledger amounts, so they only count toward `example`.
 */
export function summarizeTripAmounts(trip: TripAmountsInput): {
  example: TripAmountExample | null;
  fractional: TripAmountExample | null;
} {
  const budgetCents = trip.totalBudget ? Math.round(trip.totalBudget * 100) : 0;
  const budget = budgetCents > 0 ? { label: "the trip budget", cents: budgetCents } : null;
  const expenses = trip.expenses.map((e) => ({
    label: `“${e.description}”`,
    cents: e.amountCents,
  }));
  const shares = trip.expenses.flatMap((e) =>
    e.splits.map((s) => ({
      label: `a share of “${e.description}”`,
      cents: s.amountCents,
    })),
  );
  const repayments = trip.settlementCents.map((cents) => ({
    label: "a recorded repayment",
    cents,
  }));
  const planned = trip.activityCosts.flatMap((a) =>
    a.cost && a.cost > 0
      ? [{ label: `the planned cost of “${a.title}”`, cents: Math.round(a.cost * 100) }]
      : [],
  );

  const ledger = [...(budget ? [budget] : []), ...expenses, ...shares, ...repayments];
  return {
    example: expenses[0] ?? budget ?? repayments[0] ?? planned[0] ?? null,
    fractional: ledger.find((a) => a.cents % 100 !== 0) ?? null,
  };
}

/** Why a trip holding `fractional` can't switch to a zero-decimal currency. */
export function zeroDecimalRefusal(
  target: string,
  current: string,
  fractional: TripAmountExample,
): string {
  return `${target} has no decimal places, but ${fractional.label} is ${formatCents(fractional.cents, current)}. Change amounts with cents to whole numbers before switching to ${target}.`;
}
