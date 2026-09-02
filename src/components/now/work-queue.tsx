"use client";

/**
 * THE WORK QUEUE — the top half of Now, and the reason the page exists.
 *
 * A prioritised list of things that need a person, each row landing somewhere
 * an operator can ACT. That last part is what makes it worth clicking, and it
 * is why this was built after the operational context: before that page
 * existed, a row about a person had nowhere useful to go.
 *
 * Nothing here decides what is urgent. Priority, thresholds, the
 * first-response clock and the reason text all arrive from the backend, whose
 * definitions are the same ones the inbox sorts by. A copy of them in this
 * component would disagree with the inbox within a release.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon, CheckCircle2Icon, RefreshCwIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { peso } from "@/lib/graphql/wallets";
import { cn } from "@/lib/utils";
import {
  WORK_ITEM_LABELS,
  destinationFor,
  fetchNowQueue,
  type WorkItem,
  type WorkPriority,
} from "@/lib/graphql/now-queue";

const PRIORITY_STYLES: Record<WorkPriority, string> = {
  HIGH: "border-l-[var(--status-danger)]",
  MEDIUM: "border-l-[var(--status-pending)]",
  LOW: "border-l-border",
};

const PRIORITY_LABELS: Record<WorkPriority, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString("en-PH", { timeStyle: "short" });
}

export function WorkQueue() {
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ["now-queue"],
    queryFn: fetchNowQueue,
    // Work arrives while you are looking at it. Short enough to be current,
    // long enough not to re-sort the list under someone's cursor.
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="rounded-md border p-4 text-sm text-[var(--status-danger)]">
        Could not load the work queue. Everything else on this page is
        unaffected.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {data.items.length === 0
            ? "Nothing is waiting."
            : `${data.items.length} thing${data.items.length === 1 ? "" : "s"} need${data.items.length === 1 ? "s" : ""} someone.`}
          {/* Provenance: every number here is as of one moment, and saying
              which stops it being argued about on a call. */}
          <span className="ml-2 text-xs">
            As of {formatGeneratedAt(data.generatedAt)}
          </span>
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          <RefreshCwIcon className={isFetching ? "animate-spin" : undefined} />
          Refresh
        </Button>
      </div>

      {data.items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border p-4 text-sm">
          <CheckCircle2Icon className="size-4 text-[var(--status-success)]" />
          <span>
            Nothing is overdue, unclaimed or stuck.
            {/* The distinction that stops a clean page being read as a broken
                one — or worse, an unchecked one. */}
            <span className="block text-xs text-muted-foreground">
              Checked {data.searchedTypes.length} kind
              {data.searchedTypes.length === 1 ? "" : "s"} of work.
            </span>
          </span>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((item) => (
            <li key={item.id}>
              <WorkRow item={item} />
            </li>
          ))}
        </ul>
      )}

      {data.truncated && (
        <p className="text-xs text-muted-foreground">
          Showing the most pressing only — open the queues for the full lists.
        </p>
      )}
    </div>
  );
}

function WorkRow({ item }: { item: WorkItem }) {
  return (
    <Link
      href={destinationFor(item)}
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border border-l-4 p-3 text-sm transition-colors hover:bg-accent",
        PRIORITY_STYLES[item.priority],
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {item.priority === "HIGH" && (
            <AlertTriangleIcon className="size-3.5 shrink-0 text-[var(--status-danger)]" />
          )}
          <span className="truncate font-medium">{item.title}</span>
          <Badge variant="outline" className="text-[10px]">
            {WORK_ITEM_LABELS[item.type]}
          </Badge>
        </div>
        {/* The backend's own words: why this is here, not what status the
            record is in. */}
        <p className="mt-0.5 text-muted-foreground">{item.reason}</p>
        {item.assigneeName && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.assigneeName}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {item.amountCentavos != null && item.amountCentavos !== 0 && (
          <span className="font-medium tabular-nums">
            {peso(Math.abs(item.amountCentavos))}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {PRIORITY_LABELS[item.priority]}
        </span>
      </div>
    </Link>
  );
}
