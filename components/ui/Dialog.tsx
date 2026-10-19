"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

const WIDTHS = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
} as const;

/**
 * Modal dialog built on the native <dialog> element: showModal() makes the
 * rest of the page inert and traps focus, Escape and backdrop clicks call
 * onClose, and focus returns to whatever opened it. The panel scrolls inside
 * the viewport, so long forms stay reachable on short phone screens.
 *
 * Focus starts on an element marked data-autofocus, else the first form
 * field. onClose is the only way out: a parent that's mid-save can ignore it
 * to keep the dialog open.
 *
 * Tab and Shift+Tab are left to the browser: past the last control, focus
 * moves to the browser's own UI and then back into the dialog, never to the
 * inert page behind it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  size?: keyof typeof WIDTHS;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressStartedOnBackdrop = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;

    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const show = () => {
      dialog.showModal();
      // Two lookups, not one selector list: querySelector returns the first
      // match in document order, so a field above the marked one would win.
      (
        dialog.querySelector<HTMLElement>("[data-autofocus]") ??
        dialog.querySelector<HTMLElement>(
          "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])",
        )
      )?.focus();
    };
    show();

    /*
     * Chrome's close-watcher abuse guard makes a repeated Escape (with no
     * click or typing in between) close the modal without a cancelable
     * cancel event, so onCancel can't veto it. Any close we didn't start is
     * undone and routed through onClose instead, so a parent that's mid-save
     * still gets to keep the dialog open. The close event is queued, so one
     * that arrives after the dialog was shown again (Strict Mode's mount,
     * cleanup, mount) is stale and ignored.
     */
    const onNativeClose = () => {
      if (!dialog.isConnected || dialog.open) return;
      show();
      onCloseRef.current();
    };
    dialog.addEventListener("close", onNativeClose);

    return () => {
      dialog.removeEventListener("close", onNativeClose);
      dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        pressStartedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressStartedOnBackdrop.current && event.target === event.currentTarget) {
          onClose();
        }
        pressStartedOnBackdrop.current = false;
      }}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] ${WIDTHS[size]} overflow-y-auto overscroll-contain rounded-2xl bg-white p-0 text-ink shadow-xl backdrop:bg-ink/40`}
    >
      {open && (
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-2xl">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-1 text-sm text-stone-600">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1.5 shrink-0 rounded-full p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
