import { graphqlFetch } from "@/lib/api-client";

/**
 * PER-PROVIDER AVAILABILITY — one branch's own booking config, and the
 * calendar dates that do not follow it.
 *
 * Distinct from lib/graphql/booking-policy.ts, which is ONE record evaluated
 * against every provider and deliberately has no provider selector. This file
 * is the opposite end: everything here is addressed by branchId.
 *
 * The weekly schedule itself belongs to the provider and is edited in the
 * partner app — the config's own schema comment says so. What the back office
 * needs, and had no way to do at all, is the one-off: close a provider for a
 * public holiday, blank out a week she is away, or pause her while something
 * is being sorted out. Those are `bookingSpecialDates`, `createBookingBlackout`
 * and `upsertBookingDateOverride`, which existed on the backend with no UI.
 */

export type ProviderType = "MERCHANT" | "WASHER";

export type BookingWindow = { start: string; end: string };

/**
 * One upcoming date that departs from the weekly rules. The backend merges
 * overrides and blackouts into this single shape — `source` says which
 * collection the row came from, and therefore which mutation removes it.
 */
export type UpcomingSpecialDate = {
  date: string;
  label: string | null;
  isClosed: boolean;
  /** 'Closed' | 'Special schedule' | 'Reduced capacity' */
  kind: string;
  detail: string;
  /** 'override' | 'blackout' — which record to edit. */
  source: string;
  recordId: string | null;
};

export type BookingAvailabilityConfig = {
  _id: string;
  branchId: string;
  providerType: ProviderType;
  acceptScheduledBookings: boolean;
  bookingsPaused: boolean;
  pauseReason: string | null;
  pausedAt: string | null;
  weekly: Record<
    string,
    {
      isAcceptingBookings: boolean;
      windows: BookingWindow[];
      dailyBookingLimit: number | null;
    }
  >;
};

export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const DAY_FIELDS = WEEKDAYS.map(
  (day) =>
    `${day} { isAcceptingBookings windows { start end } dailyBookingLimit }`,
).join("\n      ");

const CONFIG_QUERY = `
  query BookingAvailability($branchId: ID!) {
    bookingAvailability(branchId: $branchId) {
      _id
      branchId
      providerType
      acceptScheduledBookings
      bookingsPaused
      pauseReason
      pausedAt
      weekly {
        ${DAY_FIELDS}
      }
    }
  }
`;

export async function getBookingAvailability(branchId: string) {
  const { bookingAvailability } = await graphqlFetch<{
    bookingAvailability: BookingAvailabilityConfig;
  }>(CONFIG_QUERY, { branchId });
  return bookingAvailability;
}

const SPECIAL_DATES_QUERY = `
  query BookingSpecialDates($branchId: ID!) {
    bookingSpecialDates(branchId: $branchId) {
      date
      label
      isClosed
      kind
      detail
      source
      recordId
    }
  }
`;

export async function getBookingSpecialDates(branchId: string) {
  const { bookingSpecialDates } = await graphqlFetch<{
    bookingSpecialDates: UpcomingSpecialDate[];
  }>(SPECIAL_DATES_QUERY, { branchId });
  return bookingSpecialDates;
}

/**
 * A blackout closes a DATE RANGE outright. Use it for "she is away all of
 * Holy Week" — a single closed day is an override with isClosed, which is
 * cheaper to undo and can carry a label the customer sees.
 */
export async function createBookingBlackout(
  branchId: string,
  input: { startDate: string; endDate: string; reason?: string | null },
) {
  const { createBookingBlackout } = await graphqlFetch<{
    createBookingBlackout: { _id: string; startDate: string; endDate: string };
  }>(
    `mutation CreateBookingBlackout($branchId: ID!, $input: CreateBookingBlackoutInput!) {
       createBookingBlackout(branchId: $branchId, input: $input) {
         _id
         startDate
         endDate
       }
     }`,
    { branchId, input },
  );
  return createBookingBlackout;
}

export async function removeBookingBlackout(branchId: string, id: string) {
  const { removeBookingBlackout } = await graphqlFetch<{
    removeBookingBlackout: boolean;
  }>(
    `mutation RemoveBookingBlackout($branchId: ID!, $id: ID!) {
       removeBookingBlackout(branchId: $branchId, id: $id)
     }`,
    { branchId, id },
  );
  return removeBookingBlackout;
}

/**
 * One calendar date that does not follow the weekly rules: closed, or open on
 * different hours, or open with a different daily limit.
 *
 * Upsert by date — re-saving the same date replaces it, so an admin correcting
 * a holiday's hours does not end up with two records fighting over one day.
 */
export async function upsertBookingDateOverride(
  branchId: string,
  input: {
    date: string;
    label?: string | null;
    isClosed: boolean;
    windows?: BookingWindow[];
    dailyBookingLimit?: number | null;
  },
) {
  const { upsertBookingDateOverride } = await graphqlFetch<{
    upsertBookingDateOverride: { _id: string; date: string };
  }>(
    `mutation UpsertBookingDateOverride($branchId: ID!, $input: UpsertBookingDateOverrideInput!) {
       upsertBookingDateOverride(branchId: $branchId, input: $input) {
         _id
         date
       }
     }`,
    { branchId, input },
  );
  return upsertBookingDateOverride;
}

export async function removeBookingDateOverride(
  branchId: string,
  date: string,
) {
  const { removeBookingDateOverride } = await graphqlFetch<{
    removeBookingDateOverride: boolean;
  }>(
    `mutation RemoveBookingDateOverride($branchId: ID!, $date: String!) {
       removeBookingDateOverride(branchId: $branchId, date: $date)
     }`,
    { branchId, date },
  );
  return removeBookingDateOverride;
}

/**
 * The back office's half of the provider's config: whether she is taking
 * scheduled bookings at all, and the pause switch with its reason.
 *
 * The weekly schedule is intentionally NOT sent from here — that is the
 * provider's own, edited in the partner app. This mutation accepts partial
 * input, so omitting `weekly` leaves it untouched.
 */
export async function setProviderBookingPause(
  branchId: string,
  input: {
    acceptScheduledBookings?: boolean;
    bookingsPaused?: boolean;
    pauseReason?: string | null;
  },
) {
  const { updateBookingAvailability } = await graphqlFetch<{
    updateBookingAvailability: BookingAvailabilityConfig;
  }>(
    `mutation UpdateBookingAvailability($branchId: ID!, $input: UpdateBookingAvailabilityInput!) {
       updateBookingAvailability(branchId: $branchId, input: $input) {
         _id
         acceptScheduledBookings
         bookingsPaused
         pauseReason
         pausedAt
       }
     }`,
    { branchId, input },
  );
  return updateBookingAvailability;
}
