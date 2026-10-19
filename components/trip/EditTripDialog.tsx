"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateTripDetails } from "@/actions/trip";
import { Dialog } from "@/components/ui/Dialog";
import {
  Field,
  FormError,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/form";

/**
 * Edits a trip's title and destination, including putting the destination
 * back to "not decided". Mounted only while open, so every opening starts
 * from the trip's current details. updateTripDetails enforces OWNER/EDITOR.
 *
 * `settingDestination` opens it as the "Set destination" step for an
 * undecided trip: the destination field comes first (so it takes focus) and
 * the known/undecided choice is skipped — cancelling keeps it undecided.
 */
export function EditTripDialog({
  tripId,
  title,
  destination,
  settingDestination = false,
  onClose,
}: {
  tripId: string;
  title: string;
  destination: string | null;
  settingDestination?: boolean;
  onClose: () => void;
}) {
  const [place, setPlace] = useState<"known" | "undecided">(
    destination !== null || settingDestination ? "known" : "undecided",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function close() {
    if (!pending) onClose();
  }

  const destinationField = (
    <Field label="Destination">
      <input
        name="destination"
        required
        maxLength={80}
        defaultValue={destination ?? ""}
        placeholder="Lisbon, Portugal"
        className={inputClass}
      />
    </Field>
  );

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await updateTripDetails(tripId, {
        title: String(formData.get("title") ?? ""),
        destination:
          place === "known" ? String(formData.get("destination") ?? "") : null,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog
      open
      onClose={close}
      title={settingDestination ? "Set the destination" : "Edit trip"}
      description={
        settingDestination
          ? "Once the group has agreed on a place, set it here. The trip deck then asks about plans there instead of where to go."
          : undefined
      }
    >
      <form action={submit} className="space-y-4">
        {settingDestination && destinationField}

        <Field label="Title">
          <input
            name="title"
            required
            maxLength={120}
            defaultValue={title}
            className={inputClass}
          />
        </Field>

        {!settingDestination && (
          <div
            role="radiogroup"
            aria-label="Do you know where you're going?"
            className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1"
          >
            <PlaceOption
              active={place === "known"}
              onClick={() => setPlace("known")}
            >
              I know where
            </PlaceOption>
            <PlaceOption
              active={place === "undecided"}
              onClick={() => setPlace("undecided")}
            >
              Not decided yet
            </PlaceOption>
          </div>
        )}

        {settingDestination ? null : place === "known" ? (
          destinationField
        ) : (
          <p className="text-sm text-stone-600">
            {destination === null
              ? "Members answer a few questions about where they're up for going, and the Preferences tab shows what the group agrees on."
              : "The destination will be cleared and new answers to the trip deck will ask where people are up for going."}
          </p>
        )}

        <FormError message={error} />

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={close} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function PlaceOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-white text-ink shadow-sm" : "text-stone-600 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
