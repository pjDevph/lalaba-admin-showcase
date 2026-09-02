"use client";

import { Building2, Home } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { CASE_STATE } from "@/lib/status";
import type { KycProviderSummary } from "@/lib/graphql/kyc";

/**
 * The queue's unit of work is a CASE — one provider's verification — not a
 * document. A washer with five documents is one application to review, not five
 * unrelated rows the reviewer has to mentally reassemble.
 *
 * Renders as cards at every width: a case has a name, a progress state, an
 * assignee and one action, which is a poor fit for a wide table and an actively
 * bad one on a phone.
 */

export type CaseState =
  | "INCOMPLETE"
  | "NEEDS_REVIEW"
  | "IN_REVIEW"
  | "ACTION_NEEDED"
  | "VERIFIED"
  | "LEGACY_VERIFIED";

/**
 * Collapses the provider badge + document counts into the one state a reviewer
 * actually acts on.
 *
 * Legacy is deliberately NOT a peer status — it is how a provider became
 * verified, not a different place in the pipeline. Treating it as a sixth
 * status would force every filter and transition to special-case it.
 */
export function caseState(p: KycProviderSummary): CaseState {
  if (p.verificationStatus === "APPROVED") {
    return p.grandfathered ? "LEGACY_VERIFIED" : "VERIFIED";
  }
  if (p.verificationStatus === "REJECTED" || p.rejectedCount > 0) {
    return "ACTION_NEEDED";
  }
  if (p.claimedByUid) return "IN_REVIEW";
  // Everything asked for is in hand and nothing is rejected: only a reviewer
  // can move this forward.
  if (p.approvedCount + p.pendingCount >= p.requiredCount) return "NEEDS_REVIEW";
  return "INCOMPLETE";
}

function TypeIcon({ type }: { type: KycProviderSummary["providerType"] }) {
  const Icon = type === "MERCHANT_BRANCH" ? Building2 : Home;
  return <Icon className="size-3.5 shrink-0" aria-hidden />;
}

function relativeAge(iso: string | null): string {
  if (!iso) return "—";
  const hours = (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Dense single-column row for the Review queue tab's left pane — a case has
 * to fit in a much narrower rail here than the grid card layout below, since
 * the right side is now a persistent inspector rather than empty space.
 */
export function CaseStreamRow({
  provider,
  selected,
  onSelect,
}: Readonly<{
  provider: KycProviderSummary;
  selected: boolean;
  onSelect: (p: KycProviderSummary) => void;
}>) {
  const state = caseState(provider);
  return (
    <button
      type="button"
      onClick={() => onSelect(provider)}
      aria-current={selected}
      className={`flex w-full flex-col gap-1 border-b p-3 text-left transition-colors last:border-b-0 ${
        selected ? "bg-primary/10" : "hover:bg-muted/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium">
          {provider.providerName ?? (
            <span className="italic text-muted-foreground">
              Deleted provider
            </span>
          )}
        </span>
        <StatusBadge
          status={state}
          registry={CASE_STATE}
          className="h-4 shrink-0 text-[10px]"
        />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <TypeIcon type={provider.providerType} />
        {provider.providerType === "MERCHANT_BRANCH" ? "Laundromat" : "Home washer"}
        <span aria-hidden>·</span>
        {provider.claimedByEmail
          ? `Claimed by ${provider.claimedByEmail}`
          : `Submitted ${relativeAge(provider.lastSubmittedAt)}`}
      </p>
    </button>
  );
}

export function CaseStreamList({
  providers,
  selectedKey,
  isLoading,
  emptyMessage,
  onSelect,
}: Readonly<{
  providers: KycProviderSummary[];
  selectedKey: string | null;
  isLoading?: boolean;
  emptyMessage: string;
  onSelect: (p: KycProviderSummary) => void;
}>) {
  if (isLoading) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!providers.length) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border">
      {providers.map((p) => {
        const key = `${p.providerType}:${p.providerId}`;
        return (
          <CaseStreamRow
            key={key}
            provider={p}
            selected={key === selectedKey}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}
