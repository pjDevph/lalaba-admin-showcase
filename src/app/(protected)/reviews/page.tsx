"use client";

// Review moderation.
//
// Moderation here is REACTIVE by design: reviews publish immediately and a
// report flags one for a human without hiding it. Only a takedown hides a
// review — and because a takedown also subtracts it from the provider's public
// average, every decision on this page moves a number a business is judged on.
//
// Rendered as cards rather than table rows on purpose. A moderator has to read
// the actual words before deciding, and a truncated cell in a dense table is
// how a review gets removed on the strength of its first six words.

import { useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { FlagIcon, StarIcon } from "lucide-react";

import { RequireCapability } from "@/components/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTableToolbar,
  PAGE_SIZE_OPTIONS,
} from "@/components/ui/data-table-toolbar";
import {
  REVIEW_DISMISS_REASONS,
  REVIEW_RESTORE_REASONS,
  REVIEW_TAKEDOWN_REASONS,
  ReasonCodeDialog,
} from "@/components/ui/reason-code-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ToneBadge } from "@/components/ui/status-badge";
import { ApiError } from "@/lib/api-client";
import {
  dismissReviewReport,
  fetchModerationQueue,
  removeReview,
  restoreReview,
  SCORE_LABELS,
  type RatingScores,
  type Review,
} from "@/lib/graphql/reviews";

const QUERY_KEY = "review-moderation-queue";

type Action = { kind: "remove" | "restore" | "dismiss"; review: Review };

export default function ReviewsPage() {
  return (
    <RequireCapability capability="review:moderate">
      <ReviewQueue />
    </RequireCapability>
  );
}

function ReviewQueue() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"pending" | "removed" | "all">("pending");
  const [limit, setLimit] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<Action | null>(null);

  const filter = useMemo(
    () => ({
      // "Pending" is reported-and-still-up: the ones where the platform has
      // been asked to act and has not. That is the queue; the rest is history.
      reported: view === "pending" ? true : undefined,
      removed: view === "removed" ? true : undefined,
      limit,
      offset: (page - 1) * limit,
    }),
    [view, limit, page],
  );

  const { data, isPending, isError } = useQuery({
    queryKey: [QUERY_KEY, filter],
    queryFn: () => fetchModerationQueue(filter),
    placeholderData: keepPreviousData,
  });

  const mutation = useMutation({
    mutationFn: ({
      kind,
      review,
      reason,
    }: Action & { reason: string }) =>
      kind === "remove"
        ? removeReview(review._id, reason)
        : kind === "restore"
          ? restoreReview(review._id, reason)
          : dismissReviewReport(review._id, reason),
    onSuccess: (_r, { kind }) => {
      toast.success(
        kind === "remove"
          ? "Review removed and taken out of the provider's average."
          : kind === "restore"
            ? "Review restored and added back to the average."
            : "Report cleared. The review stays up.",
      );
      setAction(null);
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not update this review.",
      ),
  });

  const reviews = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Reviews</h1>
        <p className="text-sm text-muted-foreground">
          Reported and removed reviews. Removing one hides it and subtracts it
          from the provider&apos;s public average — restoring puts both back.
        </p>
      </div>

      <DataTableToolbar
        search=""
        onSearchChange={() => undefined}
        hideSearch
        filters={
          <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
            {(
              [
                ["pending", "Needs a decision"],
                ["removed", "Removed"],
                ["all", "All"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={view === value ? "outline" : "ghost"}
                className={`h-7 px-2 text-xs ${view === value ? "bg-background" : ""}`}
                aria-pressed={view === value}
                onClick={() => {
                  setView(value);
                  setPage(1);
                }}
              >
                {label}
              </Button>
            ))}
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

      {isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">
          Could not load the moderation queue.
        </p>
      ) : reviews.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center rounded-lg border text-center text-sm text-muted-foreground">
          {view === "pending"
            ? "Nothing reported. Every review has had a decision."
            : "Nothing here."}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {reviews.map((review) => (
            <li key={review._id}>
              <ReviewCard
                review={review}
                pending={mutation.isPending}
                onAction={(kind) => setAction({ kind, review })}
              />
            </li>
          ))}
        </ul>
      )}

      <ReasonCodeDialog
        open={action?.kind === "remove"}
        onOpenChange={(open) => !open && setAction(null)}
        title="Remove this review?"
        description="It stops being visible and is subtracted from the provider's public average. The customer is not told. This can be undone."
        reasons={REVIEW_TAKEDOWN_REASONS}
        confirmLabel="Remove review"
        pending={mutation.isPending}
        onConfirm={(reason, note) =>
          action &&
          mutation.mutate({
            ...action,
            reason: note ? `${reason}: ${note}` : reason,
          })
        }
      />

      <ReasonCodeDialog
        open={action?.kind === "restore"}
        onOpenChange={(open) => !open && setAction(null)}
        title="Put this review back?"
        description="It becomes visible again and is added back to the provider's average. The original removal reason stays on the record."
        reasons={REVIEW_RESTORE_REASONS}
        confirmLabel="Restore review"
        destructive={false}
        pending={mutation.isPending}
        onConfirm={(reason, note) =>
          action &&
          mutation.mutate({
            ...action,
            reason: note ? `${reason}: ${note}` : reason,
          })
        }
      />

      <ReasonCodeDialog
        open={action?.kind === "dismiss"}
        onOpenChange={(open) => !open && setAction(null)}
        title="Leave this review up?"
        description="Clears the report. The review stays exactly as it is, and it leaves this queue."
        reasons={REVIEW_DISMISS_REASONS}
        confirmLabel="Keep review"
        destructive={false}
        pending={mutation.isPending}
        onConfirm={(reason, note) =>
          action &&
          mutation.mutate({
            ...action,
            reason: note ? `${reason}: ${note}` : reason,
          })
        }
      />
    </div>
  );
}

function ReviewCard({
  review,
  pending,
  onAction,
}: {
  review: Review;
  pending: boolean;
  onAction: (kind: Action["kind"]) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Stars score={review.overallScore} />
          <Badge variant="outline">
            {review.providerType === "WASHER" ? "Home washer" : "Laundromat"}
          </Badge>
          {review.isReported && (
            <ToneBadge tone="pending">
              <FlagIcon className="size-3" />
              Reported
            </ToneBadge>
          )}
          {review.isRemoved && <ToneBadge tone="danger">Removed</ToneBadge>}
          {review.reportDismissedAt && !review.isReported && (
            <ToneBadge tone="success">Kept</ToneBadge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {review.createdAt
            ? new Date(review.createdAt).toLocaleDateString("en-PH")
            : "—"}
        </span>
      </div>

      {/* The full comment, never truncated — a moderator has to read the words
          before deciding, and a clipped one invites a decision on a fragment. */}
      <p className="text-sm whitespace-pre-wrap">
        {review.comment ?? (
          <span className="text-muted-foreground">
            Scores only — the customer left no comment.
          </span>
        )}
      </p>

      <ScoreBreakdown scores={review.scores} />

      {review.providerResponse && (
        <div className="rounded-md border-l-2 bg-muted/50 py-2 pl-3 text-sm">
          <div className="mb-0.5 text-xs text-muted-foreground">
            Provider replied
          </div>
          {review.providerResponse.text}
        </div>
      )}

      {/* Why it was reported, and what has already been decided. A moderator
          needs the history to avoid re-litigating a call someone else made. */}
      <dl className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        {review.reportReason && (
          <div>
            <dt className="inline font-medium">Reported: </dt>
            <dd className="inline">{review.reportReason}</dd>
          </div>
        )}
        {review.removalReason && (
          <div>
            <dt className="inline font-medium">Removed: </dt>
            <dd className="inline">{review.removalReason}</dd>
          </div>
        )}
        {review.restoredReason && (
          <div>
            <dt className="inline font-medium">Restored: </dt>
            <dd className="inline">{review.restoredReason}</dd>
          </div>
        )}
        {review.reportDismissedReason && (
          <div>
            <dt className="inline font-medium">Kept: </dt>
            <dd className="inline">{review.reportDismissedReason}</dd>
          </div>
        )}
        <div>
          <dt className="inline font-medium">Order: </dt>
          <dd className="inline font-mono">{review.orderId}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2 border-t pt-3">
        {review.isRemoved ? (
          <Button size="sm" disabled={pending} onClick={() => onAction("restore")}>
            Put back
          </Button>
        ) : (
          <>
            {/* "Keep" first: leaving a review up is the default outcome, and
                the destructive action should not be the easiest to hit. */}
            {review.isReported && (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => onAction("dismiss")}
              >
                Keep review
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => onAction("remove")}
            >
              Remove
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Stars({ score }: { score: number }) {
  const rounded = Math.round(score);
  return (
    <span className="flex items-center gap-1" aria-label={`${score} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon
          key={n}
          className={
            n <= rounded
              ? "size-4 fill-[var(--status-pending)] text-[var(--status-pending)]"
              : "size-4 text-muted-foreground/40"
          }
        />
      ))}
      <span className="ml-1 text-sm font-medium tabular-nums">
        {score.toFixed(1)}
      </span>
    </span>
  );
}

function ScoreBreakdown({ scores }: { scores: RatingScores }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {(Object.keys(SCORE_LABELS) as (keyof RatingScores)[]).map((key) => (
        <span key={key}>
          {SCORE_LABELS[key]}{" "}
          <span className="font-medium text-foreground tabular-nums">
            {scores[key]}
          </span>
        </span>
      ))}
    </div>
  );
}
