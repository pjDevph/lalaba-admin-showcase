import { graphqlFetch } from "@/lib/api-client";

/**
 * PROMO / VOUCHER CODES.
 *
 * Scope boundary, stated the same way it is on the backend: this is the
 * admin-facing definition and validation/redemption surface. There is no live
 * "enter a code at checkout" flow anywhere in the customer app yet, so
 * `redeemPromoCode` here is a support/admin tool for recording a manual
 * redemption (a goodwill gesture, a correction) — every use of it requires a
 * reason on file for exactly that reason.
 *
 * Hand-maintained mirror of LALABA_BE_DEV/src/promotions/*.
 */

export type PromoDiscountType = "FLAT" | "PERCENTAGE" | "WAIVE";

/**
 * WHAT the discount comes off.
 *
 * ORDER_TOTAL is a customer discount; PLATFORM_FEE is a partner incentive that
 * reduces what Lalaba charges the provider and is invisible to the customer.
 * Absent on codes created before scopes existed — all of which were order
 * discounts, which is what `null` reads as.
 */
export type PromoScope = "ORDER_TOTAL" | "PLATFORM_FEE";

/** Computed by the backend, never stored. Mirrors platform-fees.ts's RuleStatus vocabulary. */
export type PromoStatus = "active" | "scheduled" | "expired" | "exhausted" | "disabled";

export const PROMO_STATUS_LABELS: Record<PromoStatus, string> = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  exhausted: "Fully redeemed",
  disabled: "Disabled",
};

/**
 * The same status the backend computes, re-derived for display and filtering.
 *
 * `promoCodes` returns raw documents — status is a computed value the backend
 * recalculates on every `find()` and does not expose as a field. Kept here
 * rather than in one page because two screens now ask the same question: the
 * promotions list, and the campaign form deciding which codes are worth
 * advertising.
 */
export function derivePromoStatus(promo: PromoCode): PromoStatus {
  if (!promo.isActive) return "disabled";
  const now = Date.now();
  if (new Date(promo.startsAt).getTime() > now) return "scheduled";
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < now) return "expired";
  if (promo.usageCapTotal && promo.redemptionCount >= promo.usageCapTotal) return "exhausted";
  return "active";
}

export type PromoCode = {
  _id: string;
  code: string;
  description: string;
  scope: PromoScope | null;
  discountType: PromoDiscountType;
  discountValue: number;
  maxDiscountCentavos: number | null;
  minOrderValueCentavos: number | null;
  targetRoleIds: string[];
  firstOrderOnly: boolean;
  usageCapTotal: number | null;
  usageCapPerCustomer: number;
  usageCapPerSubject: number | null;
  redemptionCount: number;
  startsAt: string;
  expiresAt: string | null;
  isActive: boolean;
  createdByUid: string;
  createdByName: string;
  createdAt: string | null;
};

/** Who a code can target. Back-office roles are refused by the backend. */
export const PROMO_AUDIENCES = [
  { id: "customer", label: "Customers" },
  { id: "washer", label: "Home washers" },
  { id: "merchant", label: "Merchants" },
  { id: "staff", label: "Merchant staff" },
  { id: "courier", label: "Couriers" },
] as const;

const PROMO_FIELDS = `
  _id
  code
  description
  scope
  discountType
  discountValue
  maxDiscountCentavos
  minOrderValueCentavos
  targetRoleIds
  firstOrderOnly
  usageCapTotal
  usageCapPerCustomer
  usageCapPerSubject
  redemptionCount
  startsAt
  expiresAt
  isActive
  createdByUid
  createdByName
  createdAt
`;

export type PromoFilter = {
  search?: string;
  status?: PromoStatus;
  limit: number;
  offset: number;
};

const LIST_QUERY = `
  query PromoCodes($filter: PromoFilterInput) {
    promoCodes(filter: $filter) {
      data { ${PROMO_FIELDS} }
      total
    }
  }
`;

export async function listPromoCodes(filter: PromoFilter) {
  const { promoCodes } = await graphqlFetch<{
    promoCodes: { data: PromoCode[]; total: number };
  }>(LIST_QUERY, { filter });
  return promoCodes;
}

export type CreatePromoInput = {
  code: string;
  description: string;
  scope?: PromoScope;
  discountType: PromoDiscountType;
  discountValue: number;
  maxDiscountCentavos?: number;
  minOrderValueCentavos?: number;
  targetRoleIds: string[];
  firstOrderOnly?: boolean;
  usageCapTotal?: number;
  usageCapPerCustomer?: number;
  /** Supersedes usageCapPerCustomer — on a platform-fee incentive the subject
   *  is a BRANCH, so "five uses" means five per shop. */
  usageCapPerSubject?: number;
  startsAt: string;
  expiresAt?: string;
};

const CREATE_MUTATION = `
  mutation CreatePromoCode($input: CreatePromoInput!) {
    createPromoCode(input: $input) { ${PROMO_FIELDS} }
  }
`;

export async function createPromoCode(input: CreatePromoInput) {
  const { createPromoCode } = await graphqlFetch<{ createPromoCode: PromoCode }>(
    CREATE_MUTATION,
    { input },
  );
  return createPromoCode;
}

export type UpdatePromoInput = {
  description?: string;
  startsAt?: string;
  expiresAt?: string;
  usageCapTotal?: number;
};

const UPDATE_MUTATION = `
  mutation UpdatePromoCode($id: ID!, $input: UpdatePromoInput!) {
    updatePromoCode(id: $id, input: $input) { ${PROMO_FIELDS} }
  }
`;

export async function updatePromoCode(id: string, input: UpdatePromoInput) {
  const { updatePromoCode } = await graphqlFetch<{ updatePromoCode: PromoCode }>(
    UPDATE_MUTATION,
    { id, input },
  );
  return updatePromoCode;
}

const SET_ACTIVE_MUTATION = `
  mutation SetPromoCodeActive($id: ID!, $isActive: Boolean!) {
    setPromoCodeActive(id: $id, isActive: $isActive) { _id isActive }
  }
`;

export function setPromoCodeActive(id: string, isActive: boolean) {
  return graphqlFetch(SET_ACTIVE_MUTATION, { id, isActive });
}

export type PromoRedemption = {
  _id: string;
  promoId: string;
  code: string;
  customerUid: string;
  customerName: string;
  orderId: string | null;
  discountAppliedCentavos: number;
  createdAt: string | null;
};

export type PromoRedeemer = {
  customerUid: string;
  customerName: string;
  redemptionCount: number;
};

export type PromoUsageSummary = {
  totalRedemptions: number;
  uniqueCustomers: number;
  totalDiscountCentavos: number;
  byDay: { date: string; count: number }[];
  /** Should always be empty — see the field's own doc comment on the backend. */
  overCapCustomers: PromoRedeemer[];
  recentRedemptions: PromoRedemption[];
};

const SUMMARY_QUERY = `
  query PromoUsageSummary($id: ID!) {
    promoUsageSummary(id: $id) {
      totalRedemptions
      uniqueCustomers
      totalDiscountCentavos
      byDay { date count }
      overCapCustomers { customerUid customerName redemptionCount }
      recentRedemptions {
        _id
        customerUid
        customerName
        orderId
        discountAppliedCentavos
        createdAt
      }
    }
  }
`;

export async function fetchPromoUsageSummary(id: string) {
  const { promoUsageSummary } = await graphqlFetch<{
    promoUsageSummary: PromoUsageSummary;
  }>(SUMMARY_QUERY, { id });
  return promoUsageSummary;
}

const REDEEM_MUTATION = `
  mutation RedeemPromoCode($input: RedeemPromoInput!, $reason: String!) {
    redeemPromoCode(input: $input, reason: $reason) {
      _id
      discountAppliedCentavos
    }
  }
`;

export type RedeemPromoInput = {
  code: string;
  customerUid: string;
  orderTotalCentavos: number;
  orderId?: string;
};

/** Manual redemption only — see the module doc comment on why. */
export function redeemPromoCode(input: RedeemPromoInput, reason: string) {
  return graphqlFetch(REDEEM_MUTATION, { input, reason });
}

export type PromoValidation = {
  valid: boolean;
  reason: string | null;
  discountCentavos: number;
};

const VALIDATE_QUERY = `
  query ValidatePromoCode($code: String!, $customerUid: ID!, $orderTotalCentavos: Float!) {
    validatePromoCode(
      code: $code
      customerUid: $customerUid
      orderTotalCentavos: $orderTotalCentavos
    ) {
      valid
      reason
      discountCentavos
    }
  }
`;

export async function validatePromoCode(
  code: string,
  customerUid: string,
  orderTotalCentavos: number,
) {
  const { validatePromoCode } = await graphqlFetch<{
    validatePromoCode: PromoValidation;
  }>(VALIDATE_QUERY, { code, customerUid, orderTotalCentavos });
  return validatePromoCode;
}
