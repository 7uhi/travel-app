"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, List } from "lucide-react";

import {
  dismissProfileOnboarding,
  saveMyProfile,
  saveMyTripPreferences,
} from "@/actions/preferences";
import { preferenceDraftKey } from "@/lib/preference-drafts";
import {
  INTEREST_LABELS,
  PROFILE_QUESTIONS,
  inheritsFromProfile,
  profileDefaultFor,
  tripDeckFor,
  type PreferenceQuestion,
} from "@/lib/preference-questions";
import { OptionTile } from "@/components/preferences/OptionTile";
import { ProgressDots } from "@/components/preferences/ProgressDots";
import { FormError } from "@/components/ui/form";
import type {
  InterestTag,
  PreferenceAnswers,
  TravelProfileSummary,
  TripPreferenceSummary,
} from "@/types";

/**
 * The card-per-question deck: one question fills the screen, tiles are tapped
 * rather than typed, and the whole run is saved once at the end.
 *
 * Runs one of two banks. In "profile" mode it collects the member's durable
 * travel profile — asked once when they sign up, editable later, no trip
 * involved. In "trip" mode it collects answers for a single trip, and the
 * questions that also exist on the profile open pre-filled with the member's
 * usual answer: continuing accepts it, changing it overrides for this trip
 * only. Nothing in trip mode ever writes back to the durable profile.
 *
 * Answering is open to every trip member including VIEWERs; the save actions
 * enforce that server-side too, and only ever write the caller's own rows.
 */
export function PreferenceDeck({
  mode,
  userId,
  tripId,
  destination = null,
  profile,
  tripPreference = null,
  returnTo,
}: {
  mode: "profile" | "trip";
  /** The signed-in member; scopes the resumable draft to their account. */
  userId: string;
  /** Required in trip mode. */
  tripId?: string;
  destination?: string | null;
  /** The member's durable profile; seeds trip-mode defaults. */
  profile: TravelProfileSummary | null;
  tripPreference?: TripPreferenceSummary | null;
  returnTo: string;
}) {
  const questions =
    mode === "profile" ? PROFILE_QUESTIONS : tripDeckFor(destination);
  const answeredBefore =
    mode === "profile" ? profile !== null : tripPreference !== null;

  const [answers, setAnswers] = useState<PreferenceAnswers>(() =>
    prefillFor(mode, questions, profile, tripPreference),
  );
  // Someone revisiting a deck they've finished lands on the summary and
  // changes the one thing they came for; a first run starts at question 1.
  const [step, setStep] = useState(answeredBefore ? questions.length : 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const draftKey = preferenceDraftKey(
    userId,
    mode === "trip" ? tripId : undefined,
  );

  /*
   * A run lives in component state until the final save, so any remount —
   * a reload, a stray back-navigation, Fast Refresh in dev — would otherwise
   * drop every answer and drop the member back on question 1. Mirroring it
   * into sessionStorage makes the deck resumable. Read in an effect, never
   * during render: the server has no sessionStorage, and reading during
   * render guarantees a hydration mismatch.
   */
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as {
          step: number;
          answers: PreferenceAnswers;
        };
        if (draft && typeof draft.step === "number" && draft.answers) {
          setStep(Math.min(Math.max(draft.step, 0), questions.length));
          setAnswers(draft.answers);
        }
      }
    } catch {
      // A corrupt or unavailable draft just means starting fresh.
    }
    setRestored(true);
  }, [draftKey, questions.length]);

  useEffect(() => {
    if (!restored) return; // Don't clobber the stored draft before reading it.
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ step, answers }));
    } catch {
      // Private mode or a full quota: the deck still works, just not resumable.
    }
  }, [restored, draftKey, step, answers]);

  /*
   * Every step change the member makes moves focus to the new step's
   * heading. Without it, the control they used (a tile, Back, Continue)
   * either unmounts and drops focus on <body>, or survives and silently
   * becomes a different question's control. The restore above doesn't set
   * the flag, so loading the page never steals focus.
   */
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);
  function showStep(next: number | ((current: number) => number)) {
    focusHeading.current = true;
    setStep(next);
  }
  useEffect(() => {
    if (!focusHeading.current) return;
    focusHeading.current = false;
    headingRef.current?.focus();
  }, [step]);

  const question = questions[step];
  const onReview = step === questions.length;

  // The review step is the last "step", so it gets a dot of its own.
  const stepLabels = [...questions.map((q) => q.prompt), "All your answers"];
  const stepAnswered = [
    ...questions.map((q) => hasAnswer(answers[q.id])),
    false,
  ];

  function record(id: string, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function advance() {
    showStep((s) => Math.min(s + 1, questions.length));
  }

  /**
   * Skipping clears the answer: an explicit empty value the save writes
   * through, not a deleted key the save would ignore. On a first run the two
   * are the same; on an edit run the difference is what makes "Skipped" in
   * the review list true — a deleted key would silently keep the stored
   * value for scalar questions while wiping it for interest questions.
   */
  function skip() {
    if (question) {
      record(question.id, question.kind === "multi-select" ? [] : "");
    }
    advance();
  }

  /** Leaving without saving. Bailing out of the profile deck is recorded so
   *  /trips doesn't redirect straight back into it. */
  function leave() {
    startTransition(async () => {
      if (mode === "profile") await dismissProfileOnboarding();
      router.push(returnTo);
      router.refresh();
    });
  }

  function save() {
    startTransition(async () => {
      const result =
        mode === "profile"
          ? await saveMyProfile(answers)
          : await saveMyTripPreferences(tripId ?? "", answers);
      if (!result.success) {
        setError(result.error);
        return;
      }
      // The run is committed; a stale draft would resurrect it on the next visit.
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        // Nothing stored, nothing to clear.
      }
      router.push(returnTo);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col">
      {/* With 24px dot targets, a full bank (9 dots) and the two links don't
          share one line at 375px — so the row wraps rather than squeezing
          the targets back down. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ProgressDots
          labels={stepLabels}
          current={step}
          answered={stepAnswered}
          onJump={showStep}
        />
        <div className="flex items-center gap-4">
          {!onReview && (
            <button
              type="button"
              onClick={() => showStep(questions.length)}
              className="flex items-center gap-1 text-xs font-medium text-stone-600 transition-colors hover:text-ink"
            >
              <List size={13} />
              See all answers
            </button>
          )}
          <button
            type="button"
            onClick={leave}
            className="text-xs font-medium text-stone-600 transition-colors hover:text-ink"
          >
            {mode === "profile" ? "Skip for now" : "Finish later"}
          </button>
        </div>
      </div>

      <div className="mt-8 flex-1">
        {onReview ? (
          <ReviewStep
            questions={questions}
            answers={answers}
            onJumpTo={showStep}
            returning={answeredBefore}
            headingRef={headingRef}
          />
        ) : (
          <QuestionStep
            // A fresh instance per question, so the radio group's roving
            // focus never carries over from the previous question.
            key={question.id}
            question={question}
            headingRef={headingRef}
            answer={answers[question.id]}
            /* Show the "same as usual" badge only while the answer still
               matches what the profile supplied. */
            inherited={
              mode === "trip" &&
              inheritsFromProfile(question) &&
              sameAnswer(
                answers[question.id],
                profileDefaultFor(question, profile),
              )
            }
            onSingle={(value) => {
              record(question.id, value);
              // Auto-advance: one tap per question is the whole point.
              advance();
            }}
            onMulti={(value) => record(question.id, value)}
            onText={(value) => record(question.id, value)}
          />
        )}
      </div>

      <FormError message={error} className="mt-4" />

      <div className="mt-8 flex items-center justify-between gap-3 pb-4">
        <button
          type="button"
          onClick={() => showStep((s) => Math.max(s - 1, 0))}
          disabled={step === 0}
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:text-ink disabled:invisible"
        >
          <ArrowLeft size={15} />
          Back
        </button>

        {onReview ? (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="flex items-center gap-2 rounded-full bg-pine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pine-dark disabled:opacity-60"
          >
            <Check size={16} />
            {pending ? "Saving…" : "Save answers"}
          </button>
        ) : needsContinue(question) ? (
          <button
            type="button"
            onClick={advance}
            className="rounded-full bg-pine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pine-dark"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={skip}
            className="rounded-full px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:text-ink"
          >
            Skip this one
          </button>
        )}
      </div>

      {!onReview && needsContinue(question) && (
        <button
          type="button"
          onClick={skip}
          className="pb-4 text-center text-xs font-medium text-stone-600 transition-colors hover:text-ink"
        >
          Skip this one
        </button>
      )}
    </div>
  );
}

/**
 * Whether a step counts as answered, for the progress dots and the review
 * tally. Stricter than `id in answers`: emptying a text box or deselecting
 * every tile leaves a value behind that saves as nothing, and a dot that
 * claims otherwise would send someone hunting for a gap that isn't there.
 */
function hasAnswer(
  value: string | string[] | undefined,
): value is string | string[] {
  if (value === undefined) return false;
  return Array.isArray(value) ? value.length > 0 : value.trim() !== "";
}

/** Multi-select and text steps need an explicit Continue; tiles auto-advance. */
function needsContinue(question: PreferenceQuestion | undefined): boolean {
  return question?.kind === "multi-select" || question?.kind === "text";
}

/** Whether an answer still equals the default it was seeded from. */
function sameAnswer(
  answer: string | string[] | undefined,
  fallback: string | string[] | undefined,
): boolean {
  if (answer === undefined || fallback === undefined) return false;
  if (Array.isArray(answer) && Array.isArray(fallback)) {
    return (
      answer.length === fallback.length &&
      [...answer].sort().join() === [...fallback].sort().join()
    );
  }
  return answer === fallback;
}

function QuestionStep({
  question,
  answer,
  inherited,
  headingRef,
  onSingle,
  onMulti,
  onText,
}: {
  question: PreferenceQuestion;
  answer: string | string[] | undefined;
  /** True while this answer is still the member's usual one, carried over. */
  inherited: boolean;
  headingRef: React.Ref<HTMLHeadingElement>;
  onSingle: (value: string) => void;
  onMulti: (value: string[]) => void;
  onText: (value: string) => void;
}) {
  const picked = Array.isArray(answer) ? answer : [];
  const options = question.options ?? [];
  const headingId = useId();
  const hintId = useId();
  const describedBy = question.hint ? hintId : undefined;

  /*
   * Single-choice tiles are a radio group with a roving tabindex: one Tab
   * stop, arrows move between tiles. Arrows move focus only — picking a tile
   * auto-advances the deck, so selection can't follow focus the way native
   * radios do; Space or Enter picks the focused tile.
   */
  const [focusIndex, setFocusIndex] = useState(() =>
    Math.max(
      options.findIndex((option) => option.value === answer),
      0,
    ),
  );

  function moveRadioFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    const radios = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'),
    );
    const index = radios.indexOf(event.target as HTMLElement);
    if (index === -1) return;
    const target = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: radios.length - 1,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    radios[(target + radios.length) % radios.length].focus();
  }

  return (
    <div>
      <h1
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-3xl leading-tight outline-none"
      >
        {question.prompt}
      </h1>
      {question.hint && (
        <p id={hintId} className="mt-2 text-sm leading-relaxed text-stone-600">
          {question.hint}
        </p>
      )}
      {inherited && (
        <p className="mt-3 inline-block rounded-full bg-pine-soft px-3 py-1 text-xs font-medium text-pine-dark">
          Same as usual — change it just for this trip
        </p>
      )}

      <div className="mt-6">
        {question.kind === "text" ? (
          // Controlled, so the field always shows this question's answer.
          // Uncontrolled, React would reuse one textarea node across
          // consecutive text questions and carry the previous answer over.
          <textarea
            name={question.id}
            rows={3}
            maxLength={question.maxLength}
            placeholder={question.placeholder}
            value={typeof answer === "string" ? answer : ""}
            onChange={(e) => onText(e.target.value)}
            aria-labelledby={headingId}
            aria-describedby={describedBy}
            className={inputClass}
          />
        ) : question.kind === "multi-select" ? (
          <div
            role="group"
            aria-labelledby={headingId}
            aria-describedby={describedBy}
            className="grid grid-cols-2 gap-3"
          >
            {options.map((option) => (
              <OptionTile
                key={option.value}
                role="checkbox"
                emoji={option.emoji}
                label={option.label}
                description={option.description}
                checked={picked.includes(option.value)}
                onClick={() =>
                  onMulti(
                    picked.includes(option.value)
                      ? picked.filter((v) => v !== option.value)
                      : [...picked, option.value],
                  )
                }
              />
            ))}
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-labelledby={headingId}
            aria-describedby={describedBy}
            onKeyDown={moveRadioFocus}
            className="grid grid-cols-2 gap-3"
          >
            {options.map((option, index) => (
              <OptionTile
                key={option.value}
                role="radio"
                emoji={option.emoji}
                label={option.label}
                description={option.description}
                checked={answer === option.value}
                tabIndex={index === focusIndex ? 0 : -1}
                onFocus={() => setFocusIndex(index)}
                onClick={() => onSingle(option.value)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The last step. Saving is a deliberate final tap rather than an auto-advance,
 * so the previous answer is never irreversible.
 */
function ReviewStep({
  questions,
  answers,
  onJumpTo,
  returning,
  headingRef,
}: {
  questions: readonly PreferenceQuestion[];
  answers: PreferenceAnswers;
  onJumpTo: (step: number) => void;
  /** True when the member already had answers before this run. */
  returning: boolean;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const answered = questions.filter((q) => hasAnswer(answers[q.id]));
  // Reachable at any point now, not just by walking to the end — so the copy
  // can't assume the run is over.
  const complete = answered.length === questions.length;

  return (
    <div>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-3xl leading-tight outline-none"
      >
        {complete && !returning ? "That's everything." : "Your answers"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">
        {complete
          ? "Tap anything to change it."
          : `${answered.length} of ${questions.length} answered. Tap any question to fill it in or change it — blanks stay blank.`}
      </p>

      <ul className="mt-6 space-y-2">
        {questions.map((question, index) => (
          <li key={question.id}>
            <button
              type="button"
              onClick={() => onJumpTo(index)}
              className="flex w-full items-start justify-between gap-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-left transition-colors hover:border-pine/40"
            >
              <span className="text-sm text-stone-500">{question.prompt}</span>
              {/* Gaps read as gaps: a dimmed "Skipped" doesn't carry the same
                  weight as a real answer when scanning the list. */}
              <span
                className={`shrink-0 text-sm font-medium ${
                  hasAnswer(answers[question.id])
                    ? "text-ink"
                    : "text-stone-500"
                }`}
              >
                {summarize(question, answers[question.id])}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A short display value for the review list. */
function summarize(
  question: PreferenceQuestion,
  answer: string | string[] | undefined,
): string {
  if (!hasAnswer(answer)) return "Skipped";

  if (Array.isArray(answer)) {
    const isInterests =
      question.target.kind === "interests" ||
      question.target.kind === "tripInterests";
    if (isInterests) {
      return answer.length <= 2
        ? answer.map((tag) => INTEREST_LABELS[tag as InterestTag]).join(", ")
        : `${answer.length} picked`;
    }
    return `${answer.length} picked`;
  }

  if (question.kind === "text") {
    const text = answer.trim();
    if (!text) return "Skipped";
    return text.length > 24 ? `${text.slice(0, 24)}…` : text;
  }

  const option = question.options?.find((o) => o.value === answer);
  return option ? `${option.emoji} ${option.label}` : answer;
}

/**
 * Seeds the deck so editing starts from the current state rather than a blank
 * run. In trip mode a question the member hasn't answered for this trip falls
 * back to their profile answer, which is what makes the overlapping questions
 * one-tap confirmations instead of a re-interrogation.
 */
function prefillFor(
  mode: "profile" | "trip",
  questions: readonly PreferenceQuestion[],
  profile: TravelProfileSummary | null,
  tripPreference: TripPreferenceSummary | null,
): PreferenceAnswers {
  const answers: PreferenceAnswers = {};

  for (const question of questions) {
    const { target } = question;

    if (mode === "profile") {
      if (target.kind === "profileField") {
        const value = profile?.[target.field];
        if (value != null && value !== "") answers[question.id] = value;
      } else if (target.kind === "interests" && profile) {
        // Match on sign, not the exact weight, so a value that has drifted
        // still reads back as the answer it came from.
        const wanted = Math.sign(target.weight);
        const tags = profile.interests
          .filter((interest) => Math.sign(interest.weight) === wanted)
          .map((interest) => interest.tag);
        if (tags.length > 0) answers[question.id] = tags;
      }
      continue;
    }

    if (target.kind === "tripField") {
      const stored = tripPreference?.[target.field];
      if (stored != null && stored !== "") {
        answers[question.id] = String(stored);
        continue;
      }
    } else if (target.kind === "tripInterests" && tripPreference) {
      const wanted = Math.sign(target.weight);
      const tags = tripPreference.interests
        .filter((interest) => Math.sign(interest.weight) === wanted)
        .map((interest) => interest.tag);
      if (tags.length > 0) {
        answers[question.id] = tags;
        continue;
      }
    }

    // No trip-specific answer yet: inherit the member's usual one.
    const inherited = profileDefaultFor(question, profile);
    if (inherited !== undefined) answers[question.id] = inherited;
  }

  return answers;
}

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-pine focus-visible:ring-2 focus-visible:ring-pine/30";
