"use client";

import { useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { RequireCapability } from "@/components/can";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ColumnDef } from "@tanstack/react-table";
import {
  fetchPlatformOverview,
  type TopPlatformProvider,
} from "@/lib/graphql/platform-analytics";

function peso(centavos: number) {
  return `₱${(centavos / 100).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

// Default window: the last 30 days including today, in the browser's local
// date — good enough for an admin glancing at "how's the platform doing
// lately". PH-timezone bucketing happens server-side on completedAt.
function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  return { from: toISO(from), to: toISO(to) };
}

const chartConfig = {
  gmvCentavos: { label: "GMV", color: "var(--chart-1)" },
} satisfies ChartConfig;

const providerColumns: ColumnDef<TopPlatformProvider>[] = [
  {
    id: "provider",
    header: "Provider",
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.providerName}</div>
        <div className="text-sm text-muted-foreground">
          {row.original.providerType === "MERCHANT" ? "Merchant" : "Home washer"}
        </div>
      </div>
    ),
  },
  {
    id: "orders",
    header: "Orders",
    cell: ({ row }) => <span className="tabular-nums">{row.original.orders}</span>,
  },
  {
    id: "gmv",
    header: "GMV",
    cell: ({ row }) => (
      <span className="tabular-nums">{peso(row.original.gmvCentavos)}</span>
    ),
  },
];

function ReportsPage() {
  const [{ from, to }, setRange] = useState(defaultRange);

  const rangeInput = useMemo(
    () => ({
      from: from ? new Date(`${from}T00:00:00+08:00`).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59+08:00`).toISOString() : undefined,
    }),
    [from, to],
  );

  const { data, isPending, isError } = useQuery({
    queryKey: ["platform-overview", rangeInput.from, rangeInput.to],
    queryFn: () => fetchPlatformOverview(rangeInput),
    placeholderData: keepPreviousData,
  });

  const merchant = data?.byProviderType.find((p) => p.providerType === "MERCHANT");
  const washer = data?.byProviderType.find((p) => p.providerType === "WASHER");

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            GMV, revenue and order volume across every provider. GMV and
            revenue count only completed orders — order volume and
            cancellation rate count everything placed in the window,
            completed or not.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="report-from" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="report-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="report-to" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="report-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="w-40"
            />
          </div>
        </div>
      </div>

      {isError ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <h2 className="font-medium text-destructive">Failed to load reports</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Something went wrong loading platform analytics. Please try again.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>GMV</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {isPending ? "…" : peso(data?.gmvCentavos ?? 0)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {isPending ? "" : `${data?.ordersCompleted ?? 0} completed orders`}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Platform fee revenue</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {isPending ? "…" : peso(data?.platformFeeRevenueCentavos ?? 0)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {isPending ? "" : `Avg order ${peso(data?.averageOrderValueCentavos ?? 0)}`}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Orders placed</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {isPending ? "…" : (data?.ordersCreated ?? 0)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {isPending
                  ? ""
                  : `${((data?.cancellationRate ?? 0) * 100).toFixed(1)}% cancelled or rejected`}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active in window</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {isPending ? "…" : (data?.activeCustomers ?? 0)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {isPending ? "" : `customers · ${data?.activeProviders ?? 0} providers`}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Merchant GMV</CardDescription>
                <CardTitle className="text-xl tabular-nums">
                  {isPending ? "…" : peso(merchant?.gmvCentavos ?? 0)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {isPending ? "" : `${merchant?.orders ?? 0} completed orders`}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Home washer GMV</CardDescription>
                <CardTitle className="text-xl tabular-nums">
                  {isPending ? "…" : peso(washer?.gmvCentavos ?? 0)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {isPending ? "" : `${washer?.orders ?? 0} completed orders`}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>GMV by day</CardTitle>
              <CardDescription>Completed orders, bucketed by completion date (PH time).</CardDescription>
            </CardHeader>
            <CardContent>
              {data && data.daily.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-64 w-full">
                  <BarChart data={data.daily}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tickFormatter={(v: string) =>
                        new Date(`${v}T00:00:00`).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                        })
                      }
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => peso(v)}
                      width={72}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => peso(Number(value))}
                          labelFormatter={(v) =>
                            new Date(`${String(v)}T00:00:00`).toLocaleDateString("en-PH", {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })
                          }
                        />
                      }
                    />
                    <Bar dataKey="gmvCentavos" fill="var(--color-gmvCentavos)" radius={4} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {isPending ? "Loading…" : "No completed orders in this window."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top providers</CardTitle>
              <CardDescription>By GMV in this window, completed orders only.</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={providerColumns}
                data={data?.topProviders ?? []}
                isLoading={isPending}
                emptyMessage="No completed orders in this window."
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function ReportsPageGuard() {
  return (
    <RequireCapability capability="reports:read">
      <ReportsPage />
    </RequireCapability>
  );
}
