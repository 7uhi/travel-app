/**
 * Deck progress. The dots are decorative — the screen-reader text carries the
 * same information as a sentence.
 */
export function ProgressDots({
  total,
  current,
}: {
  total: number;
  current: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <p className="sr-only">
        Step {current + 1} of {total}
      </p>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          aria-hidden
          className={`h-1.5 rounded-full transition-all ${
            index === current
              ? "w-5 bg-pine"
              : index < current
                ? "w-1.5 bg-pine/50"
                : "w-1.5 bg-stone-200"
          }`}
        />
      ))}
    </div>
  );
}
