"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  ShieldCheckIcon,
  StoreIcon,
  WashingMachineIcon,
  WalletIcon,
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
import { Can, useCan } from "@/components/can";
import { WorkQueue } from "@/components/now/work-queue";
import { KycMetricsCards } from "@/components/kyc/metrics-cards";
import { RecentVerificationActivity } from "@/components/kyc/recent-activity";
import { useAuth } from "@/context/auth-context";
import { getMaintenanceConfig } from "@/lib/graphql/maintenance";
import { countUsersByRole } from "@/lib/graphql/merchants";
import { formatPeso, getPlatformStatsToday } from "@/lib/graphql/platform-fees";
import { listWasherCaps } from "@/lib/graphql/washer-caps";

/**
 * NOW — what needs someone, and then how the platform is doing.
 *
 * This was a wall of statistics with revenue at the top. Nobody opens an
 * operations console to read revenue; they open it because something is
 * wrong. The work queue leads, the numbers follow, and the numbers are
 * collapsed into a strip rather than four large cards — they are context for
 * the work, not the point of the page.
 *
 * Every number here is still backed by a real query. Things that would need an
 * aggregation layer that doesn't exist yet — GMV, hourly throughput — are
 * intentionally left off rather than shown as placeholders.
 */
export default function DashboardPage() {
  const { user, profile } = useAuth();

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <h1 className="text-xl font-semibold">
          {/* Named for the work, not for the reader. "Welcome, Prince" is a
              greeting; "Now" is an answer to why they opened the page. */}
          Now
        </h1>
        <p className="text-sm text-muted-foreground">
          {profile?.firstName ?? user?.email}
          {profile && ` · ${profile.role.roleName}`}
        </p>
      </div>

      <div className="px-4 lg:px-6">
        <WorkQueue />
      </div>

      <PlatformSnapshot />

      {/* Gated at the mount point, not merely visible to whoever happens to
          reach this route. "/" carries no capability — everyone who can open
          the panel gets it — so without this the verification queue renders
          for any future role, and its two queries fire for them. Registered
          as an operational module in lib/modules.ts, which is what the
          capability-coverage test checks this against. */}
      <Can capability="kyc:review">
        <div className="px-4 lg:px-6">
          <h2 className="text-sm font-medium text-muted-foreground">
            Verification queue
          </h2>
        </div>
        <KycMetricsCards />
        <div className="px-4 lg:px-6">
          <RecentVerificationActivity limit={4} />
        </div>
      </Can>
    </div>
  );
}

function PlatformSnapshot() {
  const { can } = useCan();
  // Held by admin and support both, since bookingProviders widened to
  // ('admin', 'support'). Still gated rather than fired unconditionally: the
  // capability is the thing that tracks the guard, and a future role without
  // it should get "—" rather than a 403 on every dashboard load.
  const canReadWashers = can("provider:read");

  const stats = useQuery({
    queryKey: ["platform-stats-today"],
    queryFn: () => getPlatformStatsToday(),
    staleTime: 60_000,
  });
  // Same query the Providers page uses, so this number always matches what
  // you see when you click through — a registered washer account isn't the
  // same as a washer with a bookable listing, and "active" should mean the
  // latter. `bookingProviders` returns laundromat branches as well as home
  // washers, which is why the tile counts providers rather than washers.
  const washers = useQuery({
    queryKey: ["washer-caps", "dashboard-count"],
    queryFn: () => listWasherCaps(),
    staleTime: 60_000,
    enabled: canReadWashers,
  });
  const merchants = useQuery({
    queryKey: ["count-users-by-role", "merchant"],
    queryFn: () => countUsersByRole("merchant"),
    staleTime: 60_000,
  });
  const maintenance = useQuery({
    queryKey: ["maintenance-config", "dashboard"],
    queryFn: () => getMaintenanceConfig(),
    staleTime: 30_000,
  });

  const loading =
    stats.isPending ||
    (canReadWashers && washers.isPending) ||
    merchants.isPending ||
    maintenance.isPending;

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  const maintenanceActive =
    maintenance.data?.globalEmergencyActive ||
    maintenance.data?.customerApp.active ||
    maintenance.data?.partnerApp.active;

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Platform revenue, today</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {stats.isError ? "—" : formatPeso(stats.data?.revenueCentavos ?? 0)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <WalletIcon />
              Commission
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {stats.isError ? "Could not load" : `${stats.data?.completedOrders ?? 0} orders completed`}
          </div>
          <div className="text-muted-foreground">From completed online orders, PH time</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Bookable providers</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {!canReadWashers || washers.isError ? "—" : washers.data?.length}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <WashingMachineIcon />
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <Can capability="provider:read">
            <Link href="/providers" className="hover:underline">
              View providers
            </Link>
          </Can>
          <div className="text-muted-foreground">
            Home washers and laundromat branches with a live listing
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Active merchants</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {merchants.isError ? "—" : merchants.data}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <StoreIcon />
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <Link href="/merchants" className="hover:underline">
            View merchants
          </Link>
          <div className="text-muted-foreground">Laundromat accounts with an active account</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Platform status</CardDescription>
          <CardTitle className="text-2xl font-semibold @[250px]/card:text-3xl">
            {maintenance.isError ? (
              "—"
            ) : maintenanceActive ? (
              "Maintenance"
            ) : (
              "Operational"
            )}
          </CardTitle>
          <CardAction>
            {maintenanceActive ? (
              <Badge variant="destructive">
                <AlertTriangleIcon />
                Active
              </Badge>
            ) : (
              <Badge variant="outline">
                <ShieldCheckIcon />
                Clear
              </Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <Link href="/maintenance-mode" className="flex items-center gap-1 hover:underline">
            Open maintenance mode
            <ArrowRightIcon className="size-3.5" />
          </Link>
          <div className="text-muted-foreground">
            {maintenanceActive
              ? "One or more apps is currently blocked"
              : "Customer and partner apps are both live"}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
