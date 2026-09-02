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
import { FEE_RULE_STATUS } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { RequireCapability } from "@/components/can";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FeeRuleSheet } from "@/components/platform-fees/fee-rule-sheet";
import { FeeRuleHistoryDialog } from "@/components/platform-fees/fee-rule-history-dialog";
import { ProviderRequirements } from "@/components/platform-fees/provider-requirements";
import { useCan } from "@/components/can";
import { ApiError } from "@/lib/api-client";
import {
  CATEGORY_LABELS,
  CHARGED_TO_LABELS,
  PAYER_LABELS,
  RULE_STATUS_LABELS,
  createPlatformFeeRule,
  describeCalculation,
  isNonCharge,
  listPlatformFeeRules,
  ruleStatus,
  seedPlatformFeeRules,
  setPlatformFeeRuleActive,
  updatePlatformFeeRule,
  type FeePayerRole,
  type PlatformFeeRule,
  type PlatformFeeRuleInput,
  type RuleStatus,
} from "@/lib/graphql/platform-fees";

type PayerFilter = FeePayerRole | "all";
type StatusFilter = RuleStatus | "all";

/**
 * The summary cards double as payer filters (§1). Only the payers that
 * genuinely participate in the financial model get a card — Courier is a valid
 * payer in the schema but has no rules today, so giving it a permanent "0
 * rules" card would suggest a part of the model that doesn't exist yet.
 */
const SUMMARY_PAYERS: FeePayerRole[] = [
  "CUSTOMER",
  "HOME_WASHER",
  "LAUNDROMAT",
];

function statusBadge(status: RuleStatus) {
  return (
    <StatusBadge
      status={status}
      registry={FEE_RULE_STATUS}
      label={RULE_STATUS_LABELS[status]}
    />
  );
}

function columns(
  onEdit: (rule: PlatformFeeRule) => void,
  onHistory: (rule: PlatformFeeRule) => void,
  onToggleActive: (rule: PlatformFeeRule) => void,
  workingKey: string | null,
  canEdit: boolean,
): ColumnDef<PlatformFeeRule>[] {
  const base: ColumnDef<PlatformFeeRule>[] = [
    {
      id: "fee",
      header: "Fee",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-sm text-muted-foreground">
            {CATEGORY_LABELS[row.original.category]}
          </div>
        </div>
      ),
    },
    {
      id: "appliesTo",
      header: "Applies to",
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {PAYER_LABELS[row.original.appliesTo]}
        </span>
      ),
    },
    {
      id: "calculation",
      header: "Calculation",
      cell: ({ row }) => {
        const rule = row.original;
        return (
          <div className="whitespace-nowrap">
            <div className="tabular-nums">{describeCalculation(rule)}</div>
            <div className="text-sm text-muted-foreground">
              {/* A wallet minimum is not paid to anyone, so "paid by the
                  provider" would be actively wrong on those rows. */}
              {isNonCharge(rule.category)
                ? "Balance held, not charged"
                : `Paid by ${CHARGED_TO_LABELS[rule.chargedTo].toLowerCase()}`}
            </div>
          </div>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const rule = row.original;
        const status = ruleStatus(rule);
        return (
          <div className="flex flex-col items-start gap-1">
            {statusBadge(status)}
            {status === "scheduled" && (
              <span className="text-xs text-muted-foreground">
                from{" "}
                {new Date(rule.effectiveFrom).toLocaleDateString("en-PH", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "version",
      header: "Version",
      cell: ({ row }) => (
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => onHistory(row.original)}
        >
          v{row.original.version}
        </button>
      ),
    },
  ];

  if (!canEdit) return base;

  return [
    ...base,
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const rule = row.original;
        const isWorking = workingKey === rule.ruleKey;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => onEdit(rule)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={isWorking}
              onClick={() => onToggleActive(rule)}
            >
              {isWorking
                ? "Saving…"
                : rule.isActive
                  ? "Deactivate"
                  : "Reactivate"}
            </Button>
          </div>
        );
      },
    },
  ];
}

function PlatformFeesPage() {
  const { can } = useCan();
  const canEdit = can("fee:manage");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [payerFilter, setPayerFilter] = useState<PayerFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformFeeRule | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<PlatformFeeRule | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<PlatformFeeRule | null>(
    null,
  );

  // A handful of rows that every provider is priced by — fetched whole and
  // filtered client-side, like the washer service catalog. There is no
  // paginated admin query and there shouldn't need to be.
  const { data, isPending, isError } = useQuery({
    queryKey: ["platform-fee-rules"],
    queryFn: listPlatformFeeRules,
    placeholderData: keepPreviousData,
  });

  const rules = data ?? [];

  // The wallet minimums share the rule schema but are not charges, so they get
  // their own section below and are excluded from the fee table, the filters
  // and the counts — otherwise "Home Washer fees: 3" counts two things that
  // nobody is ever billed for.
  const feeRules = useMemo(
    () => rules.filter((rule) => !isNonCharge(rule.category)),
    [rules],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return feeRules.filter((rule) => {
      if (payerFilter !== "all" && rule.appliesTo !== payerFilter) return false;
      if (statusFilter !== "all" && ruleStatus(rule) !== statusFilter)
        return false;
      if (!term) return true;
      return (
        rule.name.toLowerCase().includes(term) ||
        (rule.description ?? "").toLowerCase().includes(term)
      );
    });
  }, [feeRules, search, payerFilter, statusFilter]);

  const counts = useMemo(() => {
    const byPayer = new Map<FeePayerRole, number>();
    let scheduled = 0;
    for (const rule of feeRules) {
      const status = ruleStatus(rule);
      if (status === "scheduled") scheduled += 1;
      if (status === "active" || status === "scheduled") {
        byPayer.set(rule.appliesTo, (byPayer.get(rule.appliesTo) ?? 0) + 1);
      }
    }
    return { byPayer, scheduled };
  }, [feeRules]);

  // The most recently published version across all rules — "last published".
  const lastPublished = useMemo(() => {
    let latest: PlatformFeeRule | null = null;
    for (const rule of rules) {
      if (
        !latest ||
        new Date(rule.createdAt ?? 0) > new Date(latest.createdAt ?? 0)
      ) {
        latest = rule;
      }
    }
    return latest;
  }, [rules]);

  function openEdit(rule: PlatformFeeRule) {
    setEditing(rule);
    setSheetError(null);
    setSheetOpen(true);
  }

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["platform-fee-rules"] });
  }

  const saveMutation = useMutation({
    mutationFn: ({
      ruleKey,
      input,
    }: {
      ruleKey: string | null;
      input: PlatformFeeRuleInput;
    }) =>
      ruleKey
        ? updatePlatformFeeRule(ruleKey, input)
        : createPlatformFeeRule(input),
    onSuccess: (saved, { ruleKey }) => {
      toast.success(
        ruleKey
          ? `${saved.name} published as version ${saved.version}.`
          : `${saved.name} created.`,
      );
      setSheetOpen(false);
      setEditing(null);
      setSheetError(null);
      invalidate();
    },
    // Shown inside the sheet, not as a toast: every failure here is a field
    // problem ("Allocation must total 100%"), and the sheet stays open to fix it.
    onError: (err) =>
      setSheetError(
        err instanceof ApiError
          ? err.message
          : "Could not publish the fee rule.",
      ),
  });

  const activeMutation = useMutation({
    mutationFn: (rule: PlatformFeeRule) =>
      setPlatformFeeRuleActive(rule.ruleKey, !rule.isActive),
    onSuccess: (_, rule) => {
      toast.success(
        rule.isActive
          ? `${rule.name} deactivated.`
          : `${rule.name} reactivated.`,
      );
      setConfirmTarget(null);
      invalidate();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Could not change the fee rule.",
      ),
  });

  const seedMutation = useMutation({
    mutationFn: seedPlatformFeeRules,
    onSuccess: (created) => {
      toast.success(
        created.length
          ? `${created.length} starting fee rules created at the current rate.`
          : "Fee rules already exist — nothing to create.",
      );
      invalidate();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Could not create the fee rules.",
      ),
  });

  const workingKey = activeMutation.isPending
    ? (activeMutation.variables?.ruleKey ?? null)
    : null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Platform Fees</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            What Lalaba charges, who pays it, how it is calculated and when it
            applies. Changes are published as new versions — completed
            transactions keep the rate they were priced at.
          </p>
          {lastPublished && (
            <p className="mt-1 text-sm text-muted-foreground">
              Last published{" "}
              {new Date(lastPublished.createdAt ?? "").toLocaleDateString(
                "en-PH",
                { year: "numeric", month: "short", day: "numeric" },
              )}
              {lastPublished.setByName ? ` · ${lastPublished.setByName}` : ""}
            </p>
          )}
        </div>
        {canEdit && rules.length > 0 && (
          <Button
            onClick={() => {
              setEditing(null);
              setSheetError(null);
              setSheetOpen(true);
            }}
          >
            Create fee rule
          </Button>
        )}
      </div>

      {/* ── Summary cards, which double as payer filters ─────────────────── */}
      {rules.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SUMMARY_PAYERS.map((payer) => {
            const selected = payerFilter === payer;
            return (
              <button
                key={payer}
                type="button"
                onClick={() => setPayerFilter(selected ? "all" : payer)}
                className="rounded-lg border p-4 text-left transition-colors hover:bg-accent data-[selected=true]:border-primary data-[selected=true]:bg-accent"
                data-selected={selected}
              >
                <div className="text-sm text-muted-foreground">
                  {PAYER_LABELS[payer]} fees
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {counts.byPayer.get(payer) ?? 0}
                </div>
                <div className="text-sm text-muted-foreground">
                  {(counts.byPayer.get(payer) ?? 0) === 1 ? "rule" : "rules"} in
                  force
                </div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() =>
              setStatusFilter(
                statusFilter === "scheduled" ? "all" : "scheduled",
              )
            }
            className="rounded-lg border p-4 text-left transition-colors hover:bg-accent data-[selected=true]:border-primary data-[selected=true]:bg-accent"
            data-selected={statusFilter === "scheduled"}
          >
            <div className="text-sm text-muted-foreground">Scheduled</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {counts.scheduled}
            </div>
            <div className="text-sm text-muted-foreground">
              not yet in effect
            </div>
          </button>
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      {rules.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fees…"
            className="max-w-xs"
          />
          <Select
            value={payerFilter}
            onValueChange={(v) => v && setPayerFilter(v as PayerFilter)}
          >
            <SelectTrigger className="w-44">
              {/* Base UI renders the raw value ("all", "HOME_WASHER") unless
                  given a formatter. */}
              <SelectValue>
                {(v: PayerFilter) =>
                  v === "all" ? "All payers" : PAYER_LABELS[v]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payers</SelectItem>
              {SUMMARY_PAYERS.concat("COURIER").map((p) => (
                <SelectItem key={p} value={p}>
                  {PAYER_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => v && setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="w-40">
              <SelectValue>
                {(v: StatusFilter) =>
                  v === "all" ? "All statuses" : RULE_STATUS_LABELS[v]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── Error state ──────────────────────────────────────────────────── */}
      {isError ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <h2 className="font-medium text-destructive">
            Failed to load fee rules
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Something went wrong loading platform fee rules. Please try again.
          </p>
        </div>
      ) : /* ── Empty state ────────────────────────────────────────────────── */
      !isPending && rules.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <h2 className="font-medium">No fee rules yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            This environment is still on the single global commission. Create
            the starting rule set to carry that rate across unchanged — one
            commission per provider type, plus the wallet minimums. No prices
            change.
          </p>
          {canEdit && (
            <Button
              className="mt-4"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
            >
              {seedMutation.isPending
                ? "Creating…"
                : "Create starting fee rules"}
            </Button>
          )}
        </div>
      ) : (
        <>
          <DataTable
            columns={columns(
              openEdit,
              setHistoryFor,
              setConfirmTarget,
              workingKey,
              canEdit,
            )}
            data={filtered}
            isLoading={isPending}
            emptyMessage="No fees match these filters."
          />

          <ProviderRequirements
            rules={rules}
            canEdit={canEdit}
            onEdit={openEdit}
          />
        </>
      )}

      <FeeRuleSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            setEditing(null);
            setSheetError(null);
          }
        }}
        rule={editing}
        submitting={saveMutation.isPending}
        error={sheetError}
        onSubmit={(input) =>
          saveMutation.mutate({ ruleKey: editing?.ruleKey ?? null, input })
        }
      />

      <FeeRuleHistoryDialog
        rule={historyFor}
        onOpenChange={(open) => !open && setHistoryFor(null)}
      />

      <ConfirmDialog
        open={!!confirmTarget}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title={
          confirmTarget?.isActive
            ? "Deactivate this fee?"
            : "Reactivate this fee?"
        }
        description={
          confirmTarget &&
          (confirmTarget.isActive
            ? `"${confirmTarget.name}" stops applying to new ${PAYER_LABELS[confirmTarget.appliesTo]} transactions immediately. ${
                confirmTarget.category === "COMMISSION"
                  ? "With no commission rule in force, new orders fall back to the platform default rate — they do not become free."
                  : "Existing completed transactions are not affected."
              } This publishes a new version and is recorded in the history.`
            : `"${confirmTarget.name}" starts applying to new ${PAYER_LABELS[confirmTarget.appliesTo]} transactions again.`)
        }
        confirmLabel={confirmTarget?.isActive ? "Deactivate" : "Reactivate"}
        onConfirm={() => confirmTarget && activeMutation.mutate(confirmTarget)}
      />
    </div>
  );
}

export default function PlatformFeesPageGuard() {
  return (
    <RequireCapability capability="fee:manage">
      <PlatformFeesPage />
    </RequireCapability>
  );
}
