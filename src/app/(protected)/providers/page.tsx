"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarOffIcon } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ACCOUNT_STATUS } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  PROVIDER_SUSPENSION_REASONS,
  ReasonCodeDialog,
} from "@/components/ui/reason-code-dialog";
import { DataTable, SortableHeader } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { RequireCapability, useCan } from "@/components/can";
import { SpecialDatesDialog } from "@/components/booking/special-dates-dialog";
import { useDeepLinkedId } from "@/hooks/use-deep-linked-id";
import { ApiError } from "@/lib/api-client";
import {
  describeCap,
  listWasherCaps,
  parseCapInput,
  reactivateWasher,
  setWasherDailyOrderCap,
  suspendWasher,
  type WasherCapRow,
} from "@/lib/graphql/washer-caps";

/**
 * THE PROVIDER DIRECTORY — every bookable provider, and the decisions Lalaba
 * makes about one of them.
 *
 * Called "Washers" at /washers until Phase 0, while `bookingProviders` has
 * always returned laundromat branches alongside home washers. The name
 * described a subset of the contents, and two of the three row controls were
 * silently washer-only underneath it — a laundromat row carried a Suspend
 * button that could only ever throw "Washer profile not found".
 *
 * Its own page, not a section of Booking Policy: that page is ONE record
 * evaluated against every provider, and its whole point is that a rule change
 * never means a per-provider write. Everything here is the opposite — a
 * deliberate override for one provider.
 *
 * Blank cap = no cap, and that is a real state rather than a missing value.
 * Nothing fills in behind it: the backend skips the check entirely, and how
 * many slots she can be booked into is still governed by the platform booking
 * policy.
 */

function CapCell({
  row,
  disabled,
  saving,
  onSave,
}: {
  row: WasherCapRow;
  disabled: boolean;
  saving: boolean;
  onSave: (branchId: string, cap: number | null) => void;
}) {
  const stored = row.maxOrdersPerDay == null ? "" : String(row.maxOrdersPerDay);
  const [value, setValue] = useState(stored);

  // No effect re-syncs this against `stored`: the caller keys this component on
  // the saved value, so a change underneath (another admin, or our own refetch)
  // remounts it with the new value as the initial state. Resetting state with a
  // key rather than in an effect avoids the cascading render.
  const parsed = parseCapInput(value);
  const invalid = Number.isNaN(parsed as number);
  const dirty = value.trim() !== stored;

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="No cap"
        inputMode="numeric"
        disabled={disabled || saving}
        aria-invalid={invalid}
        aria-label={`Daily order cap for ${row.name}`}
        className="w-28"
      />
      <Button
        size="sm"
        variant="outline"
        // Nothing to save unless it changed, and 0/negatives are rejected here
        // rather than round-tripping to a backend error.
        disabled={disabled || saving || !dirty || invalid}
        onClick={() => onSave(row.branchId, parsed as number | null)}
      >
        {saving ? "Saving…" : "Save"}
      </Button>
      {invalid && (
        <span className="text-sm text-destructive">
          Whole number, 1 or more — or blank for no cap.
        </span>
      )}
    </div>
  );
}

const PROVIDER_TYPE_LABELS: Record<WasherCapRow["providerType"], string> = {
  WASHER: "Home washer",
  MERCHANT: "Laundromat",
};

const PROVIDER_TYPE_TABS = [
  { value: "ALL", label: "All" },
  { value: "MERCHANT", label: "Laundromats" },
  { value: "WASHER", label: "Home washers" },
] as const;

function columns(
  canSuspend: boolean,
  canSetCap: boolean,
  savingBranchId: string | null,
  onSave: (branchId: string, cap: number | null) => void,
  workingBranchId: string | null,
  onRequestSuspend: (row: WasherCapRow) => void,
  onRequestReactivate: (row: WasherCapRow) => void,
  onOpenSpecialDates: (row: WasherCapRow) => void,
): ColumnDef<WasherCapRow>[] {
  return [
    {
      id: "name",
      header: ({ column }) => <SortableHeader column={column}>Provider</SortableHeader>,
      meta: { label: "Provider" },
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-sm text-muted-foreground">
            {row.original.stateLabel}
          </div>
        </div>
      ),
    },
    {
      id: "type",
      header: ({ column }) => <SortableHeader column={column}>Type</SortableHeader>,
      meta: { label: "Type" },
      accessorFn: (row) => PROVIDER_TYPE_LABELS[row.providerType],
      cell: ({ row }) => (
        <Badge variant="outline">
          {PROVIDER_TYPE_LABELS[row.original.providerType]}
        </Badge>
      ),
    },
    {
      id: "status",
      header: ({ column }) => (
        <SortableHeader column={column}>Account status</SortableHeader>
      ),
      meta: { label: "Account status" },
      accessorFn: (row) => row.washerStatus,
      cell: ({ row }) => {
        // Suspension is a WASHER concept. suspendWasher/reactivateWasher both
        // resolve a WasherProfile by branchId and throw "Washer profile not
        // found" for a laundromat branch — and this list has always contained
        // laundromat branches, so every one of them carried a Suspend button
        // that could only ever fail. A laundromat's account status is managed
        // from Merchant accounts, against the owner's user record.
        if (row.original.providerType !== "WASHER") {
          return (
            <span className="text-sm text-muted-foreground">
              Managed in Merchant accounts
            </span>
          );
        }
        const status = row.original.washerStatus;
        const isSuspended = status === "SUSPENDED";
        const isWorking = workingBranchId === row.original.branchId;
        return (
          <div className="flex items-center gap-2">
            <StatusBadge
              status={isSuspended ? "SUSPENDED" : "ACTIVE"}
              registry={ACCOUNT_STATUS}
            />
            {canSuspend && (
              <Button
                size="sm"
                variant="outline"
                disabled={isWorking}
                onClick={() =>
                  isSuspended
                    ? onRequestReactivate(row.original)
                    : onRequestSuspend(row.original)
                }
              >
                {isWorking
                  ? "Working…"
                  : isSuspended
                    ? "Reactivate"
                    : "Suspend"}
              </Button>
            )}
          </div>
        );
      },
    },
    {
      id: "cap",
      header: "Daily order cap",
      // describeCap, not the raw number: "No cap" is a real state here and an
      // empty CSV cell would read as missing data instead.
      accessorFn: (row) =>
        row.providerType === "WASHER" ? describeCap(row.maxOrdersPerDay) : "—",
      cell: ({ row }) =>
        // Same reason as the status cell above: setWasherDailyOrderCap is
        // washer-only, and maxOrdersPerDay is always null for a laundromat.
        // A branch's capacity is its own booking config, not a Lalaba override.
        row.original.providerType !== "WASHER" ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : canSetCap ? (
          <CapCell
            key={`${row.original.branchId}:${row.original.maxOrdersPerDay ?? "none"}`}
            row={row.original}
            disabled={!canSetCap}
            saving={savingBranchId === row.original.branchId}
            onSave={onSave}
          />
        ) : (
          <Badge variant={row.original.maxOrdersPerDay == null ? "outline" : "secondary"}>
            {describeCap(row.original.maxOrdersPerDay)}
          </Badge>
        ),
    },
    {
      id: "specialDates",
      header: "Special dates",
      // Not sortable and not exported as a value: it opens a per-provider
      // editor rather than reporting one.
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onOpenSpecialDates(row.original)}
        >
          <CalendarOffIcon />
          {/* "Manage" promises an edit. Support opens this dialog read-only —
              every mutation behind it is admin — so the button says what that
              operator will actually be able to do. */}
          {canSetCap ? "Manage" : "View"}
        </Button>
      ),
    },
  ];
}

export default function ProvidersPage() {
  return (
    <RequireCapability capability="provider:read">
      <ProvidersWorkspace />
    </RequireCapability>
  );
}

function ProvidersWorkspace() {
  const { can } = useCan();
  // Two separate capabilities rather than one isAdmin flag: support can now
  // READ this directory (bookingProviders is @Roles('admin', 'support')), and
  // both writes stay admin-only, so the row has to render both ways.
  const canSuspend = can("provider:suspend");
  const canSetCap = can("provider:set_cap");
  const queryClient = useQueryClient();
  const [savingBranchId, setSavingBranchId] = useState<string | null>(null);
  const [specialDatesTarget, setSpecialDatesTarget] =
    useState<WasherCapRow | null>(null);
  // `bookingProviders` returns home washers AND laundromat branches in one
  // list. The page was called Washers and showed both, which is the reason
  // this control exists: the mixture is real, so name it rather than hide it.
  const [providerType, setProviderType] = useState<"ALL" | "WASHER" | "MERCHANT">(
    "ALL",
  );

  const { data, isPending, isError } = useQuery({
    queryKey: ["washer-caps"],
    queryFn: listWasherCaps,
    placeholderData: keepPreviousData,
  });

  const washers = useMemo(() => data ?? [], [data]);
  // Caps are a home-washer concept — `maxOrdersPerDay` is always null for a
  // laundromat branch — so this counts against the washer total, not against
  // every provider in the list.
  const cappedCount = useMemo(
    () => washers.filter((w) => w.maxOrdersPerDay != null).length,
    [washers],
  );

  // The backend has no paginated query for this — it's a small, deliberately
  // whole-fetched list (same pattern as washer-services/platform-fees), so
  // this filters client-side rather than round-tripping a search param.
  // The omnibox links to a branch; without this it would land on the whole
  // directory and the operator would search twice.
  const [linkedBranchId, setLinkedBranchId] = useDeepLinkedId("branch");
  const [search, setSearch] = useState("");
  const filteredWashers = useMemo(() => {
    // A linked branch wins over every other filter: an operator who arrived
    // from search asked for one provider, not for a filtered list that might
    // exclude it.
    if (linkedBranchId) {
      return washers.filter((w) => w.branchId === linkedBranchId);
    }
    const term = search.trim().toLowerCase();
    return washers.filter((w) => {
      if (providerType !== "ALL" && w.providerType !== providerType) return false;
      return !term || w.name.toLowerCase().includes(term);
    });
  }, [washers, search, providerType, linkedBranchId]);

  const washerCount = useMemo(
    () => washers.filter((w) => w.providerType === "WASHER").length,
    [washers],
  );

  const capMutation = useMutation({
    mutationFn: ({ branchId, cap }: { branchId: string; cap: number | null }) =>
      setWasherDailyOrderCap(branchId, cap),
    onMutate: ({ branchId }) => setSavingBranchId(branchId),
    onSuccess: (_saved, { branchId, cap }) => {
      const name =
        washers.find((w) => w.branchId === branchId)?.name ?? "This washer";
      toast.success(
        cap == null
          ? `${name} now has no daily order cap.`
          : `${name} capped at ${cap} ${cap === 1 ? "order" : "orders"} a day.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["washer-caps"] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not save the cap.",
      ),
    onSettled: () => setSavingBranchId(null),
  });

  const [confirmTarget, setConfirmTarget] = useState<{
    row: WasherCapRow;
    action: "suspend" | "reactivate";
  } | null>(null);
  const [workingBranchId, setWorkingBranchId] = useState<string | null>(null);

  const statusMutation = useMutation({
    mutationFn: ({
      branchId,
      action,
      reason,
      note,
    }: {
      branchId: string;
      action: "suspend" | "reactivate";
      reason?: string;
      note?: string | null;
    }) =>
      action === "suspend"
        ? suspendWasher(branchId, reason!, note)
        : reactivateWasher(branchId, note),
    onMutate: ({ branchId }) => setWorkingBranchId(branchId),
    onSuccess: (_saved, { branchId, action }) => {
      const name =
        washers.find((w) => w.branchId === branchId)?.name ?? "This washer";
      toast.success(
        action === "suspend"
          ? `${name} has been suspended and can no longer log in.`
          : `${name} has been reactivated.`,
      );
      setConfirmTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["washer-caps"] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not update this washer's status.",
      ),
    onSettled: () => setWorkingBranchId(null),
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Providers</h1>
        <p className="text-sm text-muted-foreground">
          Every bookable provider — home washers and laundromat branches alike —
          with the per-provider decisions only Lalaba makes: the daily order cap,
          account status, and special dates. Platform-wide rules live in Booking
          Policy, which is one record evaluated against all of them.
        </p>
      </div>

      {linkedBranchId && (
        // Never silently show a filtered list as if it were everything.
        <div className="flex items-center gap-3 rounded-md border p-3 text-sm">
          <span>Showing one provider, opened from search.</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLinkedBranchId(null)}
          >
            Show all providers
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-fit items-center gap-1 rounded-lg bg-muted p-0.5">
          {PROVIDER_TYPE_TABS.map((tab) => (
            <Button
              key={tab.value}
              type="button"
              size="sm"
              variant={providerType === tab.value ? "outline" : "ghost"}
              className={providerType === tab.value ? "h-7 bg-background px-2 text-xs" : "h-7 px-2 text-xs"}
              aria-pressed={providerType === tab.value}
              onClick={() => setProviderType(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by provider name…"
          className="max-w-sm"
          aria-label="Search providers"
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {isPending
          ? "Loading…"
          : isError
            ? "Could not load providers."
            : // Caps are counted against home washers rather than against the
              // whole list, because a laundromat branch can never have one.
              `${washers.length} provider${washers.length === 1 ? "" : "s"} · ${cappedCount} of ${washerCount} home washer${washerCount === 1 ? "" : "s"} capped`}
      </p>

      <DataTable
        tableId="providers"
        columns={columns(
          canSuspend,
          canSetCap,
          savingBranchId,
          (branchId, cap) => capMutation.mutate({ branchId, cap }),
          workingBranchId,
          (row) => setConfirmTarget({ row, action: "suspend" }),
          (row) => setConfirmTarget({ row, action: "reactivate" }),
          (row) => setSpecialDatesTarget(row),
        )}
        data={filteredWashers}
        isLoading={isPending}
        // Without this the table falls through to emptyMessage on a failed
        // fetch and states "No providers yet" — an outright false claim about
        // the platform, not just a missing one.
        isError={isError}
        errorMessage="Could not load the provider directory. Refresh to try again."
        // Safe to sort and export here: listWasherCaps returns every washer
        // and the search filters client-side, so the table holds the whole
        // set. Server-paginated tables must NOT enable these — sorting one
        // page of 25 and calling it sorted is a lie.
        enableSorting
        enableColumnVisibility
        csvFileName="lalaba-providers"
        emptyMessage={
          search.trim() || providerType !== "ALL"
            ? "No providers match your filters."
            : "No providers yet."
        }
      />

      {/* Two dialogs, not one. Suspending takes a washer's livelihood away
          and is now recorded in the platform audit trail with a structured
          reason; reactivating restores the default state and has no taxonomy
          worth counting, so it stays a plain confirmation. */}
      <ReasonCodeDialog
        open={confirmTarget?.action === "suspend"}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title="Suspend this washer?"
        description={
          confirmTarget
            ? `${confirmTarget.row.name} will be immediately signed out and unable to log in, and already stops appearing in customer discovery. This can be reversed later with "Reactivate".`
            : undefined
        }
        reasons={PROVIDER_SUSPENSION_REASONS}
        confirmLabel="Suspend"
        pending={statusMutation.isPending}
        onConfirm={(reason, note) =>
          confirmTarget &&
          statusMutation.mutate({
            branchId: confirmTarget.row.branchId,
            action: "suspend",
            reason,
            note,
          })
        }
      />

      <SpecialDatesDialog
        branchId={specialDatesTarget?.branchId ?? null}
        providerName={specialDatesTarget?.name ?? ""}
        open={specialDatesTarget != null}
        onOpenChange={(next) => !next && setSpecialDatesTarget(null)}
        // Support can read a provider's special dates — it is the answer to
        // "why can't I book her on the 25th?" — but every mutation behind
        // this dialog is admin-only, so it opens read-only without them.
        canEdit={canSetCap}
      />

      <ConfirmDialog
        open={confirmTarget?.action === "reactivate"}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title="Reactivate this washer?"
        description={`${confirmTarget?.row.name} will be able to log in again immediately.`}
        confirmLabel="Reactivate"
        onConfirm={() =>
          confirmTarget &&
          statusMutation.mutate({
            branchId: confirmTarget.row.branchId,
            action: "reactivate",
          })
        }
      />
    </div>
  );
}
