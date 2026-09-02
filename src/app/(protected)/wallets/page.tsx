"use client";

// Provider wallet oversight.
//
// The wallet is prepaid and consumable — providers top it up, the platform
// consumes fees out of it, and there is NO withdrawal path by design (§17).
// So this page still has no payout queue. Every OTHER balance change comes
// from one of three ledgered paths (a verified Xendit webhook, a fee
// consumption, a fee reversal on an abandoned order); the variance column is
// how a balance that moved outside them becomes visible.
//
// The one exception is the "Adjust balance" action in the wallet detail
// drawer, gated behind the `wallet:adjust` capability — a manual, fully
// ledgered, mandatory-reason correction for the cases those three paths don't
// cover. It writes the same ledger shape every other path does, so a
// correctly-used adjustment never shows up as variance.

import { useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangleIcon, ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";

import { Can, RequireCapability } from "@/components/can";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable, SortableHeader } from "@/components/ui/data-table";
import {
  DataTableToolbar,
  PAGE_SIZE_OPTIONS,
} from "@/components/ui/data-table-toolbar";
import { DetailDrawer } from "@/components/ui/detail-drawer";
import { ReconciliationDialog } from "@/components/wallets/reconciliation-dialog";
import {
  ReasonCodeDialog,
  WALLET_ADJUSTMENT_REASONS,
} from "@/components/ui/reason-code-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, ToneBadge } from "@/components/ui/status-badge";
import { StatusFilterChips } from "@/components/ui/status-filter-chips";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LEDGER_TYPE_LABELS,
  adjustWalletBalance,
  fetchWalletLedger,
  fetchWalletThresholds,
  listAdminTopUps,
  listAdminWallets,
  peso,
  signedPeso,
  type AdminTopUpRow,
  type AdminWalletRow,
} from "@/lib/graphql/wallets";
import { WALLET_STATE, walletState } from "@/lib/status";

const WALLETS_KEY = "admin-wallets";
const TOPUPS_KEY = "admin-topups";

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("en-PH") : "—";
}

export default function WalletsPage() {
  return (
    <RequireCapability capability="wallet:read">
      <WalletsWorkspace />
    </RequireCapability>
  );
}

function WalletsWorkspace() {
  const [selected, setSelected] = useState<AdminWalletRow | null>(null);

  const thresholds = useQuery({
    queryKey: ["wallet-thresholds"],
    queryFn: fetchWalletThresholds,
    // The peso amounts are constants pending DECISION_REQUIRED-002; they do
    // not change while a page is open.
    staleTime: Infinity,
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Wallets</h1>
        <p className="text-sm text-muted-foreground">
          Every provider&apos;s prepaid balance, reconciled against its own
          ledger. Providers top up and the platform consumes fees — there is no
          withdrawal path, so nothing here moves money.
        </p>
      </div>

      <Tabs defaultValue="wallets" className="flex flex-1 flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="wallets">Wallets</TabsTrigger>
          <TabsTrigger value="topups">Top-ups</TabsTrigger>
        </TabsList>

        <TabsContent value="wallets" className="flex flex-col gap-4">
          <WalletsTab
            onSelect={setSelected}
            acceptMinCentavos={thresholds.data?.acceptMinCentavos}
            activationMinCentavos={thresholds.data?.activationMinCentavos}
          />
        </TabsContent>

        <TabsContent value="topups" className="flex flex-col gap-4">
          <TopUpsTab />
        </TabsContent>
      </Tabs>

      <WalletDetailDrawer
        wallet={selected}
        onClose={() => setSelected(null)}
        activationMinCentavos={thresholds.data?.activationMinCentavos}
      />
    </div>
  );
}

// ── Wallets tab ─────────────────────────────────────────────────────────────

const STATE_CHIPS = [
  { value: "VARIANCE" },
  { value: "NOT_ACTIVATED" },
  { value: "BELOW_MINIMUM" },
] as const;

function WalletsTab({
  onSelect,
  acceptMinCentavos,
  activationMinCentavos,
}: {
  onSelect: (wallet: AdminWalletRow) => void;
  acceptMinCentavos?: number;
  activationMinCentavos?: number;
}) {
  const [search, setSearch] = useState("");
  const [states, setStates] = useState<string[]>([]);
  const [limit, setLimit] = useState<number>(PAGE_SIZE_OPTIONS[1]);
  const [page, setPage] = useState(1);
  const [reconciliationOpen, setReconciliationOpen] = useState(false);

  const filter = useMemo(
    () => ({
      search: search.trim() || undefined,
      // The three chips map onto three independent backend flags rather than
      // one status field, because a wallet's state is derived, not stored.
      // Selecting more than one therefore ANDs — which is why the chips are
      // written as narrowing filters ("below minimum"), not as a status enum.
      varianceOnly: states.includes("VARIANCE") || undefined,
      notActivated: states.includes("NOT_ACTIVATED") || undefined,
      belowAcceptMinimum: states.includes("BELOW_MINIMUM") || undefined,
      limit,
      offset: (page - 1) * limit,
    }),
    [search, states, limit, page],
  );

  const { data, isPending, isError } = useQuery({
    queryKey: [WALLETS_KEY, filter],
    queryFn: () => listAdminWallets(filter),
    placeholderData: keepPreviousData,
  });

  const rows = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Held across all wallets"
          value={data ? peso(data.totalBalanceCentavos) : undefined}
          description="Prepaid money the platform is holding on providers' behalf."
        />
        <StatCard
          title="Ledger variances"
          value={data ? String(data.varianceCount) : undefined}
          description={
            data?.varianceCount
              ? "A stored balance disagrees with its ledger. Investigate before anything else."
              : "Every stored balance matches its ledger."
          }
          alarming={Boolean(data?.varianceCount)}
          // The count comes free with the wallet list; the report behind it
          // recomputes every balance from the ledger and is fetched only when
          // this is clicked.
          onClick={() => setReconciliationOpen(true)}
          actionLabel="Run reconciliation report"
        />
        <StatCard
          title="Thresholds"
          value={
            activationMinCentavos != null && acceptMinCentavos != null
              ? `${peso(activationMinCentavos)} / ${peso(acceptMinCentavos)}`
              : undefined
          }
          description="Activation minimum, then the balance needed to keep accepting bookings."
        />
      </div>

      <ReconciliationDialog
        open={reconciliationOpen}
        onOpenChange={setReconciliationOpen}
      />

      <DataTableToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search by shop name…"
        filters={
          <StatusFilterChips
            chips={STATE_CHIPS}
            selected={states}
            onChange={(next) => {
              setStates(next);
              setPage(1);
            }}
            registry={WALLET_STATE}
          />
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
        tableId="wallets"
        columns={walletColumns}
        data={rows}
        isLoading={isPending}
        isError={isError}
        emptyMessage={
          states.length || search.trim()
            ? "No wallets match these filters."
            : "No provider wallets yet."
        }
        onRowClick={onSelect}
        enableColumnVisibility
        csvFileName="lalaba-wallets"
      />
    </>
  );
}

const walletColumns: ColumnDef<AdminWalletRow>[] = [
  {
    id: "name",
    header: ({ column }) => <SortableHeader column={column}>Provider</SortableHeader>,
    meta: { label: "Provider" },
    accessorFn: (row) => row.name,
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.name}</div>
        <div className="text-xs text-muted-foreground">
          {row.original.providerType === "WASHER" ? "Home washer" : "Laundromat"}
        </div>
      </div>
    ),
  },
  {
    id: "state",
    header: "State",
    meta: { label: "State" },
    accessorFn: (row) => walletState(row),
    cell: ({ row }) => (
      <StatusBadge status={walletState(row.original)} registry={WALLET_STATE} />
    ),
  },
  {
    id: "balance",
    header: ({ column }) => <SortableHeader column={column}>Balance</SortableHeader>,
    meta: { label: "Balance" },
    accessorFn: (row) => row.balanceCentavos,
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">
        {peso(row.original.balanceCentavos)}
      </span>
    ),
  },
  {
    id: "variance",
    header: "Variance",
    meta: { label: "Variance" },
    accessorFn: (row) => row.varianceCentavos,
    cell: ({ row }) => {
      const { varianceCentavos, ledgerBalanceCentavos } = row.original;
      if (varianceCentavos === 0) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <div className="flex flex-col gap-0.5">
          <ToneBadge tone="danger">{signedPeso(varianceCentavos)}</ToneBadge>
          <span className="text-xs text-muted-foreground tabular-nums">
            ledger {peso(ledgerBalanceCentavos)}
          </span>
        </div>
      );
    },
  },
  {
    id: "discovery",
    header: "Discoverable",
    meta: { label: "Wallet allows discovery" },
    accessorFn: (row) => (row.walletAllowsDiscovery ? "Yes" : "No"),
    cell: ({ row }) =>
      row.original.walletAllowsDiscovery ? (
        <span className="text-muted-foreground">Yes</span>
      ) : (
        // Says WHY she is hidden, since that is the next question every time.
        <span className="text-sm">
          No —{" "}
          {row.original.activatedAt == null
            ? "never activated"
            : "below minimum"}
        </span>
      ),
  },
  {
    id: "activity",
    header: "Last activity",
    meta: { label: "Last activity" },
    accessorFn: (row) => row.lastLedgerEntryAt ?? "",
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5">
        <span className="whitespace-nowrap text-sm">
          {formatDateTime(row.original.lastLedgerEntryAt)}
        </span>
        {row.original.pendingTopUpCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {row.original.pendingTopUpCount} top-up
            {row.original.pendingTopUpCount === 1 ? "" : "s"} pending
          </span>
        )}
      </div>
    ),
  },
];

// ── Top-ups tab ─────────────────────────────────────────────────────────────

const TOPUP_CHIPS = [
  { value: "PENDING", label: "Pending" },
  { value: "SUCCEEDED", label: "Succeeded" },
  { value: "FAILED", label: "Failed" },
  { value: "EXPIRED", label: "Expired" },
] as const;

function TopUpsTab() {
  const [statuses, setStatuses] = useState<string[]>([]);
  const [unreconciledOnly, setUnreconciledOnly] = useState(false);
  const [limit, setLimit] = useState<number>(PAGE_SIZE_OPTIONS[1]);
  const [page, setPage] = useState(1);

  const filter = useMemo(
    () => ({
      // The backend takes ONE status, so the chips are single-select here.
      // Pretending otherwise would silently drop the other selections.
      status: (statuses[0] as AdminTopUpRow["intent"]["status"]) || undefined,
      unreconciledOnly: unreconciledOnly || undefined,
      limit,
      offset: (page - 1) * limit,
    }),
    [statuses, unreconciledOnly, limit, page],
  );

  const { data, isPending, isError } = useQuery({
    queryKey: [TOPUPS_KEY, filter],
    queryFn: () => listAdminTopUps(filter),
    placeholderData: keepPreviousData,
  });

  const rows = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Every top-up attempt, not only the ones that became money. An abandoned
        checkout leaves a pending row behind, which is what a provider is
        usually looking at when they say a top-up did not arrive.
      </p>

      <DataTableToolbar
        search=""
        onSearchChange={() => undefined}
        hideSearch
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <StatusFilterChips
              chips={TOPUP_CHIPS}
              selected={statuses}
              onChange={(next) => {
                // Single-select: keep only the most recent pick.
                setStatuses(next.slice(-1));
                setPage(1);
              }}
            />
            <Button
              size="sm"
              variant={unreconciledOnly ? "destructive" : "outline"}
              className="h-7 gap-1 px-2 text-xs"
              aria-pressed={unreconciledOnly}
              onClick={() => {
                setUnreconciledOnly((on) => !on);
                setPage(1);
              }}
            >
              <AlertTriangleIcon className="size-3" />
              Paid but not credited
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
        tableId="wallet-topups"
        columns={topUpColumns}
        data={rows}
        isLoading={isPending}
        isError={isError}
        emptyMessage={
          unreconciledOnly
            ? "No unreconciled top-ups — every settled payment reached a wallet."
            : "No top-up attempts match these filters."
        }
        enableColumnVisibility
        csvFileName="lalaba-topups"
      />
    </>
  );
}

const topUpColumns: ColumnDef<AdminTopUpRow>[] = [
  {
    id: "provider",
    header: "Provider",
    meta: { label: "Provider" },
    accessorFn: (row) => row.providerName,
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.providerName}</div>
        <div className="text-xs text-muted-foreground">
          {row.original.providerType === "WASHER" ? "Home washer" : "Laundromat"}
        </div>
      </div>
    ),
  },
  {
    id: "amount",
    header: "Amount",
    meta: { label: "Amount" },
    accessorFn: (row) => row.intent.amountCentavos,
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">
        {peso(row.original.intent.amountCentavos)}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    meta: { label: "Status" },
    accessorFn: (row) => row.intent.status,
    cell: ({ row }) => {
      const { status } = row.original.intent;
      return (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={status} registry={TOPUP_STATUS} />
          {status === "SUCCEEDED" && !row.original.hasLedgerCredit && (
            // The one row on this page that means money is missing.
            <ToneBadge tone="danger">Not credited</ToneBadge>
          )}
        </div>
      );
    },
  },
  {
    id: "reference",
    header: "Reference",
    meta: { label: "Reference" },
    accessorFn: (row) => row.intent.xenditInvoiceId ?? row.intent._id,
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          {row.original.intent.xenditInvoiceId ?? row.original.intent._id}
        </code>
        {row.original.intent.invoiceUrl && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="Open checkout page"
            onClick={() =>
              window.open(
                row.original.intent.invoiceUrl!,
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            <ExternalLinkIcon className="size-3" />
          </Button>
        )}
      </div>
    ),
  },
  {
    id: "created",
    header: "Started",
    meta: { label: "Started" },
    accessorFn: (row) => row.intent.createdAt ?? "",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm">
        {formatDateTime(row.original.intent.createdAt)}
      </span>
    ),
  },
  {
    id: "resolved",
    header: "Resolved",
    meta: { label: "Resolved" },
    accessorFn: (row) => row.intent.resolvedAt ?? "",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm">
        {formatDateTime(row.original.intent.resolvedAt)}
      </span>
    ),
  },
];

const TOPUP_STATUS = {
  PENDING: { label: "Pending", tone: "pending" },
  SUCCEEDED: { label: "Succeeded", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
} as const;

// ── Ledger drawer ───────────────────────────────────────────────────────────

function WalletDetailDrawer({
  wallet,
  onClose,
  activationMinCentavos,
}: {
  wallet: AdminWalletRow | null;
  onClose: () => void;
  activationMinCentavos?: number;
}) {
  const queryClient = useQueryClient();
  const [adjusting, setAdjusting] = useState(false);
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");

  const { data, isPending } = useQuery({
    queryKey: ["admin-wallet-ledger", wallet?.branchId],
    queryFn: () => fetchWalletLedger(wallet!.branchId),
    enabled: wallet != null,
  });

  const adjustMutation = useMutation({
    mutationFn: ({
      deltaCentavos,
      reason,
    }: {
      deltaCentavos: number;
      reason: string;
    }) => adjustWalletBalance(wallet!.branchId, deltaCentavos, reason),
    onSuccess: () => {
      toast.success("Balance adjusted.");
      setAdjusting(false);
      setAmount("");
      void queryClient.invalidateQueries({ queryKey: [WALLETS_KEY] });
      void queryClient.invalidateQueries({
        queryKey: ["admin-wallet-ledger", wallet?.branchId],
      });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not adjust this wallet.",
      ),
  });

  if (!wallet) return null;

  return (
    <DetailDrawer
      open
      onOpenChange={(open) => !open && onClose()}
      entityId={wallet.branchId}
      title={wallet.name}
      status={walletState(wallet)}
      statusRegistry={WALLET_STATE}
      subtitle={
        <>
          {peso(wallet.balanceCentavos)} on hand ·{" "}
          {wallet.activatedAt
            ? `activated ${formatDateTime(wallet.activatedAt)}`
            : `never reached the ${
                activationMinCentavos != null
                  ? peso(activationMinCentavos)
                  : "activation"
              } minimum`}
        </>
      }
      actions={
        <Can capability="wallet:adjust">
          <Button size="sm" variant="outline" onClick={() => setAdjusting(true)}>
            Adjust balance
          </Button>
        </Can>
      }
    >
      <ReasonCodeDialog
        open={adjusting}
        onOpenChange={(open) => {
          setAdjusting(open);
          if (!open) setAmount("");
        }}
        title={`Adjust ${wallet.name}'s balance`}
        description="Ledgered like every other balance change — this is a correction for something the top-up, fee-consumption, and fee-reversal paths don't cover, not a routine tool."
        reasons={WALLET_ADJUSTMENT_REASONS}
        confirmLabel={direction === "credit" ? "Credit wallet" : "Debit wallet"}
        destructive={direction === "debit"}
        pending={adjustMutation.isPending}
        notice={
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={direction === "credit" ? "default" : "outline"}
                onClick={() => setDirection("credit")}
              >
                Credit (+)
              </Button>
              <Button
                type="button"
                size="sm"
                variant={direction === "debit" ? "default" : "outline"}
                onClick={() => setDirection("debit")}
              >
                Debit (−)
              </Button>
            </div>
            <input
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              placeholder="Amount (₱)"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {direction === "debit" && (
              <p className="text-xs text-muted-foreground">
                Current balance: {peso(wallet.balanceCentavos)}. A debit that
                would take it below ₱0 is rejected.
              </p>
            )}
          </div>
        }
        onConfirm={(reasonCode, note) => {
          const pesos = Number(amount);
          if (!Number.isFinite(pesos) || pesos <= 0) return;
          const magnitude = Math.round(pesos * 100);
          adjustMutation.mutate({
            deltaCentavos: direction === "credit" ? magnitude : -magnitude,
            reason: note ? `${reasonCode}: ${note}` : reasonCode,
          });
        }}
      />

      {wallet.varianceCentavos !== 0 && (
        <div className="mb-4 rounded-md bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger)]">
          <strong>{signedPeso(wallet.varianceCentavos)} variance.</strong> The
          stored balance does not match the sum of the entries below, which
          means a balance changed outside the ledgered paths. The ledger is
          append-only and authoritative — treat the stored balance as suspect.
        </div>
      )}

      <h3 className="mb-2 text-sm font-medium">
        Ledger{" "}
        <span className="text-muted-foreground">({wallet.ledgerEntryCount})</span>
      </h3>

      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !data?.data.length ? (
        <p className="text-sm text-muted-foreground">
          No ledger entries — this wallet has never been topped up.
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {data.data.map((entry) => (
            <li key={entry._id} className="flex items-start justify-between gap-3 py-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {LEDGER_TYPE_LABELS[entry.type] ?? entry.type}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(entry.createdAt)}
                </span>
                {entry.orderId && (
                  <Badge variant="outline" className="mt-1 w-fit font-mono">
                    {entry.orderId}
                  </Badge>
                )}
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span
                  className={
                    entry.amountCentavos < 0
                      ? "font-medium tabular-nums"
                      : "font-medium tabular-nums text-[var(--status-success)]"
                  }
                >
                  {signedPeso(entry.amountCentavos)}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {peso(entry.balanceAfterCentavos)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && data.total > data.data.length && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the {data.data.length} most recent of {data.total} entries.
        </p>
      )}
    </DetailDrawer>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  description,
  alarming = false,
  onClick,
  actionLabel,
}: {
  title: string;
  value?: string;
  description: string;
  alarming?: boolean;
  onClick?: () => void;
  actionLabel?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle
          className={
            alarming
              ? "text-2xl tabular-nums text-[var(--status-danger)]"
              : "text-2xl tabular-nums"
          }
        >
          {value ?? <Skeleton className="h-7 w-24" />}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
        {onClick && (
          // A button rather than a clickable card: the number itself is
          // read-only, and only this one card has anything behind it.
          <Button
            variant="link"
            className="h-auto justify-start p-0 text-xs"
            onClick={onClick}
          >
            {actionLabel}
          </Button>
        )}
      </CardHeader>
    </Card>
  );
}
