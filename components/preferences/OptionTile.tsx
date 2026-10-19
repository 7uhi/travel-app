"use client";

import { useId } from "react";

/**
 * A large tappable answer tile in the preference deck. Sized for thumbs on a
 * phone, since the deck is the first thing a member sees after joining.
 *
 * A button carrying radio or checkbox semantics, so screen readers announce
 * "checked" and the group's position rather than a pressed toggle. Its name
 * is just the label; the description is announced as a description, so
 * moving through a group doesn't read every tile's full sentence first.
 */
export function OptionTile({
  role,
  emoji,
  label,
  description,
  checked,
  tabIndex,
  onFocus,
  onClick,
}: {
  role: "radio" | "checkbox";
  emoji: string;
  label: string;
  description?: string;
  checked: boolean;
  /** Set by a radio group's roving tabindex; checkboxes stay in Tab order. */
  tabIndex?: number;
  onFocus?: () => void;
  onClick: () => void;
}) {
  const labelId = useId();
  const descriptionId = useId();

  return (
    <button
      type="button"
      role={role}
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onClick={onClick}
      className={`flex w-full flex-col items-start gap-1 rounded-2xl border p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 focus-visible:ring-offset-cream ${
        checked
          ? "border-pine bg-pine-soft"
          : "border-stone-200 bg-white hover:border-pine/40"
      }`}
    >
      <span aria-hidden className="text-2xl">
        {emoji}
      </span>
      <span id={labelId} className="text-sm font-medium text-ink">
        {label}
      </span>
      {description && (
        <span
          id={descriptionId}
          className="text-xs leading-relaxed text-stone-600"
        >
          {description}
        </span>
      )}
    </button>
  );
}
