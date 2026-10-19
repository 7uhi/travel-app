/**
 * Pure expense-splitting math. All amounts are integer hundredths of the
 * currency's major unit ("cents") — never floats — and every function
 * preserves the invariant that split amounts sum exactly to the total.
 * Deterministic: given the same input order, output is stable.
 *
 * Functions that produce amounts take the currency's unit in hundredths
 * (`currencyUnitCents`: 1 for USD, 100 for JPY) and only ever hand out whole
 * multiples of it, so a zero-decimal trip never holds an unpayable ¥333.33.
 */

export interface Share {
  userId: string;
  amountCents: number;
}

/**
 * Splits a total equally, giving the leftover units (at most n−1 of them) to
 * the earliest participants: $10.00 / 3 → 3.34, 3.33, 3.33, and with a unit
 * of 100, ¥1000 / 3 → 334, 333, 333.
 */
export function splitEqual(
  totalCents: number,
  userIds: string[],
  unitCents = 1,
): Share[] {
  assertWholeUnits(totalCents, unitCents);
  if (userIds.length === 0) {
    throw new Error("At least one participant is required.");
  }
  const units = totalCents / unitCents;
  const base = Math.floor(units / userIds.length);
  const remainder = units - base * userIds.length;
  return userIds.map((userId, i) => ({
    userId,
    amountCents: (base + (i < remainder ? 1 : 0)) * unitCents,
  }));
}

/**
 * Whether shares read as an equal split: they differ by at most the single
 * leftover unit splitEqual hands to the earliest participants. The split mode
 * isn't stored, so this is how an expense's mode is told apart afterwards.
 */
export function isEqualSplit(amountsCents: number[], unitCents = 1): boolean {
  if (amountsCents.length === 0) return false;
  return Math.max(...amountsCents) - Math.min(...amountsCents) <= unitCents;
}

/**
 * Whether a percentage total is close enough to 100 to accept (±0.01), so
 * typing 33.33 three times works. Compared in hundredths of a percent so
 * floating-point noise can't reject 100.01 or accept 100.02.
 */
export function percentsBalanced(percentTotal: number): boolean {
  return Math.abs(Math.round(percentTotal * 100) - 10_000) <= 1;
}

/**
 * Splits a total by percentages (must sum to 100 within ±0.01). Percentages
 * are weighted against their actual sum, so the ±0.01 tolerance for typing
 * 33.33 three times never creates or loses money. Shares are whole units,
 * apportioned by largest remainder (see apportion), so the result always
 * sums exactly to the total.
 */
export function splitByPercent(
  totalCents: number,
  shares: { userId: string; percent: number }[],
  unitCents = 1,
): Share[] {
  assertWholeUnits(totalCents, unitCents);
  if (shares.length === 0) {
    throw new Error("At least one participant is required.");
  }
  if (shares.some((s) => !Number.isFinite(s.percent) || s.percent <= 0)) {
    throw new Error("Each percentage must be greater than zero.");
  }
  const percentSum = shares.reduce((s, x) => s + x.percent, 0);
  if (!percentsBalanced(percentSum)) {
    throw new Error("Percentages must add up to 100.");
  }

  const units = apportion(
    totalCents / unitCents,
    shares.map((s) => s.percent),
  );
  return shares.map((s, i) => ({
    userId: s.userId,
    amountCents: units[i] * unitCents,
  }));
}

/**
 * Distributes an extra amount (e.g. tip + tax) across participants in
 * proportion to their weights (item subtotals), in whole units with the same
 * largest-remainder rounding as splitByPercent, so the result always sums
 * exactly to extraCents. A zero extra returns all-zero shares.
 */
export function prorate(
  extraCents: number,
  weights: { userId: string; weightCents: number }[],
  unitCents = 1,
): Share[] {
  if (
    !Number.isInteger(extraCents) ||
    extraCents < 0 ||
    extraCents % unitCents !== 0
  ) {
    throw new Error("Extra amount must be a non-negative whole amount.");
  }
  if (weights.length === 0) {
    throw new Error("At least one participant is required.");
  }
  if (weights.some((w) => !Number.isInteger(w.weightCents) || w.weightCents <= 0)) {
    throw new Error("Each weight must be a positive whole number of cents.");
  }

  const units = apportion(
    extraCents / unitCents,
    weights.map((w) => w.weightCents),
  );
  return weights.map((w, i) => ({
    userId: w.userId,
    amountCents: units[i] * unitCents,
  }));
}

/**
 * The final invariant every stored split must satisfy, whichever mode
 * produced it: one share per participant, whole non-negative units, summing
 * exactly to the expense total. Returns an error message, or null when valid.
 */
export function checkSharesTotal(
  totalCents: number,
  shares: Share[],
  unitCents = 1,
): string | null {
  if (shares.length === 0) return "At least one participant is required.";
  if (new Set(shares.map((s) => s.userId)).size !== shares.length) {
    return "Each participant can only appear once.";
  }
  if (
    shares.some(
      (s) =>
        !Number.isInteger(s.amountCents) ||
        s.amountCents < 0 ||
        s.amountCents % unitCents !== 0,
    )
  ) {
    return "Each share must be a whole, non-negative amount.";
  }
  const sum = shares.reduce((s, x) => s + x.amountCents, 0);
  return sum === totalCents ? null : "Shares don't add up to the expense total.";
}

/** Validates user-provided exact shares against the expense total. */
export function validateExactShares(
  totalCents: number,
  shares: Share[],
  unitCents = 1,
): string | null {
  if (shares.length === 0) return "At least one participant is required.";
  if (shares.some((s) => !Number.isInteger(s.amountCents) || s.amountCents <= 0)) {
    return "Each share must be a positive amount.";
  }
  if (shares.some((s) => s.amountCents % unitCents !== 0)) {
    return "Each share must be a whole number — this currency has no decimal places.";
  }
  const sum = shares.reduce((s, x) => s + x.amountCents, 0);
  if (sum !== totalCents) {
    const digits = Math.round(Math.log10(100 / unitCents));
    return `Shares add up to ${(sum / 100).toFixed(digits)} but the expense total is ${(totalCents / 100).toFixed(digits)}.`;
  }
  return null;
}

export interface BalanceInput {
  expenses: {
    paidById: string;
    amountCents: number;
    splits: Share[];
  }[];
  settlements: {
    fromUserId: string;
    toUserId: string;
    amountCents: number;
  }[];
}

/**
 * Net position per user in cents: positive = is owed money (creditor),
 * negative = owes money (debtor). Paying an expense credits you; owing a
 * split debits you; settling a debt (from → to) credits the payer and debits
 * the receiver. Sum of all balances is always zero.
 */
export function computeBalances(input: BalanceInput): Map<string, number> {
  const net = new Map<string, number>();
  const add = (userId: string, cents: number) =>
    net.set(userId, (net.get(userId) ?? 0) + cents);

  for (const expense of input.expenses) {
    add(expense.paidById, expense.amountCents);
    for (const split of expense.splits) add(split.userId, -split.amountCents);
  }
  for (const s of input.settlements) {
    add(s.fromUserId, s.amountCents);
    add(s.toUserId, -s.amountCents);
  }
  return net;
}

/**
 * Rounds net balances to whole currency units while keeping their zero sum:
 * each balance is floored to a unit, then the units flooring dropped go back
 * to the largest dropped remainders, ties broken by user id. Membership
 * plays no part, so someone leaving the trip can't shift anyone's rounding.
 *
 * This only changes anything on a zero-decimal trip holding shares from
 * before whole units were enforced — ¥1000 split three ways as ¥333.34 +
 * ¥333.33 + ¥333.33. Those fractions can't be paid, so balances, settle-up
 * suggestions, and the repayment cap all work from the rounded figures.
 * Adding or settling whole units never changes a remainder, so the rounding
 * holds still while the group settles up: paying a rounded suggestion
 * shrinks both rounded balances by exactly that amount.
 */
export function roundBalances(
  balances: Map<string, number>,
  unitCents: number,
): Map<string, number> {
  const entries = [...balances].map(([userId, cents]) => {
    const units = Math.floor(cents / unitCents);
    return { userId, units, remainder: cents - units * unitCents };
  });
  let leftover = Math.round(
    entries.reduce((s, e) => s + e.remainder, 0) / unitCents,
  );
  const order = [...entries].sort(
    (a, b) =>
      b.remainder - a.remainder || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  );
  for (const entry of order) {
    if (leftover <= 0) break;
    entry.units += 1;
    leftover -= 1;
  }
  return new Map(entries.map((e) => [e.userId, e.units * unitCents]));
}

/**
 * The largest repayment from one member to another that the current balances
 * support: what the payer owes overall, capped by what the recipient is owed
 * overall. Anything larger would flip a debtor into a creditor, which is what
 * recording the same suggested payment twice would otherwise do. Given
 * roundBalances output, the cap is a whole unit too.
 */
export function maxRepaymentCents(
  balances: Map<string, number>,
  fromUserId: string,
  toUserId: string,
): number {
  const owes = -(balances.get(fromUserId) ?? 0);
  const owed = balances.get(toUserId) ?? 0;
  return Math.max(0, Math.min(owes, owed));
}

export interface Payment {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

/**
 * Debt simplification: walk debtors and creditors in a fixed member order,
 * matching each debtor against creditors until their debt is exhausted.
 * Produces at most n−1 payments that zero every balance. Every payment is a
 * difference of balances, so whole-unit balances (see roundBalances) give
 * whole-unit payments.
 *
 * The fixed order (rather than largest-first) makes suggestions stable:
 * recording a suggested payment shrinks both sides by the same amount at the
 * same position in the walk, so every other pairing and amount is unchanged.
 * Sorting by amount instead would re-rank after each settlement and reshuffle
 * who pays whom mid-settling.
 *
 * `memberOrder` should be a stable ordering (e.g. trip join order). Balance
 * holders missing from it — such as ex-members with expense history — go
 * last, ordered by id.
 */
export function simplifyDebts(
  balances: Map<string, number>,
  memberOrder: string[] = [],
): Payment[] {
  const creditors: { userId: string; cents: number }[] = [];
  const debtors: { userId: string; cents: number }[] = [];
  for (const [userId, cents] of balances) {
    if (cents > 0) creditors.push({ userId, cents });
    else if (cents < 0) debtors.push({ userId, cents: -cents });
  }
  const byMemberOrder = compareByMemberOrder(memberOrder);
  creditors.sort((a, b) => byMemberOrder(a.userId, b.userId));
  debtors.sort((a, b) => byMemberOrder(a.userId, b.userId));

  const payments: Payment[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.cents, debtor.cents);
    payments.push({
      fromUserId: debtor.userId,
      toUserId: creditor.userId,
      amountCents: amount,
    });
    creditor.cents -= amount;
    debtor.cents -= amount;
    if (creditor.cents === 0) ci++;
    if (debtor.cents === 0) di++;
  }
  return payments;
}

/** Orders user ids by memberOrder; ids missing from it go last, by id. */
function compareByMemberOrder(
  memberOrder: string[],
): (a: string, b: string) => number {
  const rank = new Map(memberOrder.map((id, i) => [id, i]));
  const rankOf = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
  return (a, b) => rankOf(a) - rankOf(b) || (a < b ? -1 : 1);
}

/**
 * Hands out `totalUnits` whole units in proportion to `weights`: each share
 * is floored, then the units flooring dropped go to the largest fractional
 * remainders (ties to the earlier participant), so the result always sums
 * exactly to totalUnits.
 */
function apportion(totalUnits: number, weights: number[]): number[] {
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const raw = weights.map((w) => (totalUnits * w) / weightSum);
  const result = raw.map(Math.floor);
  let leftover = totalUnits - result.reduce((a, b) => a + b, 0);

  // Rank by fractional part, largest first; stable on index for ties.
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  for (const { index } of order) {
    if (leftover <= 0) break;
    result[index] += 1;
    leftover -= 1;
  }
  return result;
}

function assertWholeUnits(totalCents: number, unitCents: number): void {
  if (
    !Number.isInteger(totalCents) ||
    totalCents <= 0 ||
    totalCents % unitCents !== 0
  ) {
    throw new Error(
      unitCents === 1
        ? "Amount must be a positive whole number of cents."
        : "Amount must be a positive whole number in this currency.",
    );
  }
}
