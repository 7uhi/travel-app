"use client";

import { useState } from "react";
import { Users } from "lucide-react";

import { MembersDialog } from "@/components/trip/MembersDialog";
import type { TripHeaderData } from "@/types";

/** The hero's member count, which opens the member list. */
export function MembersButton({ trip }: { trip: TripHeaderData }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 underline-offset-4 transition-colors hover:text-white hover:underline"
      >
        <Users size={15} className="text-white/70" aria-hidden />
        {trip.memberCount} {trip.memberCount === 1 ? "member" : "members"}
      </button>
      {open && <MembersDialog tripId={trip.id} onClose={() => setOpen(false)} />}
    </>
  );
}
