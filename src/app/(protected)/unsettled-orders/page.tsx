"use client";

// Support's unpaid-money queue.
//
// Deferred settlement (§14) lets a customer take their laundry without paying
// and settle when it comes back. When that never happens the provider is left
// holding finished laundry nobody paid for, the abandonment sweep eventually
// writes the order off, and the platform hands back the fee the provider
// fronted. This is the only screen in the product where any of that is visible.

import { useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { StatusBadge, ToneBadge } from "@/components/ui/status-badge";
import { ORDER_STATUS } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { RequireCapability } from "@/components/can";
import {
  fetchUnsettledOrders,
  reinstateAbandonedOrder,
  peso,
  type UnsettledOrder,
} from "@/lib/graphql/unsettled-orders";

const QUERY_KEY = "unsettled-orders";
const PAGE_SIZE = 50;

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** How long until the sweep gives up on this order. */
function deadlineLabel(order: UnsettledOrder) {
  if (order.status === "ABANDONED_UNSETTLED") return "Written off";
  if (!order.abandonmentDeadlineAt) return "—";
  const ms = new Date(order.abandonmentDeadlineAt).getTime() - Date.now();
  if (ms <= 0) return "Due now";
  const hours = Math.round(ms / 3_600_000);
  return hours < 48 ? `${hours}h left` : `${Math.round(hours / 24)}d left`;
}

export default function UnsettledOrdersPage() {
  return (
    <RequireCapability capability="settlement:reinstate">
      <UnsettledOrdersWorkspace />
    </RequireCapability>
  );
}

function UnsettledOrdersWorkspace() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [target, setTarget] = useState<UnsettledOrder | null>(null);
  const [note, setNote] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [QUERY_KEY, page],
    queryFn: () => fetchUnsettledOrders(PAGE_SIZE, page * PAGE_SIZE),
    placeholderData: keepPreviousData,
  });

  const reinstate = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      reinstateAbandonedOrder(orderId, reason.trim() || undefined),
    onSuccess: () => {
      toast.success("Order reinstated — it is back in the return queue.");
      setTarget(null);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (e: unknown) => {
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't reinstate this order.",
      );
    },
  });

  const columns = useMemo<ColumnDef<UnsettledOrder>[]>(
    () => [
      {
        header: "Customer",
        accessorFn: (o) => o.customer.displayName,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.customer.displayName}</div>
            <div className="text-muted-foreground text-xs">
              {row.original.customer.maskedPhone ?? "—"}
            </div>
          </div>
        ),
      },
      {
        header: "Provider",
        accessorFn: (o) => o.provider.providerName,
      },
      {
        header: "Owed",
        accessorFn: (o) => o.amountDueCentavos,
        cell: ({ row }) => (
          <div>
            <div className="font-medium tabular-nums">
              {peso(row.original.amountDueCentavos)}
            </div>
            <div className="text-muted-foreground text-xs tabular-nums">
              of {peso(row.original.pricing.customerTotalCentavos)}
            </div>
          </div>
        ),
      },
      {
        header: "Payment",
        accessorFn: (o) => o.paymentStatus,
        cell: ({ row }) => {
          const o = row.original;
          // UNPAID means two different things now, so say which one this is.
          const label =
            o.paymentStatus === "BALANCE_DUE"
              ? "Balance due"
              : o.paymentTiming === "AT_FINAL_HANDOVER"
                ? "Pay later — unpaid"
                : "Unpaid";
          return <ToneBadge tone="danger">{label}</ToneBadge>;
        },
      },
      {
        header: "Status",
        accessorFn: (o) => o.status,
        cell: ({ row }) => (
          <StatusBadge status={row.original.status} registry={ORDER_STATUS} />
        ),
      },
      {
        header: "Write-off",
        accessorFn: (o) => o.abandonmentDeadlineAt ?? "",
        cell: ({ row }) => (
          <span className="text-sm">{deadlineLabel(row.original)}</span>
        ),
      },
      {
        header: "Placed",
        accessorFn: (o) => o.createdAt,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          row.original.status === "ABANDONED_UNSETTLED" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setTarget(row.original);
                setNote("");
              }}
            >
              Reinstate
            </Button>
          ) : null,
      },
    ],
    [],
  );

  if (isError) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Unsettled orders</h1>
        <p className="text-destructive mt-2 text-sm">
          {error instanceof ApiError
            ? error.message
            : "Couldn't load unsettled orders."}
        </p>
      </div>
    );
  }

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const owed = rows.reduce((sum, o) => sum + o.amountDueCentavos, 0);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Unsettled orders</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Orders that still owe money, and orders already written off. A customer
          who pays late can be put back in the queue with Reinstate.
        </p>
      </div>

      <div className="flex gap-6">
        <div>
          <div className="text-muted-foreground text-xs">Orders</div>
          <div className="text-xl font-semibold tabular-nums">{total}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">
            Owed on this page
          </div>
          <div className="text-xl font-semibold tabular-nums">{peso(owed)}</div>
        </div>
      </div>

      <DataTable
        tableId="unsettled-orders"
        columns={columns}
        data={rows}
        isLoading={isLoading}
        emptyMessage="No unsettled orders."
        // Export only — this queue is server-paginated, so the CSV covers the
        // current page (which is what is on screen). No sorting for the same
        // reason: it would only reorder the 50 rows already fetched.
        enableColumnVisibility
        csvFileName="lalaba-unsettled-orders"
      />

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of{" "}
            {total}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}

      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reinstate this order?</DialogTitle>
            <DialogDescription>
              {target
                ? `${target.customer.displayName} still owes ${peso(
                    target.amountDueCentavos,
                  )}. Reinstating puts the order back in the return queue so the
                   provider can hand the laundry over once it is paid. The
                   platform fee that was refunded on write-off is charged again
                   when the balance is finally collected.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this being reinstated? (optional, recorded on the order timeline)"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={reinstate.isPending}
              onClick={() =>
                target &&
                reinstate.mutate({ orderId: target._id, reason: note })
              }
            >
              {reinstate.isPending ? "Reinstating…" : "Reinstate order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
