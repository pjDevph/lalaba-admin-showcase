/**
 * The one place that decides what a status LOOKS like.
 *
 * Every status enum in the platform maps to one of five tones, and a tone
 * always means the same thing on every screen:
 *
 *   pending  waiting on someone — no decision has been made yet
 *   info     in progress — something is actively moving
 *   success  approved / completed / settled
 *   danger   rejected / failed / disputed / suspended
 *   neutral  archived / inactive / superseded / not applicable
 *
 * Before this file each page hand-picked Badge variants, which meant
 * "approved" was `variant="default"` — i.e. `--primary`, the one token the
 * theme picker swaps. An admin on the Rose theme saw approvals in pink. Tones
 * resolve to the pinned `--status-*` tokens in globals.css instead, so they
 * are identical under every theme.
 *
 * Adding a status: add it here, not at the call site. An unregistered value
 * still renders (title-cased, neutral tone) rather than crashing — a new
 * backend enum member must never blank out a support agent's queue.
 */

export type StatusTone = "pending" | "info" | "success" | "danger" | "neutral";

/**
 * Coarse grouping for filter UIs. The order lifecycle has 33 members, which
 * is unusable as a flat list of filter chips — support thinks in these five
 * buckets, so that is what the FilterBar offers.
 */
export type StatusBucket =
  | "placed"
  | "in_progress"
  | "completed"
  | "disputed"
  | "cancelled";

export type StatusMeta = {
  label: string;
  tone: StatusTone;
  bucket?: StatusBucket;
};

// ── Order lifecycle ─────────────────────────────────────────────────────────
// Mirrors LALABA_BE_DEV/src/online-orders/schemas/order-status.enum.ts. Keep
// in sync — this project has no GraphQL codegen.
//
// Tone assignment follows one rule: who is the platform waiting on? A state
// where nobody is acting yet (awaiting assignment, pending acceptance) is
// `pending`; once a courier or a washing machine is actually working it is
// `info`. A failed attempt is `danger` even though the order continues —
// support needs to spot it in a scan of 200 rows.
export const ORDER_STATUS: Record<string, StatusMeta> = {
  draft: { label: "Draft", tone: "neutral", bucket: "placed" },
  pricing_validated: { label: "Pricing validated", tone: "pending", bucket: "placed" },
  pending_provider_acceptance: {
    label: "Awaiting provider",
    tone: "pending",
    bucket: "placed",
  },

  provider_change_proposed: {
    label: "Change proposed",
    tone: "pending",
    bucket: "placed",
  },
  accepted_by_provider: { label: "Accepted", tone: "info", bucket: "in_progress" },
  rejected_by_provider: {
    label: "Rejected by provider",
    tone: "danger",
    bucket: "cancelled",
  },
  cancelled: { label: "Cancelled", tone: "danger", bucket: "cancelled" },

  awaiting_pickup_assignment: {
    label: "Awaiting pickup assignment",
    tone: "pending",
    bucket: "in_progress",
  },
  pickup_assigned: { label: "Pickup assigned", tone: "info", bucket: "in_progress" },
  pickup_en_route: { label: "Pickup en route", tone: "info", bucket: "in_progress" },
  pickup_arrived: { label: "Pickup arrived", tone: "info", bucket: "in_progress" },
  pickup_weighed: { label: "Weighed", tone: "info", bucket: "in_progress" },
  picked_up_from_customer: { label: "Picked up", tone: "info", bucket: "in_progress" },
  pickup_attempt_failed: {
    label: "Pickup failed",
    tone: "danger",
    bucket: "in_progress",
  },
  awaiting_pickup_reschedule: {
    label: "Awaiting reschedule",
    tone: "pending",
    bucket: "in_progress",
  },

  received_by_provider: { label: "Dropped off", tone: "info", bucket: "in_progress" },

  laundry_in_progress: { label: "Washing", tone: "info", bucket: "in_progress" },
  laundry_quality_hold: {
    label: "Quality hold",
    tone: "danger",
    bucket: "in_progress",
  },
  laundry_ready: { label: "Ready", tone: "info", bucket: "in_progress" },

  awaiting_return_selection: {
    label: "Awaiting return choice",
    tone: "pending",
    bucket: "in_progress",
  },

  awaiting_return_assignment: {
    label: "Awaiting return assignment",
    tone: "pending",
    bucket: "in_progress",
  },
  return_assigned: { label: "Return assigned", tone: "info", bucket: "in_progress" },
  return_en_route: { label: "Return en route", tone: "info", bucket: "in_progress" },
  return_arrived: { label: "Return arrived", tone: "info", bucket: "in_progress" },
  delivered_to_customer: {
    label: "Delivered",
    tone: "success",
    bucket: "completed",
  },
  delivery_attempted: {
    label: "Delivery failed",
    tone: "danger",
    bucket: "in_progress",
  },
  returned_to_provider: {
    label: "Back with provider",
    tone: "pending",
    bucket: "in_progress",
  },
  awaiting_redelivery_selection: {
    label: "Awaiting redelivery choice",
    tone: "pending",
    bucket: "in_progress",
  },
  redelivery_scheduled: {
    label: "Redelivery scheduled",
    tone: "info",
    bucket: "in_progress",
  },

  awaiting_customer_pickup: {
    label: "Awaiting customer pickup",
    tone: "pending",
    bucket: "in_progress",
  },
  customer_pickup_verified: {
    label: "Collected",
    tone: "success",
    bucket: "completed",
  },

  completed: { label: "Completed", tone: "success", bucket: "completed" },
  refunded: { label: "Refunded", tone: "neutral", bucket: "cancelled" },
  disputed: { label: "Disputed", tone: "danger", bucket: "disputed" },
  // Money the platform is owed and nobody is chasing automatically any more.
  // Never `neutral` — this is the Unsettled Orders queue's whole reason to
  // exist, and it must not read as "archived, nothing to do".
  abandoned_unsettled: {
    label: "Abandoned · unsettled",
    tone: "danger",
    bucket: "disputed",
  },
};

export const ORDER_BUCKET_LABELS: Record<StatusBucket, string> = {
  placed: "Placed",
  in_progress: "In progress",
  completed: "Completed",
  disputed: "Disputed",
  cancelled: "Cancelled",
};

/** Every order status in one bucket — for building filter chips. */
export function orderStatusesInBucket(bucket: StatusBucket): string[] {
  return Object.entries(ORDER_STATUS)
    .filter(([, meta]) => meta.bucket === bucket)
    .map(([status]) => status);
}

// ── Failed pickup/delivery attempts ─────────────────────────────────────────
// Mirrors AttemptResponsibility in the backend's order-status.enum.ts.
//
// CUSTOMER is the only one that can carry a fee — the backend's own comment on
// the enum says provider- and system-caused attempts never do — so it is the
// only one that reads `danger`. PROVIDER is `pending` rather than `danger`
// because the order is still ours to rescue: someone has to go back out.
export const ATTEMPT_RESPONSIBILITY: Record<string, StatusMeta> = {
  CUSTOMER: { label: "Customer", tone: "danger" },
  PROVIDER: { label: "Provider", tone: "pending" },
  SYSTEM: { label: "System", tone: "neutral" },
};

// ── Verification / KYC ──────────────────────────────────────────────────────
// IN_REVIEW is `info`, not `pending`: the provider has done everything and the
// queue owes them an answer. PENDING is the opposite — we are waiting on them.
export const VERIFICATION_STATUS: Record<string, StatusMeta> = {
  PENDING: { label: "Pending", tone: "pending" },
  IN_REVIEW: { label: "In review", tone: "info" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

export const DOCUMENT_STATUS: Record<string, StatusMeta> = {
  SUBMITTED: { label: "Submitted", tone: "pending" },
  UNDER_REVIEW: { label: "Under review", tone: "info" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  // History, not state — it should recede.
  SUPERSEDED: { label: "Replaced", tone: "neutral" },
};

/**
 * The derived state of a verification CASE — see `caseState()` in
 * components/kyc/case-queue.tsx, which collapses a provider's badge plus its
 * document counts into the one thing a reviewer acts on.
 *
 * NEEDS_REVIEW is amber and IN_REVIEW is blue, which is the reverse of what
 * this queue used before it moved here. The rule the whole palette follows is
 * "amber = waiting, nobody is working it; blue = actively in flight", and
 * IN_REVIEW means precisely that a reviewer has claimed the case. NEEDS_REVIEW
 * is the backlog — it should look like the queue, not like progress.
 */
export const CASE_STATE: Record<string, StatusMeta> = {
  INCOMPLETE: { label: "Incomplete", tone: "neutral" },
  NEEDS_REVIEW: { label: "Needs review", tone: "pending" },
  IN_REVIEW: { label: "In review", tone: "info" },
  ACTION_NEEDED: { label: "Action needed", tone: "danger" },
  VERIFIED: { label: "Verified", tone: "success" },
  // Same place in the pipeline as VERIFIED — how they got there is shown
  // elsewhere, not encoded in the colour.
  LEGACY_VERIFIED: { label: "Verified", tone: "success" },
};

// ── Money ───────────────────────────────────────────────────────────────────
// BALANCE_DUE is `danger`, not `pending`: it only happens after a
// post-collection surcharge left a shortfall, so it is money already at risk
// rather than money not yet asked for.
export const PAYMENT_STATUS: Record<string, StatusMeta> = {
  UNPAID: { label: "Unpaid", tone: "pending" },
  BALANCE_DUE: { label: "Balance due", tone: "danger" },
  PAID: { label: "Paid", tone: "success" },
};

/**
 * A wallet's health, derived by `walletState()` below rather than stored.
 *
 * VARIANCE outranks everything: a wallet whose stored balance disagrees with
 * its own ledger is a financial-integrity failure, and it must not be shown as
 * merely "low" because it also happens to be under the accept minimum.
 */
export const WALLET_STATE: Record<string, StatusMeta> = {
  VARIANCE: { label: "Variance", tone: "danger" },
  NOT_ACTIVATED: { label: "Not activated", tone: "neutral" },
  BELOW_MINIMUM: { label: "Below minimum", tone: "pending" },
  HEALTHY: { label: "Healthy", tone: "success" },
};

export type WalletState = keyof typeof WALLET_STATE;

/**
 * The single answer for a wallet row, in priority order. Kept here beside the
 * registry so the badge, the filter chips and any future alert all agree on
 * what "unhealthy" means.
 */
export function walletState(wallet: {
  varianceCentavos: number;
  activatedAt: string | null;
  meetsAcceptMinimum: boolean;
}): WalletState {
  if (wallet.varianceCentavos !== 0) return "VARIANCE";
  if (wallet.activatedAt == null) return "NOT_ACTIVATED";
  if (!wallet.meetsAcceptMinimum) return "BELOW_MINIMUM";
  return "HEALTHY";
}

export const FEE_RULE_STATUS: Record<string, StatusMeta> = {
  active: { label: "Active", tone: "success" },
  scheduled: { label: "Scheduled", tone: "info" },
  expired: { label: "Expired", tone: "neutral" },
  inactive: { label: "Inactive", tone: "neutral" },
};

/**
 * Promo code status — shares FEE_RULE_STATUS's vocabulary plus "exhausted",
 * a state a fee rule has no equivalent of (a fee never runs out).
 */
export const PROMO_STATUS: Record<string, StatusMeta> = {
  active: { label: "Active", tone: "success" },
  scheduled: { label: "Scheduled", tone: "info" },
  expired: { label: "Expired", tone: "neutral" },
  exhausted: { label: "Fully redeemed", tone: "neutral" },
  disabled: { label: "Disabled", tone: "neutral" },
};

/**
 * Support ticket lifecycle.
 *
 * WAITING_ON_CUSTOMER is `neutral`, not `pending`: amber means the queue owes
 * someone an answer, and here it is the other way round. Colouring it like a
 * live queue item is exactly how a support lead ends up chasing tickets that
 * are not theirs to move.
 *
 * ESCALATED is `danger` rather than `info`. It is not a busier kind of
 * in-progress — it is an admission that the first line could not resolve it.
 */
export const TICKET_STATUS: Record<string, StatusMeta> = {
  OPEN: { label: "Open", tone: "pending" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  WAITING_ON_CUSTOMER: { label: "Waiting on customer", tone: "neutral" },
  ESCALATED: { label: "Escalated", tone: "danger" },
  RESOLVED: { label: "Resolved", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

/**
 * Priority is not a status, and it gets its own registry so it can never be
 * resolved by the bare `lookupStatus` search order — 'HIGH' and 'LOW' are far
 * too generic to guess at. NORMAL and LOW are deliberately quiet: if every row
 * is coloured, none of them are.
 */
export const TICKET_PRIORITY: Record<string, StatusMeta> = {
  URGENT: { label: "Urgent", tone: "danger" },
  HIGH: { label: "High", tone: "pending" },
  NORMAL: { label: "Normal", tone: "neutral" },
  LOW: { label: "Low", tone: "neutral" },
};

/**
 * Broadcast outcome.
 *
 * NO_RECIPIENTS is `pending`, not `success` or `neutral`: nothing was
 * delivered, and dressing that as a success is how the same message gets
 * fired four times.
 */
export const BROADCAST_STATUS: Record<string, StatusMeta> = {
  SENDING: { label: "Sending", tone: "info" },
  SENT: { label: "Sent", tone: "success" },
  NO_RECIPIENTS: { label: "Reached nobody", tone: "pending" },
  FAILED: { label: "Failed", tone: "danger" },
};

// ── Accounts ────────────────────────────────────────────────────────────────
// SUSPENDED is a decision Lalaba made about this account; INACTIVE is merely
// an absence. Different tones on purpose.
export const ACCOUNT_STATUS: Record<string, StatusMeta> = {
  ACTIVE: { label: "Active", tone: "success" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
};

export const COURIER_SELFIE_STATUS: Record<string, StatusMeta> = {
  ACTIVE: { label: "Active", tone: "success" },
  SUPERSEDED: { label: "Replaced", tone: "neutral" },
  REVOKED: { label: "Revoked", tone: "danger" },
};

/** Every registry, tried in order by `lookupStatus`. */
const REGISTRIES = [
  ORDER_STATUS,
  ATTEMPT_RESPONSIBILITY,
  VERIFICATION_STATUS,
  DOCUMENT_STATUS,
  CASE_STATE,
  WALLET_STATE,
  TICKET_STATUS,
  BROADCAST_STATUS,
  PAYMENT_STATUS,
  FEE_RULE_STATUS,
  PROMO_STATUS,
  ACCOUNT_STATUS,
  COURIER_SELFIE_STATUS,
];

/**
 * Lookups are case-insensitive, and that is not defensive programming — the
 * SAME order lifecycle arrives in two different cases depending on which
 * field you asked for:
 *
 *   OnlineOrder.status   is `OrderStatus!`, a GraphQL enum, so the wire value
 *                        is the enum KEY: "ABANDONED_UNSETTLED".
 *   OrderEvent.toStatus  is `String!`, the raw stored value, so it is
 *                        "abandoned_unsettled".
 *
 * The Orders page previously compared the first against lowercase literals,
 * which silently never matched — every order badge fell through to the same
 * neutral variant. Normalising here means no call site has to know or care.
 */
function normalize(status: string): string {
  return status.toLowerCase();
}

const NORMALIZED = new WeakMap<
  Record<string, StatusMeta>,
  Record<string, StatusMeta>
>();

function normalizedRegistry(
  registry: Record<string, StatusMeta>,
): Record<string, StatusMeta> {
  const cached = NORMALIZED.get(registry);
  if (cached) return cached;
  const built = Object.fromEntries(
    Object.entries(registry).map(([key, meta]) => [normalize(key), meta]),
  );
  NORMALIZED.set(registry, built);
  return built;
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Resolve a raw status string to its label and tone.
 *
 * Pass an explicit `registry` whenever the value could be ambiguous across
 * domains — "APPROVED" and "ACTIVE" appear in more than one enum, and while
 * they happen to agree today, relying on that is how a wrong colour ships.
 * Without one, registries are tried in the order above.
 */
export function lookupStatus(
  status: string,
  registry?: Record<string, StatusMeta>,
): StatusMeta {
  const key = normalize(status);
  if (registry) {
    return normalizedRegistry(registry)[key] ?? {
      label: titleCase(status),
      tone: "neutral",
    };
  }
  for (const candidate of REGISTRIES) {
    const hit = normalizedRegistry(candidate)[key];
    if (hit) return hit;
  }
  return { label: titleCase(status), tone: "neutral" };
}
