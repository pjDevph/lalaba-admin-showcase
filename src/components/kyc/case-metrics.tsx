"use client";

import type { KycMetrics } from "@/lib/graphql/kyc";

/**
 * Operational context before filters: how much work is waiting.
 *
 * Counts come from `kycMetrics`, which aggregates server-side, and each tile
 * maps to a provider-level `verificationStatus` the API can filter on. An
 * earlier version pulled 200 providers and counted them in the browser, which
 * was only ever going to be right while the directory stayed small — and it
 * quietly disagreed with the list as soon as pagination kicked in.
 */

export type CaseFilter =
  | "ALL"
  | "IN_REVIEW" // everything submitted, waiting on a reviewer
  | "REJECTED" // something needs replacing
  | "APPROVED" // verified (includes legacy)
  | "PENDING"; // provider has not finished uploading

const TILES: Array<{ key: Exclude<CaseFilter, "ALL">; label: string; of: keyof KycMetrics }> = [
  { key: "IN_REVIEW", label: "Needs review", of: "providersInReview" },
  { key: "REJECTED", label: "Action needed", of: "providersRejected" },
  { key: "PENDING", label: "Incomplete", of: "providersPending" },
  { key: "APPROVED", label: "Verified", of: "providersApproved" },
];

export function CaseMetrics({
  metrics,
  active,
  onSelect,
}: Readonly<{
  metrics: KycMetrics | undefined;
  active: CaseFilter;
  onSelect: (filter: CaseFilter) => void;
}>) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {TILES.map((tile) => {
        const selected = active === tile.key;
        const value = metrics ? (metrics[tile.of] as number) : undefined;
        return (
          <button
            key={tile.key}
            type="button"
            onClick={() => onSelect(selected ? "ALL" : tile.key)}
            aria-pressed={selected}
            className={`rounded-lg border p-4 text-left transition-colors ${
              selected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            }`}
          >
            <p className="text-2xl font-semibold tabular-nums">
              {value ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">{tile.label}</p>
          </button>
        );
      })}
    </div>
  );
}
