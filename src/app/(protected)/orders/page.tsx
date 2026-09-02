"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { StatusBadge } from "@/components/ui/status-badge";
import {
  ORDER_BUCKET_LABELS,
  ORDER_STATUS,
  orderStatusesInBucket,
  PAYMENT_STATUS,
  type StatusBucket,
} from "@/lib/status";
import { DataTable } from "@/components/ui/data-table";
import {
  DataTableToolbar,
  PAGE_SIZE_OPTIONS,
} from "@/components/ui/data-table-toolbar";
import { StatusFilterChips } from "@/components/ui/status-filter-chips";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCan } from "@/components/can";
import {
  peso,
  searchAdminOrders,
  type OrderSearchRow,
} from "@/lib/graphql/orders";

// Order search for support/admin.
//
// The search box resolves an order number ("LB-000123"), a raw order id, a
// customer or provider uid, a PHONE NUMBER, or a name — what an agent taking a
// call actually has in front of them. Phone lookup goes through the user
// record on the backend: the order snapshot stores only a masked number, so
// the digits the customer reads out would never match it.
//
// The detail lives at /orders/[id] rather than in state on this page, so an
// agent can send a colleague a link to the order they are discussing and a
// refresh does not lose it.

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * The five buckets support thinks in. The 33 lifecycle states are expanded
 * from these on the way to the backend, which knows nothing about buckets —
 * so the grouping lives in exactly one place (lib/status.ts).
 */
const BUCKETS: StatusBucket[] = [
  "placed",
  "in_progress",
  "completed",
  "disputed",
  "cancelled",
];

export default function OrdersPage() {
  const router = useRouter();
  const { can } = useCan();

  const [searchInput, setSearchInput] = useState("");
  const [buckets, setBuckets] = useState<string[]>([]);
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [limit, setLimit] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const filter = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      statuses: buckets.length
        ? buckets.flatMap((bucket) => orderStatusesInBucket(bucket as StatusBucket))
        : undefined,
      outstandingBalanceOnly: outstandingOnly || undefined,
      limit,
      offset: (page - 1) * limit,
    }),
    [debouncedSearch, buckets, outstandingOnly, limit, page],
  );

  const { data, isPending, isError, dataUpdatedAt } = useQuery({
    queryKey: ["admin-orders", filter],
    queryFn: () => searchAdminOrders(filter),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<OrderSearchRow>[]>(
    () => [
      {
        id: "orderNumber",
        header: "Order #",
        meta: { label: "Order #" },
        accessorFn: (row) => row.orderNumber ?? "",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.orderNumber ?? "—"}</span>
        ),
      },
      {
        id: "customer",
        header: "Customer",
        meta: { label: "Customer" },
        accessorFn: (row) => row.customer.displayName,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.customer.displayName}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.customer.maskedPhone ??
                row.original.customer.areaLabel ??
                "—"}
            </div>
          </div>
        ),
      },
      {
        id: "provider",
        header: "Provider",
        meta: { label: "Provider" },
        accessorFn: (row) => row.provider.providerName,
        cell: ({ row }) => (
          <div>
            <div className="text-sm">{row.original.provider.providerName}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.provider.providerType === "WASHER"
                ? "Home washer"
                : "Laundromat"}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        meta: { label: "Status" },
        accessorFn: (row) => row.status,
        cell: ({ row }) => (
          <StatusBadge status={row.original.status} registry={ORDER_STATUS} />
        ),
      },
      {
        id: "payment",
        header: "Payment",
        meta: { label: "Payment" },
        accessorFn: (row) => row.paymentStatus,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge
              status={row.original.paymentStatus}
              registry={PAYMENT_STATUS}
            />
            {row.original.amountDueCentavos > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {peso(row.original.amountDueCentavos)} due
              </span>
            )}
          </div>
        ),
      },
      {
        id: "placed",
        header: "Placed",
        meta: { label: "Placed" },
        accessorFn: (row) => row.createdAt ?? "",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm">
            {formatDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        // A real link, not a click handler: an agent chasing two orders at
        // once opens the second in a new tab, and a middle click has to work.
        cell: ({ row }) => (
          <Link
            href={`/orders/${row.original._id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            View
          </Link>
        ),
      },
    ],
    [],
  );

  if (!can("order:read")) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <h1 className="text-xl font-semibold">Orders</h1>
        <p className="text-sm text-muted-foreground">
          You do not have access to order lookup.
        </p>
      </div>
    );
  }

  const rows = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Search by order number, phone number, customer or shop name, or paste
          an order id.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <DataTableToolbar
          search={searchInput}
          onSearchChange={(value) => {
            setSearchInput(value);
            setPage(1);
          }}
          searchPlaceholder="Phone number, name, or order id…"
          filters={
            <div className="flex flex-wrap items-center gap-2">
              <StatusFilterChips
                chips={BUCKETS.map((bucket) => ({
                  value: bucket,
                  label: ORDER_BUCKET_LABELS[bucket],
                }))}
                selected={buckets}
                onChange={(next) => {
                  setBuckets(next);
                  setPage(1);
                }}
              />
              <Button
                size="sm"
                variant={outstandingOnly ? "destructive" : "outline"}
                className="h-7 px-2 text-xs"
                aria-pressed={outstandingOnly}
                onClick={() => {
                  setOutstandingOnly((on) => !on);
                  setPage(1);
                }}
              >
                Owes money
              </Button>
            </div>
          }
          limit={limit}
          onLimitChange={(next) => {
            setLimit(next);
            setPage(1);
          }}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />

        <DataTable
        tableId="orders"
        dataUpdatedAt={dataUpdatedAt}
          columns={columns}
          data={rows}
          isLoading={isPending}
          isError={isError}
          emptyMessage={
            debouncedSearch.trim()
              ? `Nothing matches "${debouncedSearch.trim()}". Try the customer's phone number, or their name.`
              : "No orders match these filters."
          }
          onRowClick={(row) => router.push(`/orders/${row._id}`)}
          enableColumnVisibility
          csvFileName="lalaba-orders"
        />

        {data != null && (
          <p className="text-xs text-muted-foreground">
            {data.total} order{data.total === 1 ? "" : "s"} found.
          </p>
        )}
      </div>
    </div>
  );
}
