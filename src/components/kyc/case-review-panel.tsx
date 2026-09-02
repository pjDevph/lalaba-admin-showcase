"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import {
  completeKycCaseReview,
  claimKycCase,
  getKycDocumentUrl,
  releaseKycCase,
  idTypeLabel,
  KYC_REJECTION_REASONS,
  type KycCaseDecision,
  type KycProviderDocumentView,
  type KycProviderType,
  type KycRejectionReasonCode,
} from "@/lib/graphql/kyc";

/**
 * The evidence image inline, next to the decision — the whole point of
 * putting this in a split pane instead of behind a separate "View" click.
 * Same signed-URL fetch DocumentViewer uses (300s TTL, never cached), just
 * rendered smaller and without the dialog chrome. PDFs/Word docs still need
 * the "Open in new tab" fallback DocumentViewer already handles elsewhere.
 */
function RowPreview({
  documentId,
  mimeType,
}: {
  documentId: string;
  mimeType: string;
}) {
  const { data: url, error, isFetching } = useQuery({
    queryKey: ["kyc-document-url", documentId],
    queryFn: () => getKycDocumentUrl(documentId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  if (!mimeType.startsWith("image/")) {
    return (
      <div className="flex h-36 w-full items-center justify-center rounded-md border bg-muted/30 text-center text-xs text-muted-foreground">
        {mimeType} file — not previewable inline
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-36 w-full items-center justify-center rounded-md border border-destructive/40 bg-destructive/5 text-center text-xs text-destructive">
        {error instanceof ApiError ? error.message : "Could not load evidence."}
      </div>
    );
  }
  if (isFetching || !url) return <Skeleton className="h-36 w-full" />;
  return (
    // Not next/image: a short-lived signed storage URL, never cached.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="KYC document evidence"
      className="h-36 w-full rounded-md border object-cover"
    />
  );
}

/**
 * Review the whole case, then submit one result.
 *
 * Deciding document-by-document pushed the provider a notification per
 * document and left them to work out what to fix. Here the reviewer stages a
 * decision against every outstanding requirement and sends them once —
 * `Complete verification` stays disabled until nothing is undecided, so a case
 * cannot be half-finished.
 */

type Staged = { approve: boolean; reasonCode?: KycRejectionReasonCode; note?: string };

const REVIEWABLE = ["SUBMITTED", "UNDER_REVIEW"];

export function CaseReviewPanel({
  providerType,
  providerId,
  documents,
  claimedByEmail,
  onDone,
  onStagedChange,
}: Readonly<{
  providerType: KycProviderType;
  providerId: string;
  documents: KycProviderDocumentView[];
  claimedByEmail: string | null;
  onDone: () => void;
  /**
   * Reports whether there are decisions taken but not yet submitted, so the
   * dialog can warn before an Escape or a click outside throws them away.
   */
  onStagedChange?: (hasStaged: boolean) => void;
}>) {
  const open = useMemo(
    () => documents.filter((d) => REVIEWABLE.includes(d.document.status)),
    [documents],
  );
  const [staged, setStaged] = useState<Record<string, Staged>>({});
  const [busy, setBusy] = useState(false);

  const decided = open.filter((d) => staged[d.document._id]);
  const undecided = open.length - decided.length;
  const rejecting = decided.filter((d) => !staged[d.document._id].approve);
  // "Other" says nothing actionable on its own, so it needs the note filled in.
  const missingNote = rejecting.some((d) => {
    const s = staged[d.document._id];
    return s.reasonCode === "OTHER" && !s.note?.trim();
  });
  const missingReason = rejecting.some((d) => !staged[d.document._id].reasonCode);

  const hasStaged = decided.length > 0;
  useEffect(() => {
    onStagedChange?.(hasStaged);
    // Decisions die with this component, so clear the flag on unmount too.
    return () => onStagedChange?.(false);
  }, [hasStaged, onStagedChange]);

  if (!open.length) return null;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    const decisions: KycCaseDecision[] = decided.map((d) => {
      const s = staged[d.document._id];
      return {
        documentId: d.document._id,
        approve: s.approve,
        reasonCode: s.approve ? null : (s.reasonCode ?? null),
        note: s.approve ? null : (s.note ?? null),
      };
    });
    void run(
      () => completeKycCaseReview(providerType, providerId, decisions),
      "Review sent. The partner gets one consolidated result.",
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Review this case</p>
          <p className="text-xs text-muted-foreground">
            {claimedByEmail
              ? `Assigned to ${claimedByEmail}`
              : "Unassigned — claim it so no one reviews the same identity twice."}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(
              () =>
                claimedByEmail
                  ? releaseKycCase(providerType, providerId)
                  : claimKycCase(providerType, providerId),
              claimedByEmail ? "Case released." : "Case claimed.",
            )
          }
        >
          {claimedByEmail ? "Release case" : "Claim case"}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {open.map((d) => {
          const s = staged[d.document._id];
          const set = (next: Staged | undefined) =>
            setStaged((prev) => {
              const copy = { ...prev };
              if (!next) delete copy[d.document._id];
              else copy[d.document._id] = next;
              return copy;
            });
          return (
            <div key={d.document._id} className="rounded-md border p-2">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_1fr]">
                <RowPreview
                  documentId={d.document._id}
                  mimeType={d.document.mimeType}
                />
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm">
                      {d.document.documentType.replaceAll("_", " ").toLowerCase()}
                      {!d.required && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (optional)
                        </span>
                      )}
                      {/* What the provider SAID this is, next to the photo of
                          what it actually is. A mismatch between the two is a
                          WRONG_DOCUMENT rejection, and this is the only place
                          both are visible at once. */}
                      {idTypeLabel(d.document.governmentIdType) && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          · claimed:{" "}
                          {idTypeLabel(d.document.governmentIdType)}
                        </span>
                      )}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={s?.approve ? "default" : "outline"}
                        onClick={() => set({ approve: true })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant={s && !s.approve ? "destructive" : "outline"}
                        onClick={() => set({ approve: false, reasonCode: undefined })}
                      >
                        Reject
                      </Button>
                      {s && (
                        <Button size="sm" variant="ghost" onClick={() => set(undefined)}>
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>

                  {d.document.livenessChallenge && d.document.livenessMetadata && (
                    <p className="mt-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
                      Liveness (device-reported): eyes open{" "}
                      {(d.document.livenessMetadata.eyesOpenScore * 100).toFixed(0)}%
                      · {d.document.livenessMetadata.attemptCount} attempt
                      {d.document.livenessMetadata.attemptCount === 1 ? "" : "s"}
                    </p>
                  )}

                  {s && !s.approve && (
                    <div className="mt-2 flex flex-col gap-2">
                      <select
                        className="rounded-md border p-1.5 text-sm"
                        value={s.reasonCode ?? ""}
                        onChange={(e) =>
                          set({ ...s, reasonCode: e.target.value as KycRejectionReasonCode })
                        }
                      >
                        <option value="">Pick a reason…</option>
                        {KYC_REJECTION_REASONS.map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <Textarea
                        rows={2}
                        value={s.note ?? ""}
                        onChange={(e) => set({ ...s, note: e.target.value })}
                        placeholder={
                          s.reasonCode === "OTHER"
                            ? "Required — describe what needs fixing."
                            : "Optional extra instruction."
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          {decided.length - rejecting.length} approved · {rejecting.length} to replace ·{" "}
          {undecided} undecided
        </p>
        <Button
          size="sm"
          disabled={busy || undecided > 0 || missingReason || missingNote}
          onClick={submit}
        >
          {busy ? "Sending…" : "Complete verification"}
        </Button>
      </div>
      {undecided > 0 && (
        <p className="text-xs text-muted-foreground">
          {undecided} requirement{undecided === 1 ? "" : "s"} still need a decision.
        </p>
      )}
      {(missingReason || missingNote) && (
        <p className="text-xs text-red-600">
          Every rejection needs a reason, and “Other” needs a description.
        </p>
      )}
    </div>
  );
}
