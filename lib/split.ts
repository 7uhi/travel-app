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
 * Splits a total by percentages (must sum to 100 within ±0.01). Each share is
 * floored to whole cents, then leftover cents are distributed by largest
 * fractional remainder (ties go to the earlier participant), so the result
 * always sums exactly to the total.
 */
export function splitByPercent(
  totalCents: number,
  shares: { userId: string; percent: number }[],
): Share[] {
  assertPositiveIntCents(totalCents);
  if (shares.length === 0) {
    throw new Error("At least one participant is required.");
  }
  const percentSum = shares.reduce((s, x) => s + x.percent, 0);
  if (Math.abs(percentSum - 100) > 0.01) {
    throw new Error("Percentages must add up to 100.");
  }
  if (shares.some((s) => s.percent <= 0)) {
    throw new Error("Each percentage must be greater than zero.");
  }

  const raw = shares.map((s) => (totalCents * s.percent) / 100);
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

export interface Payment {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

/**
 * Greedy debt simplification: repeatedly match the largest debtor with the
 * largest creditor and settle the smaller of the two amounts. Produces at
 * most n−1 payments that zero every balance. (Provably minimal transaction
 * count is NP-hard; this is the standard Splitwise-style approach.)
 */
export function simplifyDebts(balances: Map<string, number>): Payment[] {
  const creditors: { userId: string; cents: number }[] = [];
  const debtors: { userId: string; cents: number }[] = [];
  for (const [userId, cents] of balances) {
    if (cents > 0) creditors.push({ userId, cents });
    else if (cents < 0) debtors.push({ userId, cents: -cents });
  }
  // Deterministic order: amount desc, then userId asc for ties.
  const byAmount = (
    a: { userId: string; cents: number },
    b: { userId: string; cents: number },
  ) => b.cents - a.cents || (a.userId < b.userId ? -1 : 1);
  creditors.sort(byAmount);
  debtors.sort(byAmount);

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
