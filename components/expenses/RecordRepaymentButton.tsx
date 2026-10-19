"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { recordSettlement } from "@/actions/expense";
import { Dialog } from "@/components/ui/Dialog";
import {
  Field,
  FormError,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";
import {
  amountInputProps,
  amountInputValue,
  currencyUnitCents,
  isWholeUnit,
  parseAmountInput,
} from "@/lib/currencies";
import { formatCents } from "@/lib/format";
import { canRecordRepayment } from "@/lib/permissions";
import type { SuggestedPayment, TripRole } from "@/types";

/**
 * Opens a review step before recording a repayment: who paid whom, and how
 * much. Started from a suggested payment it's prefilled with that pair and
 * amount (editable for partial repayments); started bare it lets the member
 * pick any pair. Nothing is recorded until the member confirms.
 */
export function RecordRepaymentButton({
  tripId,
  currency,
  members,
  currentUserId,
  role,
  suggestion,
}: {
  tripId: string;
  currency: string;
  members: { id: string; name: string }[];
  currentUserId: string;
  role: TripRole;
  suggestion?: SuggestedPayment;
}) {
  const [open, setOpen] = useState(false);
  const [fromUserId, setFromUserId] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.name ?? "Someone";

  function openDialog() {
    setFromUserId(suggestion?.fromUserId ?? currentUserId);
    setToUserId(
      suggestion?.toUserId ??
        members.find((m) => m.id !== currentUserId)?.id ??
        "",
    );
    setAmount(suggestion ? amountInputValue(suggestion.amountCents, currency) : "");
    setError(null);
    setOpen(true);
  }

  function close() {
    if (!pending) setOpen(false);
  }

  const amountCents = parseAmountInput(amount);
  const wholeUnits = isWholeUnit(amountCents, currency);
  const samePerson = fromUserId === toUserId;
  const allowed = canRecordRepayment(role, currentUserId, fromUserId, toUserId);
  const ready = amountCents > 0 && wholeUnits && !samePerson && allowed;

  function submit() {
    startTransition(async () => {
      const result = await recordSettlement(tripId, {
        fromUserId,
        toUserId,
        amountCents,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {suggestion ? (
        <button
          type="button"
          onClick={openDialog}
          aria-label={`Record a repayment from ${nameOf(suggestion.fromUserId)} to ${nameOf(suggestion.toUserId)}`}
          className="rounded-full bg-pine-soft px-3 py-1.5 text-xs font-medium text-pine transition-colors hover:bg-pine hover:text-white"
        >
          Record
        </button>
      ) : (
        <button
          type="button"
          onClick={openDialog}
          className="text-sm font-medium text-pine transition-colors hover:text-pine-dark"
        >
          Record a repayment
        </button>
      )}

      <Dialog
        open={open}
        onClose={close}
        title="Record a repayment"
        description="Log money one member already paid another outside Roam — cash, a bank transfer, a payment app. This doesn't send any money."
      >
        <form action={submit} className="space-y-4">
          {suggestion ? (
            <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm">
              <span className="font-medium">{nameOf(fromUserId)}</span> paid{" "}
              <span className="font-medium">{nameOf(toUserId)}</span>
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Who paid">
                <select
                  value={fromUserId}
                  onChange={(e) => setFromUserId(e.target.value)}
                  className={inputClass}
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Who received it">
                <select
                  value={toUserId}
                  onChange={(e) => setToUserId(e.target.value)}
                  className={inputClass}
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          <Field
            label={`Amount (${currency})`}
            hint={
              suggestion
                ? `Suggested to settle up: ${formatCents(suggestion.amountCents, currency)}. Enter less for a partial repayment.`
                : "Can't be more than the payer currently owes the recipient."
            }
          >
            <input
              {...amountInputProps(currency)}
              min={currencyUnitCents(currency) / 100}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
              data-autofocus
            />
          </Field>

          {!wholeUnits && (
            <p className="text-sm text-red-700">
              {currency} has no decimal places — enter a whole number.
            </p>
          )}
          {samePerson && (
            <p className="text-sm text-stone-600">
              Pick two different people.
            </p>
          )}
          {!samePerson && !allowed && (
            <p className="text-sm text-stone-600">
              Viewers can only record repayments they made or received.
            </p>
          )}
          <FormError message={error} />

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={close} className={secondaryButtonClass}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !ready}
              className={primaryButtonClass}
            >
              {pending
                ? "Recording…"
                : `Record ${amountCents > 0 ? formatCents(amountCents, currency) : "repayment"}`}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
