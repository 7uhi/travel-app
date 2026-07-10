"use client";

import { useRef, useState } from "react";
import { Check, Share2 } from "lucide-react";

import { createInvite } from "@/actions/invite";

type ShareState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "copied" }
  | { kind: "error"; message: string };

/**
 * Creates a 7-day EDITOR invite link for the trip and copies it to the
 * clipboard. Rendered only for the trip OWNER (createInvite enforces this
 * server-side too).
 */
export function ShareTripButton({ tripId }: { tripId: string }) {
  const [state, setState] = useState<ShareState>({ kind: "idle" });
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function resetSoon() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState({ kind: "idle" }), 3000);
  }

  async function handleShare() {
    if (state.kind === "working") return;
    setState({ kind: "working" });

    const result = await createInvite(tripId, "EDITOR");
    if (!result.success) {
      setState({ kind: "error", message: result.error });
      resetSoon();
      return;
    }

    try {
      await navigator.clipboard.writeText(result.data.url);
      setState({ kind: "copied" });
    } catch {
      // Clipboard access denied — let the user copy manually instead.
      window.prompt("Copy the invite link:", result.data.url);
      setState({ kind: "idle" });
      return;
    }
    resetSoon();
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={state.kind === "working"}
      className="flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-white/25 disabled:opacity-60"
    >
      {state.kind === "copied" ? (
        <>
          <Check size={14} />
          Invite link copied!
        </>
      ) : state.kind === "error" ? (
        <span className="max-w-56 truncate">{state.message}</span>
      ) : (
        <>
          <Share2 size={14} />
          {state.kind === "working" ? "Creating link…" : "Share trip"}
        </>
      )}
    </button>
  );
}
