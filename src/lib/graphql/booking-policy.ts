import { graphqlFetch } from "@/lib/api-client";

/**
 * PLATFORM BOOKING POLICY — one record, evaluated against every provider.
 *
 * There is deliberately no provider selector anywhere in this file. Changing a
 * booking rule must never mean writing to provider documents: with a million
 * providers, a "2× capacity" promo done that way is a million writes and a
 * million-row rollback. Instead a provider's effective entitlement is COMPUTED:
 *
 *   policy defaults → milestone unlocked → live campaigns → safety ceiling
 *
 * CAPACITY IS HOME-WASHER ONLY. A laundromat has staff and several machines, so
 * a platform order cap does not describe it — but the TIMING rules (slot
 * interval, advance window, lead time, same-day cutoff, universal days) govern
 * both provider types, because they shape the customer's booking experience.
 */

export type ProviderType = "MERCHANT" | "WASHER";

export type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const WEEK_ORDER: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const DAY_LABELS: Record<DayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

/** Handover granularity, not service duration — the wash takes hours or days. */
export const SLOT_INTERVALS = [15, 30, 45, 60, 90, 120] as const;

export const LEAD_TIME_OPTIONS = [
  { value: 0, label: "No minimum" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 1440, label: "1 day" },
];

export const ADVANCE_DAY_OPTIONS = [7, 14, 30, 60, 90];

export type PolicyWindow = { start: string; end: string };

export type UniversalDay = { isOpen: boolean; windows: PolicyWindow[] };
export type UniversalWeek = Record<DayKey, UniversalDay>;

export type PolicyDefaults = {
  /** Home-washer only. */
  dailyCapacity: number;
  /** Both provider types. */
  advanceBookingDays: number;
  leadTimeMinutes: number;
  sameDayBookingEnabled: boolean;
  sameDayCutoffTime: string;
};

export type PolicySafetyLimits = {
  dailyCapacity: number;
  advanceBookingDays: number;
  /** Farthest a home washer may set her own service radius, in km. */
  maxServiceRadiusKm: number;
};

export type BookingPolicy = {
  _id: string;
  version: number;
  status: "LIVE" | "ARCHIVED";
  enabled: boolean;
  defaults: PolicyDefaults;
  universalDays: UniversalWeek;
  safetyLimits: PolicySafetyLimits;
  changeNote: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
};

export type MilestoneEligibility = {
  minCompletedOrders: number | null;
  minRating: number | null;
  maxCancellationRatePercent: number | null;
  requireVerified: boolean;
  requireGoodStanding: boolean;
};

export type MilestoneEntitlements = {
  dailyCapacity: number;
  advanceBookingDays: number;
  priorityBooking: boolean;
};

export type BookingMilestone = {
  _id: string;
  key: string;
  name: string;
  description: string | null;
  rank: number;
  isDefault: boolean;
  isActive: boolean;
  eligibility: MilestoneEligibility;
  entitlements: MilestoneEntitlements;
};

export type CampaignModifierMode = "REPLACE" | "MULTIPLY" | "INCREASE_BY";
export type CampaignScope = "EVERYONE" | "PROVIDER_TYPE" | "MILESTONE";

export type CampaignModifier = { mode: CampaignModifierMode; value: number };

export type CampaignTargeting = {
  scope: CampaignScope;
  providerType: ProviderType | null;
  milestoneKeys: string[];
};

export type BookingCampaign = {
  _id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  isEnabled: boolean;
  targeting: CampaignTargeting;
  dailyCapacity: CampaignModifier | null;
  advanceBookingDays: CampaignModifier | null;
};

export type EntitlementStep = {
  label: string;
  dailyCapacity: number | null;
  advanceBookingDays: number;
};

export type EffectiveEntitlement = {
  dailyCapacity: number | null;
  advanceBookingDays: number;
  leadTimeMinutes: number;
  sameDayBookingEnabled: boolean;
  sameDayCutoffTime: string;
  bookingsEnabled: boolean;
  milestoneKey: string | null;
  milestoneName: string | null;
  appliedCampaignIds: string[];
  appliedCampaignNames: string[];
  cappedBySafetyLimit: boolean;
  steps: EntitlementStep[];
};

export type PolicySimulation = {
  date: string;
  entitlement: EffectiveEntitlement;
};

export type CampaignImpact = {
  washers: number;
  merchants: number;
  total: number;
  /** True when milestone membership makes an exact count impossible cheaply. */
  isEstimate: boolean;
};

// ─── Fragments ──────────────────────────────────────────────────────────────

const WINDOW = `start end`;
const DAY = `isOpen windows { ${WINDOW} }`;

const POLICY_FIELDS = `
  _id
  version
  status
  enabled
  defaults {
    dailyCapacity
    advanceBookingDays
    leadTimeMinutes
    sameDayBookingEnabled
    sameDayCutoffTime
  }
  universalDays {
    monday { ${DAY} }
    tuesday { ${DAY} }
    wednesday { ${DAY} }
    thursday { ${DAY} }
    friday { ${DAY} }
    saturday { ${DAY} }
    sunday { ${DAY} }
  }
  safetyLimits { dailyCapacity advanceBookingDays maxServiceRadiusKm }
  changeNote
  publishedBy
  publishedAt
`;

const MILESTONE_FIELDS = `
  _id key name description rank isDefault isActive
  eligibility {
    minCompletedOrders
    minRating
    maxCancellationRatePercent
    requireVerified
    requireGoodStanding
  }
  entitlements {
    dailyCapacity
    advanceBookingDays
    priorityBooking
  }
`;

const MODIFIER = `mode value`;

const CAMPAIGN_FIELDS = `
  _id name description startDate endDate isEnabled
  targeting { scope providerType milestoneKeys }
  dailyCapacity { ${MODIFIER} }
  advanceBookingDays { ${MODIFIER} }
`;

const ENTITLEMENT_FIELDS = `
  dailyCapacity
  advanceBookingDays
  leadTimeMinutes
  sameDayBookingEnabled
  sameDayCutoffTime
  bookingsEnabled
  milestoneKey
  milestoneName
  appliedCampaignIds
  appliedCampaignNames
  cappedBySafetyLimit
  steps { label dailyCapacity advanceBookingDays }
`;

// ─── Queries ────────────────────────────────────────────────────────────────

export async function getBookingPolicy() {
  const { bookingPolicy } = await graphqlFetch<{ bookingPolicy: BookingPolicy }>(
    `query BookingPolicy { bookingPolicy { ${POLICY_FIELDS} } }`,
  );
  return bookingPolicy;
}

export async function listBookingMilestones() {
  const { bookingMilestones } = await graphqlFetch<{
    bookingMilestones: BookingMilestone[];
  }>(`query BookingMilestones { bookingMilestones { ${MILESTONE_FIELDS} } }`);
  return bookingMilestones;
}

export async function listBookingCampaigns() {
  const { bookingCampaigns } = await graphqlFetch<{
    bookingCampaigns: BookingCampaign[];
  }>(`query BookingCampaigns { bookingCampaigns { ${CAMPAIGN_FIELDS} } }`);
  return bookingCampaigns;
}

export async function getCampaignImpact(
  scope: CampaignScope,
  providerType?: ProviderType | null,
  milestoneKeys?: string[],
) {
  const { bookingCampaignImpact } = await graphqlFetch<{
    bookingCampaignImpact: CampaignImpact;
  }>(
    `query BookingCampaignImpact($scope: CampaignScope!, $providerType: ProviderType, $milestoneKeys: [String!]) {
       bookingCampaignImpact(scope: $scope, providerType: $providerType, milestoneKeys: $milestoneKeys) {
         washers merchants total isEstimate
       }
     }`,
    { scope, providerType, milestoneKeys },
  );
  return bookingCampaignImpact;
}

export async function simulatePolicy(input: {
  providerType: ProviderType;
  milestoneKey?: string | null;
  date?: string;
}) {
  const { simulateBookingPolicy } = await graphqlFetch<{
    simulateBookingPolicy: PolicySimulation;
  }>(
    `query SimulateBookingPolicy($input: SimulatePolicyInput!) {
       simulateBookingPolicy(input: $input) {
         date
         entitlement { ${ENTITLEMENT_FIELDS} }
       }
     }`,
    { input },
  );
  return simulateBookingPolicy;
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export type PublishBookingPolicyInput = {
  enabled?: boolean;
  defaults?: Partial<PolicyDefaults>;
  universalDays?: UniversalWeek;
  safetyLimits?: Partial<PolicySafetyLimits>;
  changeNote?: string;
};

/**
 * Every published version, newest first. Publishing is monotonic and never
 * rewrites a row, so this is the whole record of what the platform's booking
 * rules have been — and `changeNote` is the field that makes it readable,
 * which is why publishing now asks for one.
 */
export async function getBookingPolicyHistory(limit = 20) {
  const { bookingPolicyHistory } = await graphqlFetch<{
    bookingPolicyHistory: BookingPolicy[];
  }>(
    `query BookingPolicyHistory($limit: Int) {
       bookingPolicyHistory(limit: $limit) { ${POLICY_FIELDS} }
     }`,
    { limit },
  );
  return bookingPolicyHistory;
}

/** Publishing writes a NEW version and archives the old one. No provider writes. */
export async function publishBookingPolicy(
  input: PublishBookingPolicyInput,
) {
  const { publishBookingPolicy } = await graphqlFetch<{
    publishBookingPolicy: BookingPolicy;
  }>(
    `mutation PublishBookingPolicy($input: PublishBookingPolicyInput!) {
       publishBookingPolicy(input: $input) { ${POLICY_FIELDS} }
     }`,
    { input },
  );
  return publishBookingPolicy;
}

export type UpsertMilestoneInput = {
  key: string;
  name: string;
  description?: string | null;
  rank: number;
  isDefault: boolean;
  isActive: boolean;
  eligibility: MilestoneEligibility;
  entitlements: MilestoneEntitlements;
};

export async function upsertBookingMilestone(input: UpsertMilestoneInput) {
  const { upsertBookingMilestone } = await graphqlFetch<{
    upsertBookingMilestone: BookingMilestone;
  }>(
    `mutation UpsertBookingMilestone($input: UpsertBookingMilestoneInput!) {
       upsertBookingMilestone(input: $input) { ${MILESTONE_FIELDS} }
     }`,
    { input },
  );
  return upsertBookingMilestone;
}

export async function removeBookingMilestone(key: string) {
  const { removeBookingMilestone } = await graphqlFetch<{
    removeBookingMilestone: boolean;
  }>(
    `mutation RemoveBookingMilestone($key: String!) {
       removeBookingMilestone(key: $key)
     }`,
    { key },
  );
  return removeBookingMilestone;
}

export type UpsertCampaignInput = {
  id?: string;
  name: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  isEnabled: boolean;
  targeting: CampaignTargeting;
  dailyCapacity?: CampaignModifier | null;
  advanceBookingDays?: CampaignModifier | null;
};

export async function upsertBookingCampaign(input: UpsertCampaignInput) {
  const { upsertBookingCampaign } = await graphqlFetch<{
    upsertBookingCampaign: BookingCampaign;
  }>(
    `mutation UpsertBookingCampaign($input: UpsertBookingCampaignInput!) {
       upsertBookingCampaign(input: $input) { ${CAMPAIGN_FIELDS} }
     }`,
    { input },
  );
  return upsertBookingCampaign;
}

export async function removeBookingCampaign(id: string) {
  const { removeBookingCampaign } = await graphqlFetch<{
    removeBookingCampaign: boolean;
  }>(
    `mutation RemoveBookingCampaign($id: ID!) { removeBookingCampaign(id: $id) }`,
    { id },
  );
  return removeBookingCampaign;
}

// ─── Display helpers ────────────────────────────────────────────────────────

export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function describeUniversalDay(day: UniversalDay): string {
  if (!day.isOpen) return "Closed";
  if (day.windows.length === 0) return "No window set";
  return day.windows
    .map((w) => `${formatTime12(w.start)} – ${formatTime12(w.end)}`)
    .join(", ");
}

export function describeLeadTime(minutes: number): string {
  return (
    LEAD_TIME_OPTIONS.find((o) => o.value === minutes)?.label ??
    `${minutes} minutes`
  );
}

/** "×2", "+7", "= 40" — how a modifier reads in a campaign card. */
export function describeModifier(m: CampaignModifier | null): string {
  if (!m) return "No change";
  if (m.mode === "MULTIPLY") return `×${m.value}`;
  if (m.mode === "INCREASE_BY") return `+${m.value}`;
  return `= ${m.value}`;
}

/** Scheduled / Live / Ended, from the dates plus the enable switch. */
export function campaignStatus(c: BookingCampaign, today: string): string {
  if (!c.isEnabled) return "Disabled";
  if (today < c.startDate) return "Scheduled";
  if (today > c.endDate) return "Ended";
  return "Live";
}

/** Today in PH-local terms — the calendar the server works in. */
export function phToday(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
