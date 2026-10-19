/**
 * Deck progress, and the deck's random-access navigation: every dot is a
 * button that jumps straight to its question, named with its position and the
 * question it belongs to so hovering or a screen reader tells you where you'd
 * land.
 *
 * Fill tracks whether a step has an answer rather than whether you've walked
 * past it — once you can jump around, "earlier" stops implying "answered",
 * and what someone scanning the dots wants to find is the gaps.
 *
 * The dot stays 6px tall; the button around it is a 24×24px target (WCAG 2.2
 * target size), so the dots look the same and only their spacing grows. The
 * row keeps the full 24px height rather than cancelling it with negative
 * margin: once it wraps on a phone, the targets would otherwise overlap the
 * line above.
 */
export function ProgressDots({
  labels,
  current,
  answered,
  onJump,
}: {
  /** One label per step, in order. The last is the review step. */
  labels: readonly string[];
  current: number;
  /** Whether each step holds an answer; same order and length as `labels`. */
  answered: readonly boolean[];
  onJump: (index: number) => void;
}) {
  const questionCount = labels.length - 1;

  return (
    <nav aria-label="Deck progress" className="flex items-center">
      {labels.map((label, index) => {
        const isCurrent = index === current;
        const isReview = index === questionCount;

        return (
          <button
            key={index}
            type="button"
            onClick={() => onJump(index)}
            title={label}
            aria-current={isCurrent ? "step" : undefined}
            aria-label={
              isReview
                ? label
                : `Question ${index + 1} of ${questionCount}: ${label} — ${answered[index] ? "answered" : "not answered yet"}`
            }
            className="group flex h-6 min-w-6 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-pine"
          >
            <span
              className={`block h-1.5 rounded-full transition-all ${
                isCurrent
                  ? "w-5 bg-pine"
                  : answered[index]
                    ? "w-1.5 bg-pine/50 group-hover:bg-pine"
                    : "w-1.5 bg-stone-200 group-hover:bg-stone-400"
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
}
