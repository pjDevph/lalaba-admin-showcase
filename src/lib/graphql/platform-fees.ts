import { graphqlFetch } from "@/lib/api-client";

// Platform fee rules — what Lalaba charges, who pays it, how it is calculated
// and when it applies (LALABA_BE_DEV/src/platform-fee).
//
// The collection is APPEND-ONLY: "editing" a rule publishes a new version and
// leaves the previous one readable forever, because orders snapshot the rule
// that priced them. Nothing here does a partial update — every save sends the
// complete rule, and the backend stamps the next version number.

export type FeePayerRole =
  | "CUSTOMER"
  | "HOME_WASHER"
  | "LAUNDROMAT"
  | "COURIER";

export type FeeCategory =
  | "COMMISSION"
  | "BOOKING_FEE"
  | "SURCHARGE"
  | "ACTIVATION_MINIMUM"
  | "ACCEPT_MINIMUM"
  | "OTHER";

export type FeeCalculationType =
  | "FIXED"
  | "PERCENTAGE"
  | "FIXED_PLUS_PERCENTAGE";

export type FeeBasis =
  | "SERVICE_SUBTOTAL"
  | "ORDER_SUBTOTAL"
  | "PER_ORDER"
  | "PER_BOOKING"
  | "PER_TRANSACTION"
  | "PER_DELIVERY"
  | "PER_PROVIDER"
  | "ONE_TIME_ACTIVATION";

export type FeeChargedTo = "CUSTOMER" | "PROVIDER" | "SPLIT";

export type FeeDeductionSource =
  | "ORDER_SETTLEMENT"
  | "MAIN_WALLET"
  | "SEPARATE_INVOICE"
  | "NOT_DEDUCTED";

export type FeeTaxTreatment = "TAX_INCLUSIVE" | "TAX_EXCLUSIVE";

export type PlatformFeeRule = {
  _id: string;
  /** Stable across versions — the id every mutation and history lookup uses. */
  ruleKey: string;
  version: number;
  name: string;
  description: string | null;
  appliesTo: FeePayerRole;
  category: FeeCategory;
  calculationType: FeeCalculationType;
  percent: number | null;
  fixedAmountCentavos: number | null;
  basis: FeeBasis;
  minFeeCentavos: number | null;
  maxFeeCentavos: number | null;
  chargedTo: FeeChargedTo;
  customerSharePercent: number | null;
  providerSharePercent: number | null;
  deductFrom: FeeDeductionSource;
  taxTreatment: FeeTaxTreatment;
  applyVat: boolean;
  vatRatePercent: number | null;
  stackable: boolean;
  isActive: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
  supersededByVersion: number | null;
  setByUid: string;
  setByName: string | null;
  changeReason: string | null;
  createdAt: string | null;
};

/** Exactly the fields the save mutation takes — no _id, version or provenance. */
export type PlatformFeeRuleInput = {
  name: string;
  description?: string | null;
  appliesTo: FeePayerRole;
  category: FeeCategory;
  calculationType: FeeCalculationType;
  percent?: number | null;
  fixedAmountCentavos?: number | null;
  basis: FeeBasis;
  minFeeCentavos?: number | null;
  maxFeeCentavos?: number | null;
  chargedTo: FeeChargedTo;
  customerSharePercent?: number | null;
  providerSharePercent?: number | null;
  deductFrom: FeeDeductionSource;
  taxTreatment: FeeTaxTreatment;
  applyVat: boolean;
  vatRatePercent?: number | null;
  stackable: boolean;
  isActive: boolean;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  changeReason?: string | null;
};

export type FeeRulePreview = {
  baseCentavos: number;
  feeCentavos: number;
  uncappedFeeCentavos: number;
  minimumApplied: boolean;
  maximumApplied: boolean;
  vatCentavos: number;
  customerShareCentavos: number;
  providerShareCentavos: number;
  customerTotalCentavos: number;
  providerEarningsCentavos: number;
};

// ─── Labels ─────────────────────────────────────────────────────────────────
// The API's vocabulary is not the admin's. "LAUNDROMAT" and "Merchant branch"
// are the same thing to the backend; only one of them is what the page should
// say, and it should say it in exactly one place.

export const PAYER_LABELS: Record<FeePayerRole, string> = {
  CUSTOMER: "Customer",
  HOME_WASHER: "Home Washer",
  LAUNDROMAT: "Laundromat",
  COURIER: "Courier",
};

export const CATEGORY_LABELS: Record<FeeCategory, string> = {
  COMMISSION: "Commission",
  BOOKING_FEE: "Booking fee",
  SURCHARGE: "Surcharge",
  ACTIVATION_MINIMUM: "Activation minimum",
  ACCEPT_MINIMUM: "Accept-booking minimum",
  OTHER: "Other",
};

export const CALCULATION_LABELS: Record<FeeCalculationType, string> = {
  FIXED: "Fixed amount",
  PERCENTAGE: "Percentage",
  FIXED_PLUS_PERCENTAGE: "Fixed + percentage",
};

export const BASIS_LABELS: Record<FeeBasis, string> = {
  SERVICE_SUBTOTAL: "Service subtotal",
  ORDER_SUBTOTAL: "Order subtotal",
  PER_ORDER: "Per order",
  PER_BOOKING: "Per booking",
  PER_TRANSACTION: "Per transaction",
  PER_DELIVERY: "Per delivery",
  PER_PROVIDER: "Per provider",
  ONE_TIME_ACTIVATION: "One-time activation",
};

export const CHARGED_TO_LABELS: Record<FeeChargedTo, string> = {
  CUSTOMER: "Customer",
  PROVIDER: "Provider",
  SPLIT: "Split between customer and provider",
};

export const DEDUCTION_LABELS: Record<FeeDeductionSource, string> = {
  ORDER_SETTLEMENT: "Order settlement",
  MAIN_WALLET: "Wallet",
  SEPARATE_INVOICE: "Separate invoice",
  NOT_DEDUCTED: "Not deducted",
};

export const TAX_TREATMENT_LABELS: Record<FeeTaxTreatment, string> = {
  TAX_INCLUSIVE: "Tax inclusive",
  TAX_EXCLUSIVE: "Tax exclusive",
};

/**
 * The two categories that are NOT charges — they are wallet balances a
 * provider must hold, and the money stays theirs. The page has to say so
 * wherever it shows them, or "Activation minimum ₱1,000" reads as a ₱1,000
 * bill.
 */
export const NON_CHARGE_CATEGORIES: FeeCategory[] = [
  "ACTIVATION_MINIMUM",
  "ACCEPT_MINIMUM",
];

export function isNonCharge(category: FeeCategory): boolean {
  return NON_CHARGE_CATEGORIES.includes(category);
}

/**
 * How the non-charge categories are phrased in the Provider requirements
 * section. "Activation minimum" is the schema's word for it; "To go live" is
 * what the requirement actually gates, which is what an admin is looking for.
 */
export const REQUIREMENT_LABELS: Partial<Record<FeeCategory, string>> = {
  ACTIVATION_MINIMUM: "To go live",
  ACCEPT_MINIMUM: "To keep accepting bookings",
};

// ─── Operations ─────────────────────────────────────────────────────────────

const RULE_FIELDS = `
  _id ruleKey version name description
  appliesTo category
  calculationType percent fixedAmountCentavos basis
  minFeeCentavos maxFeeCentavos
  chargedTo customerSharePercent providerSharePercent deductFrom
  taxTreatment applyVat vatRatePercent
  stackable isActive
  effectiveFrom effectiveUntil supersededByVersion
  setByUid setByName changeReason createdAt
`;

const LIST_QUERY = `
  query PlatformFeeRules {
    platformFeeRules { ${RULE_FIELDS} }
  }
`;

export async function listPlatformFeeRules() {
  const { platformFeeRules } = await graphqlFetch<{
    platformFeeRules: PlatformFeeRule[];
  }>(LIST_QUERY);
  return platformFeeRules;
}

const HISTORY_QUERY = `
  query PlatformFeeRuleHistory($ruleKey: String!) {
    platformFeeRuleHistory(ruleKey: $ruleKey) { ${RULE_FIELDS} }
  }
`;

export async function platformFeeRuleHistory(ruleKey: string) {
  const { platformFeeRuleHistory } = await graphqlFetch<{
    platformFeeRuleHistory: PlatformFeeRule[];
  }>(HISTORY_QUERY, { ruleKey });
  return platformFeeRuleHistory;
}

const PREVIEW_QUERY = `
  query PreviewPlatformFeeRule($input: SavePlatformFeeRuleInput!, $baseCentavos: Int) {
    previewPlatformFeeRule(input: $input, baseCentavos: $baseCentavos) {
      baseCentavos feeCentavos uncappedFeeCentavos
      minimumApplied maximumApplied vatCentavos
      customerShareCentavos providerShareCentavos
      customerTotalCentavos providerEarningsCentavos
    }
  }
`;

/**
 * Computed by the backend from the unsaved draft, deliberately — a preview the
 * page calculated itself would agree with what actually gets charged only
 * until one of the two changed.
 */
export async function previewPlatformFeeRule(
  input: PlatformFeeRuleInput,
  baseCentavos: number,
) {
  const { previewPlatformFeeRule } = await graphqlFetch<{
    previewPlatformFeeRule: FeeRulePreview;
  }>(PREVIEW_QUERY, { input, baseCentavos });
  return previewPlatformFeeRule;
}

const CREATE_MUTATION = `
  mutation CreatePlatformFeeRule($input: SavePlatformFeeRuleInput!) {
    createPlatformFeeRule(input: $input) { ${RULE_FIELDS} }
  }
`;

export async function createPlatformFeeRule(input: PlatformFeeRuleInput) {
  const { createPlatformFeeRule } = await graphqlFetch<{
    createPlatformFeeRule: PlatformFeeRule;
  }>(CREATE_MUTATION, { input });
  return createPlatformFeeRule;
}

const UPDATE_MUTATION = `
  mutation UpdatePlatformFeeRule($ruleKey: String!, $input: SavePlatformFeeRuleInput!) {
    updatePlatformFeeRule(ruleKey: $ruleKey, input: $input) { ${RULE_FIELDS} }
  }
`;

/** Publishes a new version. The previous one stays readable in the history. */
export async function updatePlatformFeeRule(
  ruleKey: string,
  input: PlatformFeeRuleInput,
) {
  const { updatePlatformFeeRule } = await graphqlFetch<{
    updatePlatformFeeRule: PlatformFeeRule;
  }>(UPDATE_MUTATION, { ruleKey, input });
  return updatePlatformFeeRule;
}

const SET_ACTIVE_MUTATION = `
  mutation SetPlatformFeeRuleActive($ruleKey: String!, $isActive: Boolean!, $changeReason: String) {
    setPlatformFeeRuleActive(ruleKey: $ruleKey, isActive: $isActive, changeReason: $changeReason) {
      ${RULE_FIELDS}
    }
  }
`;

export async function setPlatformFeeRuleActive(
  ruleKey: string,
  isActive: boolean,
  changeReason?: string,
) {
  const { setPlatformFeeRuleActive } = await graphqlFetch<{
    setPlatformFeeRuleActive: PlatformFeeRule;
  }>(SET_ACTIVE_MUTATION, { ruleKey, isActive, changeReason });
  return setPlatformFeeRuleActive;
}

const SEED_MUTATION = `
  mutation SeedPlatformFeeRules {
    seedPlatformFeeRules
  }
`;

/**
 * Creates the starting rule set on an environment that has none, carrying the
 * old global commission across unchanged. Idempotent, so the empty state can
 * offer it as a button.
 */
export async function seedPlatformFeeRules() {
  const { seedPlatformFeeRules } = await graphqlFetch<{
    seedPlatformFeeRules: string[];
  }>(SEED_MUTATION);
  return seedPlatformFeeRules;
}

// ─── Formatting ─────────────────────────────────────────────────────────────

export type PlatformStatsToday = {
  revenueCentavos: number;
  completedOrders: number;
};

const STATS_TODAY_QUERY = `
  query PlatformStatsToday {
    platformStatsToday { revenueCentavos completedOrders }
  }
`;

/** Commission collected from orders completed today (PH time), platform-wide. */
export async function getPlatformStatsToday(): Promise<PlatformStatsToday> {
  const { platformStatsToday } = await graphqlFetch<{
    platformStatsToday: PlatformStatsToday;
  }>(STATS_TODAY_QUERY);
  return platformStatsToday;
}

export function formatPeso(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function centavosToPesoInput(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

/** NaN for anything that isn't a usable peso amount — callers validate. */
export function pesoInputToCentavos(peso: string): number {
  const parsed = Number.parseFloat(peso);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.round(parsed * 100);
}

/**
 * The one-line "Calculation" cell: "10%", "₱15.00", "₱15.00 + 2%", with the
 * basis appended only when it adds information a percentage doesn't already
 * carry.
 */
export function describeCalculation(rule: PlatformFeeRule): string {
  const parts: string[] = [];
  if (rule.calculationType !== "PERCENTAGE" && rule.fixedAmountCentavos != null) {
    parts.push(formatPeso(rule.fixedAmountCentavos));
  }
  if (rule.calculationType !== "FIXED" && rule.percent != null) {
    parts.push(`${rule.percent}%`);
  }
  const amount = parts.join(" + ") || "—";

  switch (rule.basis) {
    case "PER_ORDER":
      return `${amount}/order`;
    case "PER_BOOKING":
      return `${amount}/booking`;
    case "PER_DELIVERY":
      return `${amount}/delivery`;
    case "PER_TRANSACTION":
      return `${amount}/transaction`;
    default:
      return amount;
  }
}

/**
 * Where a rule sits in time RIGHT NOW. Scheduled and expired are distinct from
 * inactive: an admin looking at "8%" needs to know whether it is the rate being
 * charged today or one that starts next month, and a table that shows both as
 * "Active" hides exactly the thing they came to check.
 */
export type RuleStatus = "active" | "scheduled" | "expired" | "inactive";

export function ruleStatus(rule: PlatformFeeRule, now = new Date()): RuleStatus {
  if (!rule.isActive) return "inactive";
  if (new Date(rule.effectiveFrom) > now) return "scheduled";
  if (rule.effectiveUntil && new Date(rule.effectiveUntil) <= now)
    return "expired";
  return "active";
}

export const RULE_STATUS_LABELS: Record<RuleStatus, string> = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  inactive: "Inactive",
};
