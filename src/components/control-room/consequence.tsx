"use client";

/**
 * WHAT THIS WILL ACTUALLY DO, SAID BEFORE IT HAPPENS.
 *
 * "Are you sure?" is not a safeguard. It asks a question the operator has
 * already answered by clicking, and it says nothing about the one thing they
 * cannot work out from the form: how far the change reaches. The rule this
 * component exists to enforce is the one that governs the whole Control Room —
 * THE LARGER THE BLAST RADIUS, THE MORE DELIBERATE THE INTERFACE.
 *
 * A structured object rather than a prose string per page, for two reasons.
 * Hand-written warnings drift from what the code does — the maintenance page
 * needed 318 lines of impact calculation precisely because its form could not
 * be read at a glance, and that calculation deserved a home other than a
 * template literal. And a shape can be required: every consequence has to
 * state a headline, and an irreversible one has to say so.
 *
 * NUMBERS COME FROM THE SERVER. A count computed in the browser from a page of
 * results is a guess presented as a fact, and this component's whole value is
 * that its numbers can be trusted.
 */

import { AlertTriangleIcon, InfoIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type ConsequenceSeverity = "blocking" | "warning" | "neutral";

export type ConsequenceEffect = {
  text: string;
  severity?: ConsequenceSeverity;
};

export type Consequence = {
  /**
   * One sentence, in the operator's language, naming the reach.
   * "This sends a push notification to 12,438 devices."
   */
  headline: string;

  /**
   * The facts behind the headline, as label/value pairs. Rendered as a table
   * because a reader checking a number wants to find it, not parse a sentence
   * for it.
   */
  facts?: { label: string; value: string }[];

  /** One line per affected thing. */
  effects?: ConsequenceEffect[];

  /**
   * What this does NOT touch.
   *
   * The most valuable half, and the one prose warnings always omit. "Partner
   * app is not blocked, and will not be" is the line that catches an admin who
   * believed they were pausing everything and had switched one of two.
   */
  unaffected?: string[];

  /** Cannot be undone. Stated separately because it changes the decision. */
  irreversible?: boolean;
};

const SEVERITY_CLASS: Record<ConsequenceSeverity, string> = {
  blocking: "text-[var(--status-danger)]",
  warning: "text-[var(--status-pending)]",
  neutral: "text-muted-foreground",
};

export function ConsequenceLine({
  consequence,
  className,
}: {
  consequence: Consequence;
  className?: string;
}) {
  const { headline, facts, effects, unaffected, irreversible } = consequence;

  return (
    <div className={cn("flex flex-col gap-3 text-sm", className)}>
      <p
        className={cn(
          "font-medium",
          irreversible && "text-[var(--status-danger)]",
        )}
      >
        {headline}
      </p>

      {facts && facts.length > 0 && (
        <dl className="flex flex-col divide-y rounded-md border">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="flex justify-between gap-4 px-3 py-1.5"
            >
              <dt className="text-muted-foreground">{fact.label}</dt>
              <dd className="text-right font-medium tabular-nums">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {effects && effects.length > 0 && (
        <ul className="flex flex-col gap-1">
          {effects.map((effect) => (
            <li
              key={effect.text}
              className={cn(
                "flex items-start gap-2",
                SEVERITY_CLASS[effect.severity ?? "neutral"],
              )}
            >
              {effect.severity === "blocking" && (
                <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
              )}
              <span>{effect.text}</span>
            </li>
          ))}
        </ul>
      )}

      {unaffected && unaffected.length > 0 && (
        <ul className="flex flex-col gap-1">
          {unaffected.map((line) => (
            <li
              key={line}
              className="flex items-start gap-2 text-muted-foreground"
            >
              <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}

      {irreversible && (
        <p className="font-medium text-[var(--status-danger)]">
          This cannot be undone.
        </p>
      )}
    </div>
  );
}
