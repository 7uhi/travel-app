"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Eye,
  EyeOff,
  LogOut,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";

import { setTripArchived } from "@/actions/trip";
import { DeleteTripDialog } from "@/components/trip/DeleteTripDialog";
import { EditTripDialog } from "@/components/trip/EditTripDialog";
import { LeaveTripDialog } from "@/components/trip/LeaveTripDialog";
import { MembersDialog } from "@/components/trip/MembersDialog";
import { RescheduleTripDialog } from "@/components/trip/RescheduleTripDialog";
import {
  canEditTripDetails,
  canLeaveTrip,
  canManageMembers,
} from "@/lib/permissions";
import type { TripHeaderData } from "@/types";

type DialogKind = "edit" | "dates" | "members" | "leave" | "delete";

/**
 * The hero's "…" menu: everything you can do to the trip itself, filtered to
 * what the viewer's role allows (each action re-checks on the server). A
 * plain disclosure rather than an ARIA menu — a short list of buttons that
 * closes on Escape, on outside clicks, and once an item is chosen.
 */
export function TripActionsMenu({ trip }: { trip: TripHeaderData }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(kind: DialogKind) {
    setOpen(false);
    setDialog(kind);
  }

  function toggleArchived() {
    setOpen(false);
    setArchiveError(null);
    startTransition(async () => {
      const result = await setTripArchived(trip.id, trip.archivedAt === null);
      if (!result.success) {
        setArchiveError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const scheduled = trip.startDate !== null && trip.endDate !== null;
  const closeDialog = () => setDialog(null);

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          setArchiveError(null);
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Trip options"
        disabled={pending}
        className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/25 bg-white/15 backdrop-blur transition-colors hover:bg-white/25 disabled:opacity-60"
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-full z-20 mt-2 w-60 rounded-xl bg-white py-1.5 text-ink shadow-xl ring-1 ring-stone-200"
        >
          {canEditTripDetails(trip.role) && (
            <MenuItem icon={Pencil} onClick={() => choose("edit")}>
              Edit trip
            </MenuItem>
          )}
          {scheduled && canManageMembers(trip.role) && (
            <MenuItem icon={CalendarClock} onClick={() => choose("dates")}>
              Change dates
            </MenuItem>
          )}
          <MenuItem icon={Users} onClick={() => choose("members")}>
            {canManageMembers(trip.role) ? "Manage members" : "Members"}
          </MenuItem>
          <div className="my-1.5 border-t border-stone-100" />
          <MenuItem
            icon={trip.archivedAt ? Eye : EyeOff}
            onClick={toggleArchived}
          >
            {trip.archivedAt ? "Show in my trips" : "Hide from my trips"}
          </MenuItem>
          {canLeaveTrip(trip.role) && (
            <MenuItem icon={LogOut} danger onClick={() => choose("leave")}>
              Leave trip
            </MenuItem>
          )}
          {trip.role === "OWNER" && (
            <MenuItem icon={Trash2} danger onClick={() => choose("delete")}>
              Delete trip
            </MenuItem>
          )}
        </div>
      )}

      {archiveError && (
        <p
          role="alert"
          className="absolute right-0 top-full z-20 mt-2 w-60 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 shadow"
        >
          {archiveError}
        </p>
      )}

      {dialog === "edit" && (
        <EditTripDialog
          tripId={trip.id}
          title={trip.title}
          destination={trip.destination}
          onClose={closeDialog}
        />
      )}
      {dialog === "dates" && scheduled && (
        <RescheduleTripDialog
          tripId={trip.id}
          startDate={trip.startDate!}
          endDate={trip.endDate!}
          onClose={closeDialog}
        />
      )}
      {dialog === "members" && (
        <MembersDialog tripId={trip.id} onClose={closeDialog} />
      )}
      {dialog === "leave" && (
        <LeaveTripDialog tripId={trip.id} title={trip.title} onClose={closeDialog} />
      )}
      {dialog === "delete" && (
        <DeleteTripDialog tripId={trip.id} title={trip.title} onClose={closeDialog} />
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  danger = false,
  onClick,
  children,
}: {
  icon: LucideIcon;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-stone-100 focus-visible:bg-stone-100 focus-visible:outline-none ${
        danger ? "text-red-700" : "text-ink"
      }`}
    >
      <Icon size={15} aria-hidden className={danger ? "" : "text-stone-500"} />
      {children}
    </button>
  );
}
