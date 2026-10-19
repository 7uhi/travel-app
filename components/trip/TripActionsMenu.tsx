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
 * takes focus when it opens, and closes on Escape (handing focus back to the
 * trigger), on outside clicks, when focus tabs out of it, and once an item is
 * chosen.
 */
export function TripActionsMenu({ trip }: { trip: TripHeaderData }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveStatus, setArchiveStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("button")?.focus();
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

  /*
   * The chosen item unmounts with the panel, which would drop focus to the
   * page body. Parking it on the trigger first gives the dialog an opener to
   * hand focus back to when it closes.
   */
  function choose(kind: DialogKind) {
    setOpen(false);
    trigger.current?.focus();
    setDialog(kind);
  }

  function toggleArchived() {
    const hiding = trip.archivedAt === null;
    setOpen(false);
    trigger.current?.focus();
    setArchiveError(null);
    setArchiveStatus("");
    startTransition(async () => {
      const result = await setTripArchived(trip.id, hiding);
      if (!result.success) {
        setArchiveError(result.error);
        return;
      }
      setArchiveStatus(hiding ? "Hidden from your trips." : "Back in your trips.");
      router.refresh();
    });
  }

  const scheduled = trip.startDate !== null && trip.endDate !== null;
  const closeDialog = () => setDialog(null);

  return (
    <div
      ref={wrapper}
      className="relative"
      onBlur={(event) => {
        // relatedTarget is null when the window itself loses focus; only a
        // move to another element on the page should close the menu.
        const next = event.relatedTarget;
        if (open && next && !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      {/* aria-disabled rather than disabled while hiding the trip: a disabled
          button drops focus, and focus was just parked here. */}
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          if (pending) return;
          setArchiveError(null);
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Trip options"
        aria-disabled={pending || undefined}
        className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/30 bg-black/35 backdrop-blur transition-colors hover:bg-black/45 aria-disabled:opacity-60"
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>

      {open && (
        <div
          ref={panel}
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

      <p role="status" className="sr-only">
        {archiveStatus}
      </p>
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
