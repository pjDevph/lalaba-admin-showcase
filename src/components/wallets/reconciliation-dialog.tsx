"use client";

/**
 * The financial-integrity audit, on demand.
 *
 * The wallets list already reports a variance COUNT and can filter down to
 * the offending rows, but it shows only the stored balance — so "3 wallets
 * disagree with their ledger" was as far as the panel could take you, and the
 * size and direction of each disagreement lived in the database.
 *
 * This runs `walletReconciliationReport`, which recomputes every wallet's
 * balance from the sum of its own ledger entries server-side, and puts the two
 * numbers side by side. It is deliberately not fetched on page load: it walks
 * every wallet and aggregates the entire ledger, and nobody needs that on the
 * way to looking up one provider's balance.
 */

import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon, CheckCircle2Icon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchWalletReconciliationReport,
  peso,
  signedPeso,
} from "@/lib/graphql/wallets";

export const RECONCILIATION_KEY = "wallet-reconciliation-report";

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

export function ReconciliationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isPending, isFetching, isError, error, refetch } = useQuery({
    queryKey: [RECONCILIATION_KEY],
    queryFn: fetchWalletReconciliationReport,
    // On demand only — see the note at the top of this file.
    enabled: open,
    // The audit is a point-in-time statement, and its own `generatedAt` says
    // when. Re-running it is an explicit act, not something a window focus
    // should do behind the reader's back.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Ledger reconciliation</DialogTitle>
          <DialogDescription>
            Every wallet balance recomputed from the sum of its own ledger
            entries. Any non-zero variance means a balance moved outside the
            ledgered paths and needs investigating before anything else.
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-[var(--status-danger)]">
            {error instanceof Error
              ? error.message
              : "Could not run the reconciliation report."}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="text-muted-foreground">
                Ran {formatGeneratedAt(data.generatedAt)}
              </span>
              <span>
                <span className="font-medium tabular-nums">
                  {data.walletsChecked}
                </span>{" "}
                <span className="text-muted-foreground">
                  wallet{data.walletsChecked === 1 ? "" : "s"} checked
                </span>
              </span>
            </div>

            {data.walletsWithVariance === 0 ? (
              <div className="flex items-center gap-2 rounded-md border p-4 text-sm">
                <CheckCircle2Icon className="size-4 text-[var(--status-success)]" />
                Every stored balance matches its ledger.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--status-danger)]">
                  <AlertTriangleIcon className="size-4" />
                  {data.walletsWithVariance} wallet
                  {data.walletsWithVariance === 1 ? "" : "s"} disagree
                  {data.walletsWithVariance === 1 ? "s" : ""} with its ledger
                </div>
                {/* Its own scroll container: a wide money table must never make
                    the dialog itself scroll sideways. */}
                <div className="max-h-96 overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/50 text-left">
                      <tr>
                        <th className="p-2 font-medium">Branch</th>
                        <th className="p-2 text-right font-medium">Stored</th>
                        <th className="p-2 text-right font-medium">
                          From ledger
                        </th>
                        <th className="p-2 text-right font-medium">Variance</th>
                        <th className="p-2 text-right font-medium">Entries</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.variances.map((row) => (
                        <tr key={row.branchId} className="border-t">
                          <td className="p-2">
                            <code className="text-xs">{row.branchId}</code>
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {peso(row.walletBalanceCentavos)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {peso(row.ledgerBalanceCentavos)}
                          </td>
                          {/* Signed, because which way it drifted is the
                              first thing you need: a stored balance ABOVE its
                              ledger is money the platform believes a provider
                              has and cannot account for. */}
                          <td className="p-2 text-right font-medium tabular-nums text-[var(--status-danger)]">
                            {signedPeso(row.varianceCentavos)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {row.ledgerEntryCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCwIcon className={isFetching ? "animate-spin" : undefined} />
            {isFetching ? "Running…" : "Run again"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
