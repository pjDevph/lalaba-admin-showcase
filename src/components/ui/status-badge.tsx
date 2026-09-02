import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { lookupStatus, type StatusMeta, type StatusTone } from "@/lib/status";

/**
 * The only badge that may carry status meaning. Plain `<Badge>` stays for
 * non-status labels (counts, roles, tags) — if it says what state something is
 * in, it goes through here so the colour is the platform's, not the page's.
 *
 * Colours come from the pinned `--status-*` tokens, never from `--primary`,
 * so a theme change cannot alter what "approved" looks like.
 */
const statusBadgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 rounded-4xl px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      tone: {
        pending:
          "bg-[var(--status-pending-bg)] text-[var(--status-pending)]",
        info: "bg-[var(--status-info-bg)] text-[var(--status-info)]",
        success:
          "bg-[var(--status-success-bg)] text-[var(--status-success)]",
        danger: "bg-[var(--status-danger-bg)] text-[var(--status-danger)]",
        neutral:
          "bg-[var(--status-neutral-bg)] text-[var(--status-neutral)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

type StatusBadgeProps = {
  /** Raw enum value from the backend, e.g. `"laundry_quality_hold"`. */
  status: string;
  /**
   * Which registry to resolve against. Pass it whenever the value could exist
   * in more than one enum (APPROVED, ACTIVE) — see `lookupStatus`.
   */
  registry?: Record<string, StatusMeta>;
  /** Overrides the registry label. The tone is never overridable. */
  label?: string;
  className?: string;
} & Omit<VariantProps<typeof statusBadgeVariants>, "tone">;

export function StatusBadge({
  status,
  registry,
  label,
  className,
}: StatusBadgeProps) {
  const meta = lookupStatus(status, registry);
  return (
    <span
      className={cn(statusBadgeVariants({ tone: meta.tone }), className)}
      // Support reads these aloud to customers on the phone; the raw enum is
      // what appears in logs and in the backend, so keep it reachable.
      title={status}
    >
      {label ?? meta.label}
    </span>
  );
}

/**
 * A tone with no registry behind it — for one-off derived states a page
 * computes itself (e.g. "expired", "over SLA"). Still routed through the same
 * five tones so it cannot introduce a sixth status colour.
 */
export function ToneBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(statusBadgeVariants({ tone }), className)}>
      {children}
    </span>
  );
}

export { statusBadgeVariants };
