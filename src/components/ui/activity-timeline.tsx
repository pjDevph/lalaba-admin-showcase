"use client";

import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { lookupStatus, type StatusMeta, type StatusTone } from "@/lib/status";

export type TimelineEntry = {
  id: string;
  /** ISO timestamp. Entries are rendered in the order given, not re-sorted. */
  at: string | null;
  /** What happened, in the past tense: "Rejected the valid ID". */
  title: React.ReactNode;
  /** Who did it. Null = the system did, which is worth saying out loud. */
  actor?: string | null;
  detail?: React.ReactNode;
  /** Raw status enum, if this entry is a state change. */
  status?: string;
  statusRegistry?: Record<string, StatusMeta>;
  /**
   * Dot colour. Derived from `status` when omitted, so a state-change entry
   * never has to repeat itself; set explicitly for entries that aren't state
   * changes (a note added, evidence viewed).
   */
  tone?: StatusTone;
};

const TONE_DOT: Record<StatusTone, string> = {
  pending: "bg-[var(--status-pending)]",
  info: "bg-[var(--status-info)]",
  success: "bg-[var(--status-success)]",
  danger: "bg-[var(--status-danger)]",
  neutral: "bg-[var(--status-neutral)]",
};

function formatWhen(at: string | null) {
  if (!at) return "—";
  return new Date(at).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * "What happened to this record, in order" — the same shape whether the record
 * is an order, a verification case, a ticket or a wallet adjustment.
 *
 * Every entry names an actor. An admin reading a timeline is nearly always
 * answering "who did this and when", so an entry that cannot say is explicit
 * about it ("System") rather than leaving a blank the reader has to interpret.
 */
export function ActivityTimeline({
  entries,
  emptyMessage = "Nothing has happened yet.",
  className,
}: {
  entries: TimelineEntry[];
  emptyMessage?: string;
  className?: string;
}) {
  if (entries.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <ol className={cn("flex flex-col", className)}>
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        const tone: StatusTone =
          entry.tone ??
          (entry.status
            ? lookupStatus(entry.status, entry.statusRegistry).tone
            : "neutral");
        return (
          <li key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  TONE_DOT[tone],
                )}
              />
              {/* The rail stops at the last entry — running it past the final
                  dot reads as "and then something else happened". */}
              {!isLast && <span className="w-px flex-1 bg-border" />}
            </div>
            <div className={cn("flex flex-col gap-0.5", isLast ? "pb-0" : "pb-4")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{entry.title}</span>
                {entry.status && (
                  <StatusBadge
                    status={entry.status}
                    registry={entry.statusRegistry}
                  />
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {formatWhen(entry.at)} · {entry.actor || "System"}
              </span>
              {entry.detail && (
                <div className="mt-1 text-sm text-muted-foreground">
                  {entry.detail}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
