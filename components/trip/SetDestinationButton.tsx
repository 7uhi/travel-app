"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";

import { EditTripDialog } from "@/components/trip/EditTripDialog";

const TONES = {
  hero: "rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink shadow-sm transition-colors hover:bg-white/85",
  panel:
    "flex items-center gap-1.5 rounded-full bg-pine px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-dark",
} as const;

/**
 * The way out of "Destination TBD": opens the edit dialog focused on the
 * destination. Render it only for roles that may edit the trip details.
 */
export function SetDestinationButton({
  tripId,
  title,
  tone,
}: {
  tripId: string;
  title: string;
  tone: keyof typeof TONES;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={TONES[tone]}>
        {tone === "panel" && <MapPin size={14} aria-hidden />}
        Set destination
      </button>
      {open && (
        <EditTripDialog
          tripId={tripId}
          title={title}
          destination={null}
          settingDestination
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
