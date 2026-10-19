"use client";

import { useId } from "react";

/**
 * Mutually exclusive choices drawn as a row of segments, built from native
 * radio buttons so the browser supplies the keyboard model and semantics: the
 * group is one Tab stop, arrow keys move the selection, and the fieldset's
 * legend names the group. Each radio is stretched over its whole segment, so
 * the tap target is the segment rather than a hidden dot.
 *
 * The legend is visually hidden unless `showLegend` is set; a group whose
 * purpose is obvious from its options still needs a name for screen readers.
 */
export function SegmentedControl<T extends string>({
  legend,
  showLegend = false,
  options,
  value,
  onChange,
  size = "md",
  className = "",
}: {
  legend: string;
  showLegend?: boolean;
  options: readonly (readonly [value: T, label: string])[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  /** Spacing outside the control, e.g. a top margin. */
  className?: string;
}) {
  const name = useId();

  return (
    <fieldset className={`min-w-0 ${className}`}>
      <legend
        className={
          showLegend
            ? "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-600"
            : "sr-only"
        }
      >
        {legend}
      </legend>
      <div className="flex gap-1 rounded-xl bg-stone-100 p-1">
        {options.map(([option, label]) => (
          <label
            key={option}
            className={`relative flex flex-1 items-center justify-center rounded-lg py-1.5 text-center font-medium text-stone-600 transition-colors hover:text-ink has-checked:bg-white has-checked:text-ink has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-pine ${
              size === "sm" ? "px-1.5 text-xs" : "px-3 text-sm"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-[inherit] outline-none"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
