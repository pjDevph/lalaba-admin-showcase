"use client";

import { useEffect, useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { ToneBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import {
  DataTableToolbar,
  PAGE_SIZE_OPTIONS,
} from "@/components/ui/data-table-toolbar";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaseStreamList } from "@/components/kyc/case-queue";

const CASE_PAGE_SIZE = 24;
import { CaseMetrics, type CaseFilter } from "@/components/kyc/case-metrics";
import { formatAge, formatHours } from "@/components/kyc/metrics-cards";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/auth-context";
import { RequireCapability, useCan } from "@/components/can";
import { ApiError } from "@/lib/api-client";
import {
  approveKycDocument,
  claimKycDocument,
  KYC_DOCUMENT_TYPE_LABELS,
  KYC_PROVIDER_TYPE_LABELS,
  listKycProviders,
  getKycMetrics,
  getKycProviderDetail,
  KYC_REJECTION_REASONS,
  type KycRejectionReasonCode,
  listKycReviewQueue,
  rejectKycDocument,
  type KycDocumentStatus,
  type KycProviderDocumentView,
  type KycProviderSummary,
  type KycProviderType,
  type KycReviewQueueItem,
  type KycVerificationStatus,
} from "@/lib/graphql/kyc";
import {
  DocumentViewer,
  type ViewableDocument,
} from "@/components/kyc/document-viewer";
import {
  ProviderCaseContent,
  ProviderDetailDialog,
  PROVIDER_DETAIL_QUERY_KEY,
  type ProviderRef,
} from "@/components/kyc/provider-detail-dialog";
import {
  DocumentStatusBadge,
  VerificationStatusBadge,
} from "@/components/kyc/status-badges";

type ClaimedFilter = "all" | "unclaimed" | "claimed";
// "pending" is the actionable queue; the rest let an admin audit past
// decisions, which the queue alone could never show.
type QueueStatusFilter = "pending" | "APPROVED" | "REJECTED" | "SUPERSEDED";

const QUERY_KEY = "kyc-review-queue";
const PROVIDERS_QUERY_KEY = "kyc-providers";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

// An expiry that has already passed is the single most important thing on a
// row: approving over it can never grant the badge, so the reviewer needs to
// see it before they open the document.
function isExpired(expiresAt: string | null) {
  return expiresAt != null && new Date(expiresAt).getTime() <= Date.now();
}

/**
 * Who holds this row's claim, from the current reviewer's point of view.
 *
 * The backend lets anyone decide a claimed document so a stale claim can never
 * deadlock the queue, but it writes a DOCUMENT_CLAIM_OVERRIDDEN audit event
 * when you do. Deciding over a colleague should therefore be a choice, not a
 * surprise — so every surface that can trigger one says whose claim it is.
 */
function claimHolder(item: KycReviewQueueItem, viewerUid: string | undefined) {
  const uid = item.document.claimedByUid;
  if (!uid) return { state: "unclaimed" as const, label: null };
  if (uid === viewerUid) return { state: "mine" as const, label: "You" };
  return {
    state: "other" as const,
    // Fall back to the raw uid only if the reviewer's account was deleted.
    label: item.claimedByEmail ?? uid,
  };
}

function queueColumns(
  viewerUid: string | undefined,
  onView: (item: KycReviewQueueItem) => void,
  onClaim: (item: KycReviewQueueItem) => void,
  onApprove: (item: KycReviewQueueItem) => void,
  onReject: (item: KycReviewQueueItem) => void,
  workingId: string | null,
): ColumnDef<KycReviewQueueItem>[] {
  return [
    {
      id: "provider",
      header: "Provider",
      cell: ({ row }) => {
        const { providerName, document } = row.original;
        return (
          <div className="flex flex-col">
            <span className="font-medium">
              {providerName ?? (
                <span className="text-muted-foreground italic">
                  Deleted provider
                </span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              {KYC_PROVIDER_TYPE_LABELS[document.providerType]}
              {row.original.ownerEmail ? ` · ${row.original.ownerEmail}` : ""}
            </span>
          </div>
        );
      },
    },
    {
      id: "documentType",
      header: "Document",
      cell: ({ row }) =>
        KYC_DOCUMENT_TYPE_LABELS[row.original.document.documentType] ??
        row.original.document.documentType,
    },
    {
      id: "submittedAt",
      header: "Submitted",
      cell: ({ row }) => formatDate(row.original.document.submittedAt),
    },
    {
      id: "expiresAt",
      header: "Expires",
      cell: ({ row }) => {
        const { expiresAt } = row.original.document;
        if (!expiresAt) return <span className="text-muted-foreground">—</span>;
        return isExpired(expiresAt) ? (
          <ToneBadge tone="danger">Expired {formatDate(expiresAt)}</ToneBadge>
        ) : (
          formatDate(expiresAt)
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <DocumentStatusBadge
          status={row.original.document.status}
          expired={isExpired(row.original.document.expiresAt)}
        />
      ),
    },
    {
      id: "claimedBy",
      header: "Claimed by",
      cell: ({ row }) => {
        const holder = claimHolder(row.original, viewerUid);
        if (holder.state === "unclaimed") {
          return <span className="text-muted-foreground">Unclaimed</span>;
        }
        return holder.state === "mine" ? (
          <Badge variant="secondary">You</Badge>
        ) : (
          <span className="text-sm">{holder.label}</span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const item = row.original;
        const busy = workingId === item.document._id;
        // Decided and superseded rows are history — the queue shows them so
        // past decisions can be audited, not re-litigated.
        const actionable =
          item.document.status === "SUBMITTED" ||
          item.document.status === "UNDER_REVIEW";
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => onView(item)}>
              View
            </Button>
            {actionable && !item.document.claimedByUid && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onClaim(item)}
              >
                Claim
              </Button>
            )}
            {actionable && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onApprove(item)}
                >
                  Approve
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onReject(item)}
                >
                  Reject
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];
}

function providerColumns(
  onOpen: (provider: KycProviderSummary) => void,
): ColumnDef<KycProviderSummary>[] {
  return [
    {
      id: "provider",
      header: "Provider",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">
            {row.original.providerName ?? (
              <span className="text-muted-foreground italic">
                Deleted provider
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {KYC_PROVIDER_TYPE_LABELS[row.original.providerType]}
            {row.original.ownerEmail ? ` · ${row.original.ownerEmail}` : ""}
          </span>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <VerificationStatusBadge status={row.original.verificationStatus} />
      ),
    },
    {
      id: "progress",
      header: "Approved",
      cell: ({ row }) => {
        const { approvedCount, requiredCount, pendingCount, rejectedCount } =
          row.original;
        return (
          <div className="flex flex-col">
            <span className="font-medium">
              {approvedCount}/{requiredCount}
            </span>
            <span className="text-xs text-muted-foreground">
              {pendingCount} waiting · {rejectedCount} rejected
            </span>
          </div>
        );
      },
    },
    {
      id: "lastSubmittedAt",
      header: "Last upload",
      cell: ({ row }) => formatDate(row.original.lastSubmittedAt),
    },
    {
      id: "lastDecisionAt",
      header: "Last decision",
      cell: ({ row }) => formatDate(row.original.lastDecisionAt),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpen(row.original)}
          >
            Open record
          </Button>
        </div>
      ),
    },
  ];
}

export default function VerificationsPage() {
  // Matches the sidebar entry's own capability: without this the nav link is
  // hidden for a role that lacks it, but the URL still renders the queue.
  return (
    <RequireCapability capability="kyc:review">
      <VerificationsWorkspace />
    </RequireCapability>
  );
}

function VerificationsWorkspace() {
  const { profile } = useAuth();
  const { can } = useCan();
  const canReview = can("kyc:review");
  const viewerUid = profile?._id;
  const queryClient = useQueryClient();

  // Appended to the approve/reject confirmations. Empty unless the decision
  // would take the document off another reviewer — the backend allows it and
  // audits it, but the reviewer should know before, not after.
  const overrideNotice = (item: KycReviewQueueItem) => {
    const holder = claimHolder(item, viewerUid);
    return holder.state === "other"
      ? ` ${holder.label} has this claimed — deciding it now overrides their claim, and that override is recorded.`
      : "";
  };

  // ── Queue view state ──────────────────────────────────────────────────
  const [claimedFilter, setClaimedFilter] = useState<ClaimedFilter>("all");
  const [queueStatus, setQueueStatus] = useState<QueueStatusFilter>("pending");
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [pageIndex, setPageIndex] = useState(0);

  // ── Providers view state ──────────────────────────────────────────────
  const [providerSearch, setProviderSearch] = useState("");
  const [providerStatus, setProviderStatus] = useState<
    KycVerificationStatus | "all"
  >("all");
  const [providerType, setProviderType] = useState<KycProviderType | "all">(
    "all",
  );
  const [providerPageSize, setProviderPageSize] = useState<number>(
    PAGE_SIZE_OPTIONS[0],
  );
  const [providerPageIndex, setProviderPageIndex] = useState(0);
  const [openProvider, setOpenProvider] = useState<ProviderRef | null>(null);
  const [caseFilter, setCaseFilter] = useState<CaseFilter>("ALL");
  const [casePage, setCasePage] = useState(0);
  const [caseSearch, setCaseSearch] = useState("");
  // The Review queue tab's inline inspector target — a case opened here stays
  // in the split pane rather than a dialog, so the queue is never hidden
  // behind it. Its own hasStagedDecisions flag (separate from the dialog's)
  // guards against a hotkey/click navigating away mid-review.
  const [selectedCase, setSelectedCase] = useState<ProviderRef | null>(null);
  const [caseHasStaged, setCaseHasStaged] = useState(false);
  // The case the admin is trying to switch to while decisions are still
  // staged. Held here rather than asked about through window.confirm: this
  // page already confirms destructive actions with ConfirmDialog, and a raw
  // browser dialog in the middle of that flow reads as a bug.
  const [pendingCase, setPendingCase] = useState<ProviderRef | null>(null);

  // ── Shared decision dialogs ───────────────────────────────────────────
  const [viewing, setViewing] = useState<ViewableDocument | null>(null);
  const [approveTarget, setApproveTarget] = useState<KycReviewQueueItem | null>(
    null,
  );
  const [rejectTarget, setRejectTarget] = useState<KycReviewQueueItem | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState("");
  const [rejectCode, setRejectCode] = useState<KycRejectionReasonCode | null>(
    null,
  );

  const filter = useMemo(
    () => ({
      claimed:
        claimedFilter === "all" ? undefined : claimedFilter === "claimed",
      // Omitted for the default queue so the backend applies its own
      // SUBMITTED/UNDER_REVIEW default.
      status:
        queueStatus === "pending"
          ? undefined
          : ([queueStatus] as KycDocumentStatus[]),
      limit: pageSize,
      offset: pageIndex * pageSize,
    }),
    [claimedFilter, queueStatus, pageSize, pageIndex],
  );

  const { data, isPending } = useQuery({
    queryKey: [QUERY_KEY, filter],
    queryFn: () => listKycReviewQueue(filter),
    enabled: canReview,
    // Hold the current page while the next one loads, and treat only the very
    // first load as "loading" — isFetching is also true on every background
    // refetch, which blanked the table on each filter/page change.
    placeholderData: keepPreviousData,
  });
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const providerFilter = useMemo(
    () => ({
      search: providerSearch.trim() || undefined,
      verificationStatus:
        providerStatus === "all" ? undefined : providerStatus,
      providerType: providerType === "all" ? undefined : providerType,
      limit: providerPageSize,
      offset: providerPageIndex * providerPageSize,
    }),
    [
      providerSearch,
      providerStatus,
      providerType,
      providerPageSize,
      providerPageIndex,
    ],
  );

  // The case queue reads the provider list rather than the document queue:
  // the unit of review is one provider's application. Pulled in a single wide
  // page so the metric tiles and the list always agree; revisit with
  // server-side case filtering when the directory outgrows this.
  // Filtering and counting both happen server-side: the tiles read kycMetrics
  // and the list asks for one page of the selected status. The previous version
  // pulled 200 providers and filtered in the browser, which could not survive
  // a real directory and disagreed with itself once paginated.
  const { data: caseMetrics } = useQuery({
    queryKey: ["kyc-metrics"],
    queryFn: () => getKycMetrics(),
    enabled: canReview,
    placeholderData: keepPreviousData,
  });

  const { data: caseData, isPending: casesPending } = useQuery({
    queryKey: [PROVIDERS_QUERY_KEY, "cases", caseFilter, casePage, caseSearch],
    queryFn: () =>
      listKycProviders({
        ...(caseFilter === "ALL" ? {} : { verificationStatus: caseFilter }),
        search: caseSearch.trim() || undefined,
        limit: CASE_PAGE_SIZE,
        offset: casePage * CASE_PAGE_SIZE,
      }),
    enabled: canReview,
    placeholderData: keepPreviousData,
  });
  const visibleCases = caseData?.data ?? [];
  const caseTotal = caseData?.total ?? 0;
  const casePageCount = Math.max(1, Math.ceil(caseTotal / CASE_PAGE_SIZE));

  // The Review queue tab's inline inspector — same query the modal dialog
  // uses (getKycProviderDetail), just rendered inline instead of in a Dialog.
  const {
    data: selectedCaseData,
    isPending: selectedCasePending,
    error: selectedCaseError,
  } = useQuery({
    queryKey: [
      PROVIDER_DETAIL_QUERY_KEY,
      selectedCase?.providerType,
      selectedCase?.providerId,
    ],
    queryFn: () =>
      getKycProviderDetail(selectedCase!.providerType, selectedCase!.providerId),
    enabled: !!selectedCase,
  });

// Moves the inspector to the next/previous case in the currently loaded
  // page. Shared by the J/K hotkey below and by "submit this case's review,
  // then advance" — both are real queue-navigation, never an auto-decision.
  function selectCaseByOffset(delta: number) {
    if (visibleCases.length === 0) return;
    const currentIndex = selectedCase
      ? visibleCases.findIndex(
          (p) =>
            p.providerType === selectedCase.providerType &&
            p.providerId === selectedCase.providerId,
        )
      : -1;
    const nextIndex =
      currentIndex === -1
        ? 0
        : Math.min(Math.max(currentIndex + delta, 0), visibleCases.length - 1);
    const next = visibleCases[nextIndex];
    if (currentIndex !== -1 && nextIndex === currentIndex) {
      // Already at the end of the loaded page — nothing to advance to.
      setSelectedCase(null);
      return;
    }
    setSelectedCase({
      providerId: next.providerId,
      providerType: next.providerType,
      providerName: next.providerName,
    });
  }

  // J/K (or arrow up/down) move the inspector to the next/previous case in
  // the currently loaded page — real queue navigation, not a mocked hotkey.
  // Approve/Reject/Claim stay mouse (or Tab+Enter) driven: they already work
  // reliably via CaseReviewPanel and don't need a second input path.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (typing) return;
      if (!["j", "k", "ArrowDown", "ArrowUp"].includes(e.key)) return;
      e.preventDefault();
      selectCaseByOffset(e.key === "j" || e.key === "ArrowDown" ? 1 : -1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCases, selectedCase]);

  const { data: providerData, isPending: providersPending } = useQuery({
    queryKey: [PROVIDERS_QUERY_KEY, providerFilter],
    queryFn: () => listKycProviders(providerFilter),
    enabled: canReview,
    placeholderData: keepPreviousData,
  });
  const providerRows = providerData?.data ?? [];
  const providerTotal = providerData?.total ?? 0;
  const providerPageCount = Math.max(
    1,
    Math.ceil(providerTotal / providerPageSize),
  );

  // A decision changes the queue, the provider rollup, AND the open record —
  // all three read the same documents, so all three are invalidated together.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    void queryClient.invalidateQueries({ queryKey: [PROVIDERS_QUERY_KEY] });
    void queryClient.invalidateQueries({
      queryKey: [PROVIDER_DETAIL_QUERY_KEY],
    });
  };

  const claimMutation = useMutation({
    mutationFn: (item: KycReviewQueueItem) =>
      claimKycDocument(item.document._id),
    onSuccess: () => {
      toast.success("Claimed for review.");
      refresh();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not claim this document.",
      ),
  });

  const approveMutation = useMutation({
    mutationFn: (item: KycReviewQueueItem) =>
      approveKycDocument(item.document._id),
    onSuccess: (_, item) => {
      toast.success(
        `${KYC_DOCUMENT_TYPE_LABELS[item.document.documentType]} approved.`,
      );
      setApproveTarget(null);
      refresh();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not approve document.",
      ),
  });

  const rejectMutation = useMutation({
    mutationFn: ({
      item,
      reason,
      note,
    }: {
      item: KycReviewQueueItem;
      reason: KycRejectionReasonCode;
      note: string;
    }) => rejectKycDocument(item.document._id, reason, note),
    onSuccess: () => {
      toast.success("Rejected. The partner is notified and can resubmit.");
      setRejectTarget(null);
      setRejectReason("");
      setRejectCode(null);
      refresh();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not reject document.",
      ),
  });

  // Each branch is gated by its OWN isPending: react-query keeps `variables`
  // after a mutation settles, so a shared `a.variables ?? b.variables` would
  // hand back the last *claimed* row while an approve is in flight — locking
  // the wrong row and leaving the live one double-clickable.
  const workingId =
    (claimMutation.isPending ? claimMutation.variables?.document._id : null) ??
    (approveMutation.isPending
      ? approveMutation.variables?.document._id
      : null) ??
    (rejectMutation.isPending
      ? rejectMutation.variables?.item.document._id
      : null) ??
    null;

  function requestReject(item: KycReviewQueueItem) {
    setRejectReason("");
    setRejectTarget(item);
  }

  function confirmReject() {
    // A structured reason is mandatory; the note only has to be filled in for
    // OTHER, where the standard sentence says nothing actionable on its own.
    if (!rejectTarget || !rejectCode) return;
    if (rejectCode === "OTHER" && !rejectReason.trim()) return;
    rejectMutation.mutate({
      item: rejectTarget,
      reason: rejectCode,
      note: rejectReason,
    });
  }

  function viewQueueDocument(item: KycReviewQueueItem) {
    setViewing({
      documentId: item.document._id,
      documentType: item.document.documentType,
      governmentIdType: item.document.governmentIdType,
      mimeType: item.document.mimeType,
      expiresAt: item.document.expiresAt,
      providerName: item.providerName,
      providerType: item.document.providerType,
    });
  }

  /**
   * Adapts a provider-detail row into the queue-row shape the approve/reject
   * dialogs take. The dialogs need a claim holder and a provider name to write
   * their copy; a detail row has neither, so both are supplied as null —
   * meaning no override notice is shown from this path. That is correct: the
   * detail view surfaces the claim holder in the row's own metadata line.
   */
  function asQueueItem(
    row: KycProviderDocumentView,
    providerName: string | null = openProvider?.providerName ?? null,
  ): KycReviewQueueItem {
    return {
      document: row.document,
      providerName,
      ownerEmail: null,
      claimedByEmail: row.claimedByEmail,
    };
  }

  if (!canReview) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <h1 className="text-xl font-semibold">Verifications</h1>
        <p className="text-sm text-muted-foreground">
          You do not have access to the verification review queue.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Verifications</h1>
        <p className="text-sm text-muted-foreground">
          Review KYC submissions from laundromats and home washers. Approving
          every required check grants the provider its Verified badge and
          notifies them; rejecting one sends them the reason you write.
        </p>
      </div>

      <Tabs defaultValue="cases">
        <TabsList>
          <TabsTrigger value="cases">Review queue</TabsTrigger>
          <TabsTrigger value="providers">All providers</TabsTrigger>
          {/* Document-level view kept for auditing a single file's history —
              it is no longer the way work is picked up. */}
          <TabsTrigger value="queue">
            Documents
            {queueStatus === "pending" && total > 0 && (
              <Badge variant="secondary">{total}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cases" className="flex flex-col gap-4 pt-4">
          {/* ── OPERATIONAL METRICS BAR ──────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
            <span className="text-sm font-medium">Operational metrics</span>
            <Badge variant="outline">
              Queue: {caseMetrics?.pendingReview ?? "—"} pending
            </Badge>
            <Badge variant="outline">
              Avg. review: {formatHours(caseMetrics?.avgHoursToDecision ?? null)}
            </Badge>
            <Badge variant="outline">
              {caseMetrics?.rejectionRate != null
                ? `${Math.round(caseMetrics.rejectionRate * 100)}% rejected`
                : "— rejected"}{" "}
              (30d)
            </Badge>
            {caseMetrics?.oldestPendingSubmittedAt && (
              <Badge variant="outline">
                Oldest waiting: {formatAge(caseMetrics.oldestPendingSubmittedAt)}
              </Badge>
            )}
          </div>

          <CaseMetrics
            metrics={caseMetrics}
            active={caseFilter}
            onSelect={(f) => {
              setCaseFilter(f);
              setCasePage(0);
              setSelectedCase(null);
            }}
          />

          {/* ── SPLIT PANE: STREAM QUEUE + INSPECTOR ─────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="flex flex-col gap-2">
              <Input
                value={caseSearch}
                onChange={(e) => {
                  setCaseSearch(e.target.value);
                  setCasePage(0);
                }}
                placeholder="Filter/Search…"
                aria-label="Search cases"
              />
              <CaseStreamList
                providers={visibleCases}
                selectedKey={
                  selectedCase
                    ? `${selectedCase.providerType}:${selectedCase.providerId}`
                    : null
                }
                isLoading={casesPending}
                emptyMessage={
                  caseFilter === "ALL"
                    ? "No verification cases yet."
                    : "Nothing in this state right now."
                }
                onSelect={(p) => {
                  const next = {
                    providerId: p.providerId,
                    providerType: p.providerType,
                    providerName: p.providerName,
                  };
                  if (caseHasStaged) {
                    setPendingCase(next);
                    return;
                  }
                  setSelectedCase(next);
                }}
              />
              {casePageCount > 1 && (
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    Page {casePage + 1}/{casePageCount} · {caseTotal} case
                    {caseTotal === 1 ? "" : "s"}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={casePage === 0}
                      onClick={() => setCasePage((p) => Math.max(0, p - 1))}
                    >
                      Prev
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={casePage + 1 >= casePageCount}
                      onClick={() => setCasePage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="min-w-0 rounded-lg border p-4">
              {!selectedCase ? (
                <div className="flex h-full min-h-64 items-center justify-center text-center text-sm text-muted-foreground">
                  Select a case from the queue to review it here.
                </div>
              ) : selectedCaseError ? (
                <p className="text-sm text-destructive">
                  {selectedCaseError instanceof ApiError
                    ? selectedCaseError.message
                    : "Could not load this case."}
                </p>
              ) : selectedCasePending || !selectedCaseData ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">
                      {selectedCase.providerName ?? "Deleted provider"}
                    </h2>
                    <VerificationStatusBadge
                      status={selectedCaseData.summary.verificationStatus}
                    />
                    <span className="text-xs text-muted-foreground">
                      {KYC_PROVIDER_TYPE_LABELS[selectedCase.providerType]}
                      {selectedCaseData.summary.ownerEmail
                        ? ` · ${selectedCaseData.summary.ownerEmail}`
                        : ""}
                    </span>
                  </div>
                  <ProviderCaseContent
                    dense
                    provider={selectedCase}
                    data={selectedCaseData}
                    onApprove={(row) =>
                      setApproveTarget(asQueueItem(row, selectedCase.providerName))
                    }
                    onReject={(row) =>
                      requestReject(asQueueItem(row, selectedCase.providerName))
                    }
                    onView={setViewing}
                    workingDocumentId={workingId}
                    onDone={() => {
                      refresh();
                      // A real submitted decision, not an auto-approval —
                      // "& Next" only ever fires after CaseReviewPanel's own
                      // Complete verification button actually sent one.
                      selectCaseByOffset(1);
                    }}
                    onStagedChange={setCaseHasStaged}
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── HOTKEYS ───────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Hotkeys:</span>
            <span>
              <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono">
                J
              </kbd>{" "}
              /{" "}
              <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono">
                K
              </kbd>{" "}
              move through the queue
            </span>
            <span>
              <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono">
                Tab
              </kbd>{" "}
              +{" "}
              <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono">
                Enter
              </kbd>{" "}
              approves/rejects the focused item
            </span>
          </div>
        </TabsContent>

        <TabsContent value="queue" className="flex flex-col gap-4 pt-4">
          <DataTableToolbar
            search=""
            onSearchChange={() => undefined}
            hideSearch
            filters={
              <>
                <Select
                  value={queueStatus}
                  onValueChange={(value) => {
                    if (!value) return;
                    setQueueStatus(value as QueueStatusFilter);
                    setPageIndex(0);
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Awaiting review</SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                    <SelectItem value="SUPERSEDED">Replaced</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={claimedFilter}
                  onValueChange={(value) => {
                    if (!value) return;
                    setClaimedFilter(value as ClaimedFilter);
                    setPageIndex(0);
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any claim</SelectItem>
                    <SelectItem value="unclaimed">Unclaimed</SelectItem>
                    <SelectItem value="claimed">Claimed</SelectItem>
                  </SelectContent>
                </Select>
              </>
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
        tableId="verifications-queue"
            columns={queueColumns(
              viewerUid,
              viewQueueDocument,
              (item) => claimMutation.mutate(item),
              setApproveTarget,
              requestReject,
              workingId,
            )}
            data={rows}
            isLoading={isPending}
            emptyMessage={
              queueStatus === "pending"
                ? "Nothing is waiting for review."
                : "No documents with this status."
            }
          />
        </TabsContent>

        <TabsContent value="providers" className="flex flex-col gap-4 pt-4">
          <DataTableToolbar
            search={providerSearch}
            onSearchChange={(value) => {
              setProviderSearch(value);
              setProviderPageIndex(0);
            }}
            filters={
              <>
                <Select
                  value={providerStatus}
                  onValueChange={(value) => {
                    if (!value) return;
                    setProviderStatus(value as KycVerificationStatus | "all");
                    setProviderPageIndex(0);
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="PENDING">Incomplete</SelectItem>
                    <SelectItem value="IN_REVIEW">In review</SelectItem>
                    <SelectItem value="APPROVED">Verified</SelectItem>
                    <SelectItem value="REJECTED">Action required</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={providerType}
                  onValueChange={(value) => {
                    if (!value) return;
                    setProviderType(value as KycProviderType | "all");
                    setProviderPageIndex(0);
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="MERCHANT_BRANCH">Laundromats</SelectItem>
                    <SelectItem value="WASHER">Home washers</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
            limit={providerPageSize}
            onLimitChange={(limit) => {
              setProviderPageSize(limit);
              setProviderPageIndex(0);
            }}
            page={providerPageIndex + 1}
            totalPages={providerPageCount}
            onPageChange={(page) => setProviderPageIndex(page - 1)}
          />

          <DataTable
        tableId="verifications-providers"
            columns={providerColumns((provider) =>
              setOpenProvider({
                providerId: provider.providerId,
                providerType: provider.providerType,
                providerName: provider.providerName,
              }),
            )}
            data={providerRows}
            isLoading={providersPending}
            emptyMessage="No providers match these filters."
          />
        </TabsContent>
      </Tabs>

      <DocumentViewer item={viewing} onClose={() => setViewing(null)} />

      <ProviderDetailDialog
        provider={openProvider}
        onClose={() => setOpenProvider(null)}
        onApprove={(row) => setApproveTarget(asQueueItem(row))}
        onReject={(row) => requestReject(asQueueItem(row))}
        workingDocumentId={workingId}
      />

      <ConfirmDialog
        open={!!approveTarget}
        onOpenChange={(open) => !open && setApproveTarget(null)}
        title="Approve this document?"
        description={
          approveTarget &&
          `${KYC_DOCUMENT_TYPE_LABELS[approveTarget.document.documentType]} for ${approveTarget.providerName ?? "this provider"}. Once every required document is approved, the provider gets its Verified badge.${
            isExpired(approveTarget.document.expiresAt)
              ? " This document has already expired, so it will not grant the badge."
              : ""
          }${overrideNotice(approveTarget)}`
        }
        confirmLabel="Approve"
        onConfirm={() => approveTarget && approveMutation.mutate(approveTarget)}
      />

      <Dialog
        open={!!rejectTarget}
        onOpenChange={(open) => !open && setRejectTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this document?</DialogTitle>
            <DialogDescription>
              Pick what was wrong. The partner is pushed the matching
              instruction with a button to upload a replacement; anything you
              add below is appended to it.
              {rejectTarget && overrideNotice(rejectTarget)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {KYC_REJECTION_REASONS.map((r) => (
              <label
                key={r.code}
                className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm ${
                  rejectCode === r.code ? "border-primary bg-primary/5" : ""
                }`}
              >
                <input
                  type="radio"
                  name="reject-reason"
                  value={r.code}
                  checked={rejectCode === r.code}
                  onChange={() => setRejectCode(r.code)}
                />
                {r.label}
              </label>
            ))}
          </div>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={
              rejectCode === "OTHER"
                ? "Required — describe what needs fixing."
                : "Optional extra instruction for the partner."
            }
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !rejectCode ||
                (rejectCode === "OTHER" && !rejectReason.trim()) ||
                rejectMutation.isPending
              }
              onClick={confirmReject}
            >
              {rejectMutation.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingCase != null}
        onOpenChange={(open) => !open && setPendingCase(null)}
        title="Discard unsubmitted decisions?"
        description="You have decisions on this case that haven't been submitted. Switching cases discards them."
        confirmLabel="Discard and switch"
        onConfirm={() => {
          setCaseHasStaged(false);
          setSelectedCase(pendingCase);
          setPendingCase(null);
        }}
      />
    </div>
  );
}
