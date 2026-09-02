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
import { StatusBadge } from "@/components/ui/status-badge";
import { ACCOUNT_STATUS } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ACCOUNT_DEACTIVATION_REASONS,
  ReasonCodeDialog,
} from "@/components/ui/reason-code-dialog";
import { DataTable } from "@/components/ui/data-table";
import {
  DataTableToolbar,
  PAGE_SIZE_OPTIONS,
} from "@/components/ui/data-table-toolbar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireCapability, useCan } from "@/components/can";
import { ApiError } from "@/lib/api-client";
import {
  deactivateUser,
  listMerchants,
  reactivateUser,
  type MerchantRow,
} from "@/lib/graphql/merchants";

function columns(
  isAdmin: boolean,
  onDeactivate: (m: MerchantRow) => void,
  onReactivate: (m: MerchantRow) => void,
  workingId: string | null,
): ColumnDef<MerchantRow>[] {
  const base: ColumnDef<MerchantRow>[] = [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => `${row.original.firstName} ${row.original.lastName}`,
    },
    { accessorKey: "email", header: "Email" },
    { accessorKey: "phoneNumber", header: "Phone" },
    {
      id: "branchCount",
      header: "Branches",
      cell: ({ row }) => row.original.branchCount,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        row.original.isActive ? (
          <StatusBadge status="ACTIVE" registry={ACCOUNT_STATUS} />
        ) : (
          <StatusBadge
            status="SUSPENDED"
            registry={ACCOUNT_STATUS}
            label="Deactivated"
          />
        ),
    },
    {
      id: "createdAt",
      header: "Created",
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
    },
  ];

  if (!isAdmin) return base;

  return [
    ...base,
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const m = row.original;
        const isWorking = workingId === m._id;
        return m.isActive ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={isWorking}
            onClick={() => onDeactivate(m)}
          >
            {isWorking ? "Deactivating…" : "Deactivate"}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={isWorking}
            onClick={() => onReactivate(m)}
          >
            {isWorking ? "Reactivating…" : "Reactivate"}
          </Button>
        );
      },
    },
  ];
}

function MerchantsWorkspace() {
  const { can } = useCan();
  const isAdmin = can("provider:suspend");
  const queryClient = useQueryClient();

  const [confirmTarget, setConfirmTarget] = useState<{
    merchant: MerchantRow;
    action: "deactivate" | "reactivate";
  } | null>(null);

  // Already-debounced by the time DataTableToolbar calls onSearchChange —
  // it owns the raw input value + debounce internally.
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "deactivated">("all");
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [pageIndex, setPageIndex] = useState(0);

  const filter = useMemo(
    () => ({
      search: search.trim() || undefined,
      isActive: statusFilter === "all" ? undefined : statusFilter === "active",
      limit: pageSize,
      offset: pageIndex * pageSize,
    }),
    [search, statusFilter, pageSize, pageIndex],
  );

  const { data, isPending } = useQuery({
    queryKey: ["merchants", filter],
    queryFn: () => listMerchants(filter),
    // Hold the current page while the next one loads, and treat only the very
    // first load as "loading" — isFetching is also true on every background
    // refetch, which blanked the table on each filter/page change.
    placeholderData: keepPreviousData,
  });
  const merchants = data?.data ?? [];
  const total = data?.total ?? 0;

  function handleStatusFilterChange(value: string | null) {
    if (!value) return;
    setStatusFilter(value as typeof statusFilter);
    setPageIndex(0);
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Deactivate/reactivate are the same shape (uid in, refetch list, toast) —
  // one mutation keyed by `action` keeps the per-row "working" state as a
  // single source of truth instead of two parallel ones.
  const statusMutation = useMutation({
    mutationFn: ({
      merchant,
      action,
      reason,
      note,
    }: {
      merchant: MerchantRow;
      action: "deactivate" | "reactivate";
      reason?: string;
      note?: string | null;
    }) =>
      action === "deactivate"
        ? deactivateUser(merchant._id, reason!, note)
        : reactivateUser(merchant._id, note),
    onSuccess: (_, { merchant, action }) => {
      toast.success(
        action === "deactivate"
          ? `${merchant.firstName} ${merchant.lastName} deactivated.`
          : `${merchant.firstName} ${merchant.lastName} reactivated.`,
      );
      setConfirmTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["merchants"] });
    },
    onError: (err, { action }) =>
      toast.error(
        err instanceof ApiError ? err.message : `Could not ${action} merchant.`,
      ),
  });

  function requestDeactivate(merchant: MerchantRow) {
    setConfirmTarget({ merchant, action: "deactivate" });
  }

  function requestReactivate(merchant: MerchantRow) {
    setConfirmTarget({ merchant, action: "reactivate" });
  }

  function confirmReactivate() {
    if (!confirmTarget) return;
    statusMutation.mutate(confirmTarget);
  }

  const workingId =
    statusMutation.isPending ? (statusMutation.variables?.merchant._id ?? null) : null;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Merchants</h1>
        <p className="text-sm text-muted-foreground">
          Business owners using Lalaba, and the branches they run.
        </p>
      </div>

      <DataTableToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPageIndex(0);
        }}
        searchPlaceholder="Search by name or email…"
        filters={
          <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
            <SelectTrigger className="w-40">
              <SelectValue labels={MERCHANT_STATUS_LABELS} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="deactivated">Deactivated</SelectItem>
            </SelectContent>
          </Select>
        }
        limit={pageSize}
        onLimitChange={(limit) => {
          setPageSize(limit);
          setPageIndex(0);
        }}
        page={pageIndex + 1}
        totalPages={pageCount}
        onPageChange={(page) => setPageIndex(page - 1)}
      />

      <DataTable
        tableId="merchant-accounts"
        columns={columns(isAdmin, requestDeactivate, requestReactivate, workingId)}
        data={merchants}
        isLoading={isPending}
        emptyMessage="No merchants match these filters."
      />

      {/* Deactivation is recorded in the platform audit trail with a
          structured reason, so it gets the reason dialog; reactivating
          restores the default state and stays a plain confirmation. */}
      <ReasonCodeDialog
        open={confirmTarget?.action === "deactivate"}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title="Deactivate this merchant?"
        description={
          confirmTarget
            ? `${confirmTarget.merchant.firstName} ${confirmTarget.merchant.lastName} (${confirmTarget.merchant.email}) will lose access immediately. This can be reversed later with "Reactivate".`
            : undefined
        }
        reasons={ACCOUNT_DEACTIVATION_REASONS}
        confirmLabel="Deactivate"
        pending={statusMutation.isPending}
        onConfirm={(reason, note) =>
          confirmTarget &&
          statusMutation.mutate({ ...confirmTarget, reason, note })
        }
      />

      <ConfirmDialog
        open={confirmTarget?.action === "reactivate"}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title="Reactivate this merchant?"
        description={
          confirmTarget
            ? `${confirmTarget.merchant.firstName} ${confirmTarget.merchant.lastName} (${confirmTarget.merchant.email}) will regain access immediately.`
            : undefined
        }
        confirmLabel="Reactivate"
        onConfirm={confirmReactivate}
      />
    </div>
  );
}

// Same capability the sidebar entry uses, so typing the URL and clicking the
// link can never disagree — every other page in the panel pairs the two this
// way and this one was the exception.
const MERCHANT_STATUS_LABELS: Record<string, string> = {
  all: "All statuses",
  active: "Active",
  deactivated: "Deactivated",
};

export default function MerchantsPage() {
  return (
    <RequireCapability capability="account:read">
      <MerchantsWorkspace />
    </RequireCapability>
  );
}
