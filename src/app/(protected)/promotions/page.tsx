"use client";

import { useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";

import { RequireCapability, useCan } from "@/components/can";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { PROMO_STATUS } from "@/lib/status";
import { PromoFormSheet } from "@/components/promotions/promo-form-sheet";
import { PromoDetailDrawer } from "@/components/promotions/promo-detail-drawer";
import { ApiError } from "@/lib/api-client";
import {
  derivePromoStatus,
  PROMO_STATUS_LABELS,
  createPromoCode,
  listPromoCodes,
  redeemPromoCode,
  setPromoCodeActive,
  updatePromoCode,
  type CreatePromoInput,
  type PromoCode,
  type PromoStatus,
  type UpdatePromoInput,
} from "@/lib/graphql/promotions";

type StatusFilter = PromoStatus | "all";

function peso(centavos: number) {
  return `₱${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 0 })}`;
}

function columns(onOpen: (promo: PromoCode) => void): ColumnDef<PromoCode>[] {
  return [
    {
      id: "code",
      header: "Code",
      cell: ({ row }) => (
        <button
          type="button"
          className="text-left font-medium underline-offset-4 hover:underline"
          onClick={() => onOpen(row.original)}
        >
          {row.original.code}
        </button>
      ),
    },
    {
      id: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.description}</span>
      ),
    },
    {
      id: "discount",
      header: "Discount",
      cell: ({ row }) => {
        const promo = row.original;
        return (
          <span className="whitespace-nowrap tabular-nums">
            {promo.discountType === "FLAT"
              ? peso(promo.discountValue * 100)
              : `${promo.discountValue}%`}
          </span>
        );
      },
    },
    {
      id: "usage",
      header: "Redemptions",
      cell: ({ row }) => {
        const promo = row.original;
        return (
          <span className="whitespace-nowrap tabular-nums">
            {promo.usageCapTotal
              ? `${promo.redemptionCount} / ${promo.usageCapTotal}`
              : promo.redemptionCount}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = derivePromoStatus(row.original);
        return (
          <StatusBadge
            status={status}
            registry={PROMO_STATUS}
            label={PROMO_STATUS_LABELS[status]}
          />
        );
      },
    },
  ];
}

function PromotionsPage() {
  const { can } = useCan();
  const canManage = can("promo:manage");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [detailFor, setDetailFor] = useState<PromoCode | null>(null);

  // Bounded by campaign count, not traffic — fetched whole and filtered
  // client-side, same rationale as the fee rules and washer service pages.
  // 200 is the backend's own cap (PromoFilterInput.limit, @Max(200)).
  const { data, isPending, isError } = useQuery({
    queryKey: ["promo-codes"],
    queryFn: () => listPromoCodes({ limit: 200, offset: 0 }),
    placeholderData: keepPreviousData,
  });

  const promos = useMemo(() => data?.data ?? [], [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return promos.filter((promo) => {
      if (statusFilter !== "all" && derivePromoStatus(promo) !== statusFilter) return false;
      if (!term) return true;
      return (
        promo.code.toLowerCase().includes(term) ||
        promo.description.toLowerCase().includes(term)
      );
    });
  }, [promos, search, statusFilter]);

  const counts = useMemo(() => {
    const byStatus = new Map<PromoStatus, number>();
    for (const promo of promos) {
      const status = derivePromoStatus(promo);
      byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
    }
    return byStatus;
  }, [promos]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["promo-codes"] });
  }

  function invalidateDetail(id: string) {
    void queryClient.invalidateQueries({ queryKey: ["promo-usage-summary", id] });
  }

  const saveMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string | null;
      input: CreatePromoInput | UpdatePromoInput;
    }) => (id ? updatePromoCode(id, input) : createPromoCode(input as CreatePromoInput)),
    onSuccess: (saved, { id }) => {
      toast.success(id ? `${saved.code} updated.` : `${saved.code} created.`);
      setSheetOpen(false);
      setEditing(null);
      setSheetError(null);
      invalidate();
      setDetailFor((prev) => (prev && prev._id === saved._id ? saved : prev));
    },
    onError: (err) =>
      setSheetError(err instanceof ApiError ? err.message : "Could not save the promo code."),
  });

  const activeMutation = useMutation({
    mutationFn: (promo: PromoCode) => setPromoCodeActive(promo._id, !promo.isActive),
    onSuccess: (_, promo) => {
      toast.success(promo.isActive ? `${promo.code} disabled.` : `${promo.code} enabled.`);
      invalidate();
      setDetailFor((prev) =>
        prev && prev._id === promo._id ? { ...prev, isActive: !promo.isActive } : prev,
      );
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not change the promo code."),
  });

  const redeemMutation = useMutation({
    mutationFn: ({
      promo,
      customerUid,
      orderTotalCentavos,
      reason,
    }: {
      promo: PromoCode;
      customerUid: string;
      orderTotalCentavos: number;
      reason: string;
    }) =>
      redeemPromoCode({ code: promo.code, customerUid, orderTotalCentavos }, reason),
    onSuccess: (_, { promo }) => {
      toast.success(`Redemption recorded for ${promo.code}.`);
      invalidate();
      invalidateDetail(promo._id);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not record the redemption."),
  });

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Promo Codes</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Discount codes for customers, washers, merchants, staff and
            couriers. There is no live checkout redemption flow yet — every
            redemption recorded here today is a support or admin action taken
            on someone&apos;s behalf, with a reason on file.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setSheetError(null);
              setSheetOpen(true);
            }}
          >
            Create promo code
          </Button>
        )}
      </div>

      {promos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search codes…"
            className="max-w-xs"
          />
          <Select
            value={statusFilter}
            onValueChange={(v) => v && setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="w-44">
              <SelectValue>
                {(v: StatusFilter) => (v === "all" ? "All statuses" : PROMO_STATUS_LABELS[v])}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(PROMO_STATUS_LABELS) as PromoStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {PROMO_STATUS_LABELS[s]} ({counts.get(s) ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isError ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <h2 className="font-medium text-destructive">Failed to load promo codes</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Something went wrong loading promo codes. Please try again.
          </p>
        </div>
      ) : !isPending && promos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <h2 className="font-medium">No promo codes yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Create one to give a set of customers or providers a discount.
          </p>
          {canManage && (
            <Button
              className="mt-4"
              onClick={() => {
                setEditing(null);
                setSheetError(null);
                setSheetOpen(true);
              }}
            >
              Create promo code
            </Button>
          )}
        </div>
      ) : (
        <DataTable
          columns={columns(setDetailFor)}
          data={filtered}
          isLoading={isPending}
          emptyMessage="No promo codes match these filters."
        />
      )}

      <PromoFormSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            setEditing(null);
            setSheetError(null);
          }
        }}
        promo={editing}
        submitting={saveMutation.isPending}
        error={sheetError}
        onSubmit={(input) => saveMutation.mutate({ id: editing?._id ?? null, input })}
      />

      <PromoDetailDrawer
        promo={detailFor}
        status={detailFor ? derivePromoStatus(detailFor) : null}
        onOpenChange={(open) => !open && setDetailFor(null)}
        onEdit={(promo) => {
          setDetailFor(null);
          setEditing(promo);
          setSheetError(null);
          setSheetOpen(true);
        }}
        onToggleActive={(promo) => activeMutation.mutate(promo)}
        toggling={activeMutation.isPending}
        onRedeem={(promo, args) => redeemMutation.mutate({ promo, ...args })}
        redeeming={redeemMutation.isPending}
      />
    </div>
  );
}

export default function PromotionsPageGuard() {
  return (
    <RequireCapability capability="promo:manage">
      <PromotionsPage />
    </RequireCapability>
  );
}
