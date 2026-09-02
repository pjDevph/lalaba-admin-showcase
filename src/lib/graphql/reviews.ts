import { graphqlFetch } from "@/lib/api-client";

/**
 * REVIEW MODERATION — reactive, not pre-publish.
 *
 * Reviews go live immediately; a report flags one for a human but never hides
 * it. Only a takedown hides a review, and a takedown subtracts it from the
 * provider's public average — which is why restoring one has to add it back,
 * and why both are audited.
 *
 * Hand-maintained mirror of LALABA_BE_DEV/src/ratings/*.
 */

export type RatingScores = {
  quality: number;
  speed: number;
  valueForMoney: number;
  delivery: number;
  communication: number;
};

export const SCORE_LABELS: Record<keyof RatingScores, string> = {
  quality: "Quality",
  speed: "Speed",
  valueForMoney: "Value",
  delivery: "Delivery",
  communication: "Communication",
};

export type Review = {
  _id: string;
  orderId: string;
  customerUid: string;
  providerType: "MERCHANT" | "WASHER";
  branchId: string;
  scores: RatingScores;
  overallScore: number;
  comment: string | null;
  providerResponse: { text: string; respondedAt: string } | null;
  isReported: boolean;
  reportReason: string | null;
  isRemoved: boolean;
  removalReason: string | null;
  restoredReason: string | null;
  reportDismissedReason: string | null;
  reportDismissedAt: string | null;
  createdAt: string | null;
};

const REVIEW_FIELDS = `
  _id
  orderId
  customerUid
  providerType
  branchId
  scores { quality speed valueForMoney delivery communication }
  overallScore
  comment
  providerResponse { text respondedAt }
  isReported
  reportReason
  isRemoved
  removalReason
  restoredReason
  reportDismissedReason
  reportDismissedAt
  createdAt
`;

const QUEUE_QUERY = `
  query RatingModerationQueue(
    $reported: Boolean
    $removed: Boolean
    $limit: Int
    $offset: Int
  ) {
    ratingModerationQueue(
      reported: $reported
      removed: $removed
      limit: $limit
      offset: $offset
    ) {
      data { ${REVIEW_FIELDS} }
      total
    }
  }
`;

export async function fetchModerationQueue(opts: {
  reported?: boolean;
  removed?: boolean;
  limit: number;
  offset: number;
}) {
  const { ratingModerationQueue } = await graphqlFetch<{
    ratingModerationQueue: { data: Review[]; total: number };
  }>(QUEUE_QUERY, {
    reported: opts.reported ?? null,
    removed: opts.removed ?? null,
    limit: opts.limit,
    offset: opts.offset,
  });
  return ratingModerationQueue;
}

const TAKEDOWN = `
  mutation ModerateTakedown($ratingId: ID!, $reason: String!) {
    moderateTakedown(ratingId: $ratingId, reason: $reason) { _id isRemoved }
  }
`;

/** Hides the review AND subtracts it from the provider's public average. */
export function removeReview(ratingId: string, reason: string) {
  return graphqlFetch(TAKEDOWN, { ratingId, reason });
}

const RESTORE = `
  mutation RestoreRating($ratingId: ID!, $reason: String!) {
    restoreRating(ratingId: $ratingId, reason: $reason) { _id isRemoved }
  }
`;

/** Puts it back and re-adds it to the average. Safe to click twice. */
export function restoreReview(ratingId: string, reason: string) {
  return graphqlFetch(RESTORE, { ratingId, reason });
}

const DISMISS = `
  mutation DismissRatingReport($ratingId: ID!, $reason: String!) {
    dismissRatingReport(ratingId: $ratingId, reason: $reason) {
      _id
      isReported
    }
  }
`;

/** Clears the flag and leaves the review up — the queue's other exit. */
export function dismissReviewReport(ratingId: string, reason: string) {
  return graphqlFetch(DISMISS, { ratingId, reason });
}
