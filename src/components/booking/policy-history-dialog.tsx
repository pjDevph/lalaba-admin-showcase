"use client";

/**
 * What the platform's booking rules have been, and how to put an old set back.
 *
 * `bookingPolicyHistory` has existed since the module was written and had no
 * UI, so publishing was a one-way door in the panel: the numbers everyone
 * books under changed and the only record of the previous ones was in Mongo.
 *
 * Restoring does NOT rewrite history or flip a flag on an old row. Versions
 * are monotonic by design, so "restore" loads that version's values into the
 * editor and the admin publishes them as a NEW version — the same path any
 * other change takes, with the same audit trail, and with a change note that
 * says where the numbers came from.
 */

import { useQuery } from "@tanstack/react-query";
import { HistoryIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StaffNameInline } from "@/components/orders/staff-name";
import {
  getBookingPolicyHistory,
  type BookingPolicy,
} from "@/lib/graphql/booking-policy";

function formatPublishedAt(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * The handful of numbers worth showing per row. The full policy is large and
 * the history is for scanning — "which version had a 3-day advance window?" —
 * so this summarises rather than diffs.
 */
function summarise(policy: BookingPolicy): string {
  const parts = [
    `${policy.defaults.dailyCapacity}/day`,
    `${policy.defaults.advanceBookingDays}d ahead`,
    `${policy.defaults.leadTimeMinutes}min lead`,
  ];
  if (!policy.defaults.sameDayBookingEnabled) parts.push("no same-day");
  if (!policy.enabled) parts.push("bookings paused");
  return parts.join(" · ");
}

export function PolicyHistoryDialog({
  open,
  onOpenChange,
  liveVersion,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  liveVersion: number | undefined;
  onRestore: (policy: BookingPolicy) => void;
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["booking-policy-history"],
    queryFn: () => getBookingPolicyHistory(20),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Policy history</DialogTitle>
          <DialogDescription>
            The last 20 published versions, newest first. Restoring one loads
            its values into the editor — you still review and publish, which
            writes a new version rather than reviving an old one.
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-[var(--status-danger)]">
            Could not load the policy history.
          </p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing published yet.
          </p>
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <ol className="flex flex-col gap-3">
              {data.map((policy) => {
                const isLive = policy.version === liveVersion;
                return (
                  <li
                    key={policy._id}
                    className="flex items-start justify-between gap-4 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          Version {policy.version}
                        </span>
                        {isLive && <Badge>Live</Badge>}
                      </div>
                      <p className="mt-0.5 text-sm">
                        {/* The note is the whole reason this screen is
                            readable, so an absent one says so plainly rather
                            than leaving a blank line. */}
                        {policy.changeNote ?? (
                          <span className="text-muted-foreground">
                            No change note
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {summarise(policy)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatPublishedAt(policy.publishedAt)}
                        {policy.publishedBy && (
                          <>
                            {" · "}
                            <StaffNameInline uid={policy.publishedBy} />
                          </>
                        )}
                      </p>
                    </div>
                    {!isLive && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRestore(policy)}
                      >
                        <HistoryIcon />
                        Restore
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
