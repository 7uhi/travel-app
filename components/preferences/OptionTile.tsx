"use client";

/**
 * A large tappable answer tile in the preference deck. Sized for thumbs on a
 * phone, since the deck is the first thing a member sees after joining.
 */
export function OptionTile({
  emoji,
  label,
  description,
  selected,
  onClick,
}: {
  emoji: string;
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex w-full flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-colors ${
        selected
          ? "border-pine bg-pine-soft"
          : "border-stone-200 bg-white hover:border-pine/40"
      }`}
    >
      <span aria-hidden className="text-2xl">
        {emoji}
      </span>
      <span className="text-sm font-medium text-ink">{label}</span>
      {description && (
        <span className="text-xs leading-relaxed text-stone-500">
          {description}
        </span>
      )}
    </button>
  );
}
