import { graphqlFetch } from "@/lib/api-client";

// Hand-maintained mirrors — this project has no GraphQL codegen. Keep in sync
// with LALABA_BE_DEV/src/online-orders/schemas/order-status.enum.ts.

export type OnlinePaymentStatus = "UNPAID" | "BALANCE_DUE" | "PAID";
export type PaymentTiming = "ON_PICKUP" | "AT_FINAL_HANDOVER";

/**
 * Support's unpaid-money queue: orders still owing something, plus orders the
 * abandonment sweep has already given up on.
 *
 * Deferred settlement (§14) lets a customer take their laundry without paying
 * and settle when it comes back. When that never happens, the provider is left
 * holding finished laundry they were never paid for — and this is the only
 * screen where anyone can see that.
 */
export type UnsettledOrder = {
  _id: string;
  status: string;
  createdAt: string;
  abandonmentDeadlineAt: string | null;
  paymentTiming: PaymentTiming;
  paymentStatus: OnlinePaymentStatus;
  /** Server-derived: customerTotal − collected. Never recompute it here. */
  amountDueCentavos: number;
  customer: { displayName: string; maskedPhone: string | null };
  provider: { providerName: string; branchId: string };
  pricing: { customerTotalCentavos: number | null };
  paymentSummary: { amountCollectedCentavos: number | null };
};

export type UnsettledOrdersPage = {
  data: UnsettledOrder[];
  total: number;
  limit: number;
  offset: number;
};

const ORDER_FIELDS = `
  _id
  status
  createdAt
  abandonmentDeadlineAt
  paymentTiming
  paymentStatus
  amountDueCentavos
  customer { displayName maskedPhone }
  provider { providerName branchId }
  pricing { customerTotalCentavos }
  paymentSummary { amountCollectedCentavos }
`;

export async function fetchUnsettledOrders(
  limit = 50,
  offset = 0,
): Promise<UnsettledOrdersPage> {
  const data = await graphqlFetch<{ unsettledOrders: UnsettledOrdersPage }>(
    `query UnsettledOrders($limit: Int, $offset: Int) {
       unsettledOrders(limit: $limit, offset: $offset) {
         data { ${ORDER_FIELDS} }
         total
         limit
         offset
       }
     }`,
    { limit, offset },
  );
  return data.unsettledOrders;
}

/**
 * Puts an abandoned order back into its waiting state — the escape hatch for a
 * customer who turns up late with the money. Admin/support only: the point of
 * the abandoned state is that nobody else can quietly restart delivery on an
 * order that was never paid for.
 */
export async function reinstateAbandonedOrder(
  orderId: string,
  note?: string,
): Promise<UnsettledOrder> {
  const data = await graphqlFetch<{ reinstateAbandonedOrder: UnsettledOrder }>(
    `mutation ReinstateAbandonedOrder($orderId: ID!, $note: String) {
       reinstateAbandonedOrder(orderId: $orderId, note: $note) { ${ORDER_FIELDS} }
     }`,
    { orderId, note },
  );
  return data.reinstateAbandonedOrder;
}

/** Centavos → "₱1,234.50". Money is never formatted ad hoc. */
export function peso(centavos: number | null | undefined): string {
  const value = (centavos ?? 0) / 100;
  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
