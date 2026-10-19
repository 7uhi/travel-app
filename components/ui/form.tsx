/** Shared form building blocks so every dialog labels and reports errors the same way. */

export const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-pine focus-visible:ring-2 focus-visible:ring-pine/30";

export const primaryButtonClass =
  "rounded-full bg-pine px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-dark disabled:opacity-60";

export const secondaryButtonClass =
  "rounded-full px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:text-ink";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-600">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-stone-600">{hint}</span>}
    </label>
  );
}

/** An error that assistive technology announces as soon as it appears. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}
