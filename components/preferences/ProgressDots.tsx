/**
 * Deck progress, and the deck's random-access navigation: every dot is a
 * button that jumps straight to its question, labelled with the question it
 * belongs to so hovering tells you where you'd land.
 *
 * Fill tracks whether a step has an answer rather than whether you've walked
 * past it — once you can jump around, "earlier" stops implying "answered",
 * and what someone scanning the dots wants to find is the gaps.
 *
 * The dot stays 6px tall; the button around it carries the padding, so the
 * tap target clears 24px without changing how the row looks.
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
  return (
    <nav
      aria-label="Deck progress"
      /* -my-2 cancels the buttons' tap-target padding, so the row occupies the
         same vertical space it did as plain dots. */
      className="-my-2 flex items-center"
    >
      {labels.map((label, index) => {
        const isCurrent = index === current;
        const isReview = index === labels.length - 1;

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
                : `${label} — ${answered[index] ? "answered" : "not answered yet"}`
            }
            className="group px-[3px] py-2"
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
