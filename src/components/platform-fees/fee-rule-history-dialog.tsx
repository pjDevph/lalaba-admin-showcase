"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  CHARGED_TO_LABELS,
  describeCalculation,
  platformFeeRuleHistory,
  type PlatformFeeRule,
} from "@/lib/graphql/platform-fees";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

/**
 * Every version of one rule. This IS the audit trail — the collection is
 * append-only, so nothing here is reconstructed from a change log that could
 * disagree with the data. Note the existing Audit Logs page is merchant-scoped
 * (activity_logs requires a merchantId) and so cannot carry platform-wide fee
 * changes; this is where they live.
 */
export function FeeRuleHistoryDialog({
  rule,
  onOpenChange,
}: {
  rule: PlatformFeeRule | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["platform-fee-rule-history", rule?.ruleKey],
    queryFn: () => platformFeeRuleHistory(rule!.ruleKey),
    enabled: !!rule,
  });

  return (
    <Dialog open={!!rule} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule?.name} — change history</DialogTitle>
          <DialogDescription>
            Every version ever published. Orders keep the version they were
            priced under, so nothing here is ever rewritten.
          </DialogDescription>
        </DialogHeader>

        {isPending && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}

        {isError && (
          <p className="py-8 text-center text-sm text-destructive">
            Failed to load version history. Please try again.
          </p>
        )}

        <ol className="flex flex-col gap-4">
          {!isError && (data ?? []).map((version) => (
            <li
              key={version._id}
              className="border-l-2 pl-4 data-[current=true]:border-primary"
              data-current={version.supersededByVersion == null}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium tabular-nums">
                  {describeCalculation(version)}
                </span>
                <Badge variant="secondary">v{version.version}</Badge>
                {version.supersededByVersion == null && <Badge>Current</Badge>}
                {!version.isActive && (
                  <Badge variant="outline">Deactivated</Badge>
                )}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Effective {formatDate(version.effectiveFrom)}
                {version.effectiveUntil
                  ? ` – ${formatDate(version.effectiveUntil)}`
                  : ""}{" "}
                · paid by {CHARGED_TO_LABELS[version.chargedTo].toLowerCase()}
              </div>
              <div className="text-sm text-muted-foreground">
                {version.version === 1 ? "Created" : "Changed"} by{" "}
                {version.setByName ?? version.setByUid} on{" "}
                {formatDate(version.createdAt)}
              </div>
              {version.changeReason && (
                <p className="mt-1 text-sm italic">
                  &ldquo;{version.changeReason}&rdquo;
                </p>
              )}
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
