"use client";

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { groupDocuments } from "./requirement-groups";
import { CaseReviewPanel } from "./case-review-panel";
import { ApiError } from "@/lib/api-client";
import {
  getKycProviderDetail,
  idTypeLabel,
  KYC_AUDIT_EVENT_LABELS,
  KYC_DOCUMENT_TYPE_LABELS,
  KYC_PROVIDER_TYPE_LABELS,
  type KycProviderDocumentView,
  type KycProviderSummary,
  type KycProviderType,
} from "@/lib/graphql/kyc";
import {
  LIVENESS_CHALLENGE_LABELS,
  type LivenessChallenge,
  type LivenessMetadata,
} from "@/lib/graphql/courier-selfies";
import {
  DocumentViewer,
  type ViewableDocument,
} from "@/components/kyc/document-viewer";
import {
  DocumentStatusBadge,
  VerificationStatusBadge,
} from "@/components/kyc/status-badges";

export const PROVIDER_DETAIL_QUERY_KEY = "kyc-provider-detail";

export type ProviderRef = {
  providerType: KycProviderType;
  providerId: string;
  providerName: string | null;
};

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

/** Renders the JSON `details` blob as plain key/value text. */
function AuditDetails({ details }: { details: string | null }) {
  if (!details) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(details) as Record<string, unknown>;
  } catch {
    // Never let a malformed payload take the timeline down — the event itself
    // is the important part.
    return <span className="text-muted-foreground">{details}</span>;
  }
  const entries = Object.entries(parsed);
  if (!entries.length) return null;
  return (
    <span className="text-muted-foreground">
      {entries.map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
    </span>
  );
}

function ProgressSummary({ summary }: { summary: KycProviderSummary }) {
  const { approvedCount, requiredCount, pendingCount, rejectedCount } = summary;
  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-4">
      <div>
        <p className="text-xs text-muted-foreground">Approved</p>
        <p className="text-lg font-semibold">
          {approvedCount}/{requiredCount}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Awaiting review</p>
        <p className="text-lg font-semibold">{pendingCount}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Rejected</p>
        <p className="text-lg font-semibold">{rejectedCount}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Last activity</p>
        <p className="text-sm font-medium">
          {formatDate(summary.lastDecisionAt ?? summary.lastSubmittedAt)}
        </p>
      </div>
    </div>
  );
}

/**
 * What the partner's device reported about the liveness capture behind a
 * selfie. Same fields, and the same caveat, as the courier queue's summary:
 * these are CLIENT ASSERTIONS. The server cannot re-derive any of them and a
 * modified build can send whatever it likes — they are context for a human
 * looking at the photo, never a reason on their own to approve one.
 *
 * Only rendered for a SELFIE captured through the check; an older selfie has
 * no metadata and simply shows nothing here.
 */
function LivenessSummary({
  challenge,
  metadata,
}: {
  challenge: LivenessChallenge;
  metadata: LivenessMetadata;
}) {
  return (
    <div className="rounded-md bg-muted/50 px-2 py-1.5 text-xs">
      <span className="font-medium">Liveness check</span>{" "}
      <span className="text-muted-foreground">
        (device-reported) · {LIVENESS_CHALLENGE_LABELS[challenge]} ·{" "}
        {(metadata.durationMs / 1000).toFixed(1)}s ·{" "}
        {metadata.attemptCount} attempt
        {metadata.attemptCount === 1 ? "" : "s"} · eyes open{" "}
        {(metadata.eyesOpenScore * 100).toFixed(0)}% · yaw{" "}
        {metadata.yawDegrees.toFixed(1)}°, pitch{" "}
        {metadata.pitchDegrees.toFixed(1)}°
      </span>
    </div>
  );
}

function DocumentRow({
  row,
  providerName,
  onView,
  onApprove,
  onReject,
  busy,
}: {
  row: KycProviderDocumentView;
  /** Passed through so the viewer names the partner rather than falling back
   *  to its "Deleted provider" placeholder — which this surface always hit. */
  providerName: string | null;
  onView: (doc: ViewableDocument) => void;
  onApprove: (row: KycProviderDocumentView) => void;
  onReject: (row: KycProviderDocumentView) => void;
  busy: boolean;
}) {
  const { document } = row;
  // Only live documents can be decided; superseded/decided rows are history.
  const actionable =
    document.status === "SUBMITTED" || document.status === "UNDER_REVIEW";

  return (
    <div className="flex flex-col gap-2 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {KYC_DOCUMENT_TYPE_LABELS[document.documentType] ??
              document.documentType}
          </span>
          {!row.required && <Badge variant="ghost">Not required</Badge>}
          <DocumentStatusBadge status={document.status} expired={row.expired} />
          {actionable && (
            <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
              Needs attention
            </Badge>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onView({
                documentId: document._id,
                documentType: document.documentType,
                governmentIdType: document.governmentIdType,
                mimeType: document.mimeType,
                expiresAt: document.expiresAt,
                providerName,
                providerType: document.providerType,
              })
            }
          >
            View
          </Button>
          {actionable && (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onApprove(row)}
              >
                Approve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onReject(row)}
              >
                Reject
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Submitted {formatDateTime(document.submittedAt)}
        {idTypeLabel(document.governmentIdType)
          ? ` · Claimed ${idTypeLabel(document.governmentIdType)}`
          : ""}
        {document.expiresAt ? ` · Expires ${formatDate(document.expiresAt)}` : ""}
        {document.reviewedAt
          ? ` · Decided ${formatDateTime(document.reviewedAt)} by ${
              row.reviewedByEmail ?? document.reviewedByUid ?? "unknown"
            }`
          : ""}
        {row.claimedByEmail ? ` · Claimed by ${row.claimedByEmail}` : ""}
      </p>

      {document.livenessChallenge && document.livenessMetadata && (
        <LivenessSummary
          challenge={document.livenessChallenge}
          metadata={document.livenessMetadata}
        />
      )}

      {document.rejectionReason && (
        // The exact text the partner sees in their Action Required card.
        <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
          Reason given: {document.rejectionReason}
        </p>
      )}
    </div>
  );
}

export type ProviderDetail = NonNullable<
  Awaited<ReturnType<typeof getKycProviderDetail>>
>;

// Same "still actionable" check CaseReviewPanel makes internally — needed
// here too so the dense inspector knows whether to show its resolved-state
// summary (CaseReviewPanel renders nothing once nothing is open, which would
// otherwise leave a blank gap where the review controls used to be).
const REVIEWABLE_STATUSES = ["SUBMITTED", "UNDER_REVIEW"];

function hasOpenDocuments(documents: KycProviderDocumentView[]): boolean {
  return documents.some((d) => REVIEWABLE_STATUSES.includes(d.document.status));
}

/** One-line read of where a fully-decided (nothing open) case landed. */
function ResolutionSummary({ data }: { data: ProviderDetail }) {
  const { verificationStatus, approvedCount, requiredCount, rejectedCount, lastDecisionAt } =
    data.summary;
  if (verificationStatus === "APPROVED") {
    return (
      <p className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
        ✓ Verified — {approvedCount}/{requiredCount} required checks approved.
        {lastDecisionAt ? ` Decided ${formatDateTime(lastDecisionAt)}.` : ""}
      </p>
    );
  }
  if (rejectedCount > 0) {
    return (
      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {rejectedCount} document{rejectedCount === 1 ? "" : "s"} need
        {rejectedCount === 1 ? "s" : ""} replacement — waiting on the provider
        to resubmit.
      </p>
    );
  }
  return (
    <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
      Waiting on more uploads from the provider — nothing to review yet.
    </p>
  );
}

/**
 * One provider's complete KYC record: badge status, progress against the
 * required set, every document ever submitted (including superseded history)
 * with each decision's reviewer and reason, what is still missing, and the
 * audit trail. Shared by the modal dialog below (Documents/All providers
 * tabs) and the Review queue tab's inline split-pane inspector — same
 * content, different chrome around it.
 *
 * Decisions can be taken from here as well as from the queue, so an admin
 * looking at a partner's record does not have to go find the row again.
 */
export function ProviderCaseContent({
  provider,
  data,
  onApprove,
  onReject,
  onView,
  workingDocumentId,
  onDone,
  onStagedChange,
  // The Review queue tab's inline inspector, not the "give me everything"
  // modal: history and the audit trail are real and useful, just not the
  // first thing a reviewer processing a queue needs to see. The modal keeps
  // showing both eagerly by omitting this prop.
  dense = false,
}: {
  provider: ProviderRef;
  data: ProviderDetail;
  onApprove: (row: KycProviderDocumentView) => void;
  onReject: (row: KycProviderDocumentView) => void;
  onView: (doc: ViewableDocument) => void;
  workingDocumentId: string | null;
  onDone: () => void;
  onStagedChange?: (hasStaged: boolean) => void;
  dense?: boolean;
}) {
  const open = hasOpenDocuments(data.documents);

  return (
    <div className="flex flex-col gap-4">
      <ProgressSummary summary={data.summary} />

      {/* Whole-case review: stage a decision per outstanding requirement,
          then send one consolidated result. Renders nothing once nothing is
          open, which is exactly when ResolutionSummary below takes over. */}
      <CaseReviewPanel
        providerType={provider.providerType}
        providerId={provider.providerId}
        documents={data.documents}
        claimedByEmail={data.summary.claimedByEmail ?? null}
        onDone={onDone}
        onStagedChange={onStagedChange}
      />

      {dense && !open && <ResolutionSummary data={data} />}

      {data.summary.rejectionReason && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Provider-level reason: {data.summary.rejectionReason}
        </p>
      )}

      {data.missingDocumentTypes.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium">Not yet uploaded</h3>
          <div className="flex flex-wrap gap-1">
            {data.missingDocumentTypes.map((type) => (
              <Badge key={type} variant="outline">
                {KYC_DOCUMENT_TYPE_LABELS[type] ?? type}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Documents and the audit trail are two different questions ("what's
          here" vs "what happened") — tabs keep either one from crowding out
          the other, same real data as before, just not both dumped at once. */}
      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">
            Associated documents ({data.documents.length})
          </TabsTrigger>
          <TabsTrigger value="activity">Verification timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="flex flex-col gap-2 pt-3">
          {data.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing submitted yet.
            </p>
          ) : (
            // Grouped by requirement rather than listed flat: the three
            // business photos are one check stored as three documents, and
            // ID front/back/selfie are one identity check.
            groupDocuments(provider.providerType, data.documents).map(
              ({
                group,
                rows,
              }: {
                group: { key: string; title: string };
                rows: typeof data.documents;
              }) => (
                <div key={group.key} className="flex flex-col gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {group.title}
                  </p>
                  {rows.map((row) => (
                    <DocumentRow
                      key={row.document._id}
                      row={row}
                      providerName={
                        data.summary.providerName ??
                        provider.providerName ??
                        null
                      }
                      onView={onView}
                      onApprove={onApprove}
                      onReject={onReject}
                      busy={workingDocumentId === row.document._id}
                    />
                  ))}
                </div>
              ),
            )
          )}
        </TabsContent>

        <TabsContent value="activity" className="pt-3">
          {data.auditTrail.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recorded activity.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.auditTrail.map((event) => (
                <li key={event._id} className="text-xs">
                  <span className="text-muted-foreground">
                    {formatDateTime(event.timestamp)}
                  </span>{" "}
                  <span className="font-medium">
                    {KYC_AUDIT_EVENT_LABELS[event.event] ?? event.event}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    by {event.actorEmail ?? event.actorUid}
                  </span>{" "}
                  <AuditDetails details={event.details} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Modal shell around ProviderCaseContent — used by the Documents and All
 * providers tabs, where opening a case is still a dialog rather than the
 * Review queue tab's inline split pane.
 */
export function ProviderDetailDialog({
  provider,
  onClose,
  onApprove,
  onReject,
  workingDocumentId,
}: {
  provider: ProviderRef | null;
  onClose: () => void;
  onApprove: (row: KycProviderDocumentView) => void;
  onReject: (row: KycProviderDocumentView) => void;
  workingDocumentId: string | null;
}) {
  const [viewing, setViewing] = useState<ViewableDocument | null>(null);
  // Decisions live in CaseReviewPanel's state and die with it, so Escape or a
  // click outside used to silently bin a half-finished review.
  const [hasStagedDecisions, setHasStagedDecisions] = useState(false);

  // The guard is a real modal, not window.confirm. The browser dialog is
  // unstyled, unreadable next to the rest of the panel, and blocks the whole
  // tab — and on a destructive prompt that habit matters: it renders the same
  // whether it is discarding one decision or twenty.
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const requestClose = useCallback(() => {
    if (hasStagedDecisions) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }, [hasStagedDecisions, onClose]);

  const discardAndClose = useCallback(() => {
    setConfirmDiscard(false);
    setHasStagedDecisions(false);
    onClose();
  }, [onClose]);

  const { data, isPending, error } = useQuery({
    queryKey: [
      PROVIDER_DETAIL_QUERY_KEY,
      provider?.providerType,
      provider?.providerId,
    ],
    queryFn: () =>
      getKycProviderDetail(provider!.providerType, provider!.providerId),
    enabled: !!provider,
  });

  return (
    <>
      <Dialog
        open={!!provider}
        onOpenChange={(open) => !open && requestClose()}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {provider?.providerName ?? "Deleted provider"}
              {data && (
                <VerificationStatusBadge
                  status={data.summary.verificationStatus}
                />
              )}
            </DialogTitle>
            <DialogDescription>
              {provider
                ? KYC_PROVIDER_TYPE_LABELS[provider.providerType]
                : ""}
              {data?.summary.ownerEmail ? ` · ${data.summary.ownerEmail}` : ""}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p className="text-sm text-destructive">
              {error instanceof ApiError
                ? error.message
                : "Could not load this provider's record."}
            </p>
          ) : isPending || !data ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <div className="max-h-[65vh] overflow-y-auto pr-1">
              {provider && (
                <ProviderCaseContent
                  provider={provider}
                  data={data}
                  onApprove={onApprove}
                  onReject={onReject}
                  onView={setViewing}
                  workingDocumentId={workingDocumentId}
                  // A submitted review is saved, so it closes without prompting.
                  onDone={onClose}
                  onStagedChange={setHasStagedDecisions}
                />
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={requestClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocumentViewer item={viewing} onClose={() => setViewing(null)} />

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard unsubmitted decisions?"
        description="You have decisions on this case that haven't been submitted yet. Closing now discards them."
        confirmLabel="Discard and close"
        onConfirm={discardAndClose}
      />
    </>
  );
}
