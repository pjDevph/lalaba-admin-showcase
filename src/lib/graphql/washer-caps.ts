import { graphqlFetch } from "@/lib/api-client";

/**
 * PER-WASHER DAILY ORDER CAP — the one booking number that is set per provider.
 *
 * Everything else about what a provider is ALLOWED to do is computed from the
 * platform policy (see lib/graphql/booking-policy.ts, which deliberately has no
 * provider selector: a rule change must never mean a write per provider). This
 * is the deliberate exception — an override for one washer — so it lives in its
 * own file and its own page rather than muddying that doctrine.
 *
 * `maxOrdersPerDay: null` means NO CAP, and nothing stands in behind it. The
 * backend used to substitute a hardcoded 20 for an unset cap while the washer
 * app displayed 3 and the booking engine enforced the policy number, so all
 * three disagreed about the same washer.
 */

export type WasherAccountStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface WasherCapRow {
  /** Washers are addressed by their anchor branchId, as every booking config is. */
  branchId: string;
  providerType: "MERCHANT" | "WASHER";
  name: string;
  /** 'Accepting bookings' | 'Bookings paused' | 'Not accepting bookings' */
  stateLabel: string;
  /** Null = no cap. Always null for a laundromat. */
  maxOrdersPerDay: number | null;
  /** WASHER rows only — always null for a laundromat. */
  washerStatus: WasherAccountStatus | null;
}

const PROVIDERS_QUERY = `
  query BookingProviders {
    bookingProviders {
      branchId
      providerType
      name
      stateLabel
      maxOrdersPerDay
      washerStatus
    }
  }
`;

const SET_CAP_MUTATION = `
  mutation SetWasherDailyOrderCap($branchId: String!, $maxOrdersPerDay: Int) {
    setWasherDailyOrderCap(branchId: $branchId, maxOrdersPerDay: $maxOrdersPerDay) {
      branchId
      maxOrdersPerDay
    }
  }
`;

const SUSPEND_WASHER_MUTATION = `
  mutation SuspendWasher($branchId: String!, $reason: String!, $note: String) {
    suspendWasher(branchId: $branchId, reason: $reason, note: $note) {
      branchId
      status
    }
  }
`;

const REACTIVATE_WASHER_MUTATION = `
  mutation ReactivateWasher($branchId: String!, $note: String) {
    reactivateWasher(branchId: $branchId, note: $note) {
      branchId
      status
    }
  }
`;

/** Home washers only — a laundromat's throughput is its own business. */
export async function listWasherCaps(): Promise<WasherCapRow[]> {
  const { bookingProviders } = await graphqlFetch<{
    bookingProviders: WasherCapRow[];
  }>(PROVIDERS_QUERY);
  return bookingProviders.filter((p) => p.providerType === "WASHER");
}

/** Pass null to clear the cap. The backend rejects 0 — see below. */
export async function setWasherDailyOrderCap(
  branchId: string,
  maxOrdersPerDay: number | null,
) {
  const { setWasherDailyOrderCap } = await graphqlFetch<{
    setWasherDailyOrderCap: { branchId: string; maxOrdersPerDay: number | null };
  }>(SET_CAP_MUTATION, { branchId, maxOrdersPerDay });
  return setWasherDailyOrderCap;
}

/**
 * Suspending blocks the washer from logging in at all (enforced by the
 * backend auth guard), on top of already being excluded from discovery and
 * bookings by her WasherStatus. This is the actual account kill switch —
 * `isAvailable` and the daily cap are things the washer or a number still
 * let her work around.
 */
export async function suspendWasher(
  branchId: string,
  /** A code from PROVIDER_SUSPENSION_REASONS. Required by the backend, which
   * writes it to the platform audit trail — never pass prose here. */
  reason: string,
  note?: string | null,
) {
  const { suspendWasher } = await graphqlFetch<{
    suspendWasher: { branchId: string; status: WasherAccountStatus };
  }>(SUSPEND_WASHER_MUTATION, { branchId, reason, note: note ?? null });
  return suspendWasher;
}

export async function reactivateWasher(branchId: string, note?: string | null) {
  const { reactivateWasher } = await graphqlFetch<{
    reactivateWasher: { branchId: string; status: WasherAccountStatus };
  }>(REACTIVATE_WASHER_MUTATION, { branchId, note: note ?? null });
  return reactivateWasher;
}

/**
 * NaN for anything that isn't a usable cap, null for "no cap" (a blank field).
 * 0 is deliberately invalid rather than meaning "accept nothing": that is what
 * her availability toggle and account status are for, and a second way to say it
 * would let a washer be frozen by a number no screen explains.
 */
export function parseCapInput(raw: string): number | null | typeof NaN {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return NaN;
  const n = Number(trimmed);
  return n >= 1 ? n : NaN;
}

export function describeCap(maxOrdersPerDay: number | null): string {
  if (maxOrdersPerDay == null) return "No cap";
  return `${maxOrdersPerDay} ${maxOrdersPerDay === 1 ? "order" : "orders"}/day`;
}
