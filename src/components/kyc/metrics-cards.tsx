"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ClockIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getKycMetrics } from "@/lib/graphql/kyc";

export const METRICS_QUERY_KEY = "kyc-metrics";

/** Whole days if it has been a while, hours otherwise. */
export function formatAge(since: string | null): string {
  if (!since) return "—";
  const hours = (Date.now() - new Date(since).getTime()) / (1000 * 60 * 60);
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
}

export function formatHours(hours: number | null): string {
  // Null means nothing was decided in the window. Showing "0 h" there would
  // read as instant turnaround, which is the opposite of no data.
  if (hours == null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

function MetricCard({
  label,
  value,
  badge,
  footer,
  hint,
}: {
  label: string;
  value: string;
  badge?: React.ReactNode;
  footer: React.ReactNode;
  hint: string;
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value}
        </CardTitle>
        {badge && <CardAction>{badge}</CardAction>}
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">{footer}</div>
        <div className="text-muted-foreground">{hint}</div>
      </CardFooter>
    </Card>
  );
}

/**
 * KYC health at a glance. Queue and provider counts are current standing;
 * turnaround and rejection rate are measured over the last 30 days (the
 * backend's default window).
 */
export function KycMetricsCards() {
  const { data, isPending, error } = useQuery({
    queryKey: [METRICS_QUERY_KEY],
    queryFn: () => getKycMetrics(),
    // The queue moves as reviewers work it — a stale count is worse than a
    // brief spinner, but a per-render refetch would be noise.
    staleTime: 60_000,
  });

  if (error) {
    return (
      <p className="px-4 text-sm text-destructive lg:px-6">
        Could not load verification metrics.
      </p>
    );
  }

  if (isPending || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  const decided = data.approvedInPeriod + data.rejectedInPeriod;
  const totalProviders =
    data.providersPending +
    data.providersInReview +
    data.providersApproved +
    data.providersRejected;

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <MetricCard
        label="Awaiting review"
        value={String(data.pendingReview)}
        badge={
          data.pendingReview > 0 ? (
            <Badge variant="secondary">
              <ClockIcon />
              {data.claimedForReview} claimed
            </Badge>
          ) : (
            <Badge variant="outline">Clear</Badge>
          )
        }
        footer={
          <Link href="/verifications" className="hover:underline">
            Open the review queue
          </Link>
        }
        hint={
          data.oldestPendingSubmittedAt
            ? `Oldest has waited ${formatAge(data.oldestPendingSubmittedAt)}`
            : "Nothing is waiting"
        }
      />

      <MetricCard
        label="Verified partners"
        value={String(data.providersApproved)}
        badge={
          <Badge variant="outline">
            <ShieldCheckIcon />
            {totalProviders ? Math.round((data.providersApproved / totalProviders) * 100) : 0}%
          </Badge>
        }
        footer={<>{data.providersInReview} in review</>}
        hint={`${data.providersPending} have not finished uploading`}
      />

      <MetricCard
        label="Needs partner action"
        value={String(data.providersRejected)}
        badge={
          data.providersRejected > 0 ? (
            <Badge variant="destructive">
              <TriangleAlertIcon />
              Blocked
            </Badge>
          ) : (
            <Badge variant="outline">
              <UsersIcon />
              None
            </Badge>
          )
        }
        footer={<>Waiting on a resubmission</>}
        hint="These partners were told what to fix and have not re-uploaded"
      />

      <MetricCard
        label="Avg. time to decision"
        value={formatHours(data.avgHoursToDecision)}
        badge={
          data.rejectionRate != null ? (
            <Badge variant="outline">
              {Math.round(data.rejectionRate * 100)}% rejected
            </Badge>
          ) : undefined
        }
        footer={<>{decided} decisions in 30 days</>}
        hint={`${data.approvedInPeriod} approved · ${data.rejectedInPeriod} rejected`}
      />
    </div>
  );
}
