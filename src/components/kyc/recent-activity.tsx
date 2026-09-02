"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  KYC_AUDIT_EVENT_LABELS,
  KYC_PROVIDER_TYPE_LABELS,
  listKycAuditLog,
} from "@/lib/graphql/kyc";

/**
 * The last handful of verification events, as a dashboard summary. The full,
 * filterable trail lives at /audit-logs — this exists so an admin opening the
 * panel can see at a glance whether the queue is being worked.
 */
export function RecentVerificationActivity({
  limit = 8,
}: Readonly<{ limit?: number }>) {
  const { data, isPending, error } = useQuery({
    queryKey: ["kyc-audit-log", "dashboard-recent", limit],
    queryFn: () => listKycAuditLog({ limit, offset: 0 }),
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent verification activity</CardTitle>
        <CardDescription>
          The latest decisions and submissions across the platform.
        </CardDescription>
        <CardAction>
          <Link
            href="/audit-logs"
            className="text-sm text-muted-foreground hover:underline"
          >
            View all
          </Link>
        </CardAction>
      </CardHeader>

      <div className="px-6 pb-6">
        {error ? (
          <p className="text-sm text-destructive">
            Could not load recent activity.
          </p>
        ) : isPending || !data ? (
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: Math.min(limit, 4) }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : data.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No verification activity yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {data.data.map((event) => (
              <li
                key={event._id}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <Badge variant="outline" className="shrink-0">
                  {KYC_AUDIT_EVENT_LABELS[event.event] ?? event.event}
                </Badge>
                <span className="truncate font-medium">
                  {event.providerName ?? "Deleted provider"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {KYC_PROVIDER_TYPE_LABELS[event.providerType]} ·{" "}
                  {event.actorEmail ?? event.actorUid} ·{" "}
                  {new Date(event.timestamp).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
