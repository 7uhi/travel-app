/**
 * Pure expense-splitting math. All amounts are integer cents — never floats —
 * and every function preserves the invariant that split amounts sum exactly
 * to the total. Deterministic: given the same input order, output is stable.
 */

export interface Share {
  userId: string;
  amountCents: number;
}

/**
 * Splits a total equally, giving the leftover cents (at most n−1 of them) to
 * the earliest participants: 1000 / 3 → 334, 333, 333.
 */
export function splitEqual(totalCents: number, userIds: string[]): Share[] {
  assertPositiveIntCents(totalCents);
  if (userIds.length === 0) {
    throw new Error("At least one participant is required.");
  }
  const base = Math.floor(totalCents / userIds.length);
  const remainder = totalCents - base * userIds.length;
  return userIds.map((userId, i) => ({
    userId,
    amountCents: base + (i < remainder ? 1 : 0),
  }));
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
 * 33.33 three times never creates or loses money. Each share is floored to
 * whole cents, then leftover cents are distributed by largest fractional
 * remainder (ties go to the earlier participant), so the result always sums
 * exactly to the total.
 */
export function splitByPercent(
  totalCents: number,
  shares: { userId: string; percent: number }[],
): Share[] {
  assertPositiveIntCents(totalCents);
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

  const raw = shares.map((s) => (totalCents * s.percent) / percentSum);
  const floored = raw.map(Math.floor);
  let leftover = totalCents - floored.reduce((a, b) => a + b, 0);

  // Rank by fractional part, largest first; stable on index for ties.
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  const result = floored.slice();
  for (const { index } of order) {
    if (leftover <= 0) break;
    result[index] += 1;
    leftover -= 1;
  }

  return shares.map((s, i) => ({ userId: s.userId, amountCents: result[i] }));
}

/**
 * Distributes an extra amount (e.g. tip + tax) across participants in
 * proportion to their weights (item subtotals). Same largest-remainder
 * rounding as splitByPercent, so the result always sums exactly to
 * extraCents. A zero extra returns all-zero shares.
 */
export function prorate(
  extraCents: number,
  weights: { userId: string; weightCents: number }[],
): Share[] {
  if (!Number.isInteger(extraCents) || extraCents < 0) {
    throw new Error("Extra amount must be a non-negative whole number of cents.");
  }
  if (weights.length === 0) {
    throw new Error("At least one participant is required.");
  }
  if (weights.some((w) => !Number.isInteger(w.weightCents) || w.weightCents <= 0)) {
    throw new Error("Each weight must be a positive whole number of cents.");
  }

  const totalWeight = weights.reduce((s, w) => s + w.weightCents, 0);
  const raw = weights.map((w) => (extraCents * w.weightCents) / totalWeight);
  const floored = raw.map(Math.floor);
  let leftover = extraCents - floored.reduce((a, b) => a + b, 0);

  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  const result = floored.slice();
  for (const { index } of order) {
    if (leftover <= 0) break;
    result[index] += 1;
    leftover -= 1;
  }

  return weights.map((w, i) => ({ userId: w.userId, amountCents: result[i] }));
}

/**
 * The final invariant every stored split must satisfy, whichever mode
 * produced it: one share per participant, whole non-negative cents, summing
 * exactly to the expense total. Returns an error message, or null when valid.
 */
export function checkSharesTotal(
  totalCents: number,
  shares: Share[],
): string | null {
  if (shares.length === 0) return "At least one participant is required.";
  if (new Set(shares.map((s) => s.userId)).size !== shares.length) {
    return "Each participant can only appear once.";
  }
  if (shares.some((s) => !Number.isInteger(s.amountCents) || s.amountCents < 0)) {
    return "Each share must be a whole, non-negative amount.";
  }
  const sum = shares.reduce((s, x) => s + x.amountCents, 0);
  return sum === totalCents ? null : "Shares don't add up to the expense total.";
}

/** Validates user-provided exact shares against the expense total. */
export function validateExactShares(
  totalCents: number,
  shares: Share[],
): string | null {
  if (shares.length === 0) return "At least one participant is required.";
  if (shares.some((s) => !Number.isInteger(s.amountCents) || s.amountCents <= 0)) {
    return "Each share must be a positive amount.";
  }
  const sum = shares.reduce((s, x) => s + x.amountCents, 0);
  if (sum !== totalCents) {
    return `Shares add up to ${(sum / 100).toFixed(2)} but the expense total is ${(totalCents / 100).toFixed(2)}.`;
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
 * The largest repayment from one member to another that the current balances
 * support: what the payer owes overall, capped by what the recipient is owed
 * overall. Anything larger would flip a debtor into a creditor, which is what
 * recording the same suggested payment twice would otherwise do.
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
 * Produces at most n−1 payments that zero every balance.
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
  const rank = new Map(memberOrder.map((id, i) => [id, i]));
  const byMemberOrder = (
    a: { userId: string; cents: number },
    b: { userId: string; cents: number },
  ) => {
    const ra = rank.get(a.userId) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.userId) ?? Number.MAX_SAFE_INTEGER;
    return ra - rb || (a.userId < b.userId ? -1 : 1);
  };
  creditors.sort(byMemberOrder);
  debtors.sort(byMemberOrder);

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

function assertPositiveIntCents(totalCents: number): void {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error("Amount must be a positive whole number of cents.");
  }
}
