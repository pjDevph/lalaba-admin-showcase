import { graphqlFetch } from "@/lib/api-client";

// Hand-maintained mirrors — this project has no GraphQL codegen. Keep in sync
// with LALABA_BE_DEV/src/online-orders/schemas/online-order.schema.ts and
// order-event.schema.ts.
//
// Read-only order lookup for support/admin. `onlineOrder(id)` and
// `onlineOrderTimeline(orderId)` are already reachable by admin/support today
// (service-level check in OnlineOrdersService.order(), not an explicit
// @Roles gate) — this module is the first thing in this app that calls them.
//
// `orderNumber` ("LB-000123") is generated at booking, same counter shape as
// support tickets' ticketNumber. Nullable: orders placed before this shipped
// have none, and `adminOrders`'s search box still resolves those by id, party
// uid, phone number, or name — orderNumber is one more way in, not the only
// one.

export type OnlinePaymentStatus = "UNPAID" | "BALANCE_DUE" | "PAID";
export type PaymentTiming = "ON_PICKUP" | "AT_FINAL_HANDOVER";
export type PaymentMethod = "CASH" | "EWALLET_OUTSIDE_APP";
export type ProviderType = "MERCHANT" | "WASHER";
export type QualityHoldResponse = "PENDING" | "APPROVED" | "DECLINED";

export type LegAssignment = {
  assignedStaffUid: string | null;
  assignedAt: string | null;
  enRouteAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationAt: string | null;
  locationAccuracy: number | null;
  locationSpeed: number | null;
  locationHeading: number | null;
};

export type AttemptEvidence = {
  attemptNumber: number;
  actorUid: string;
  timestamp: string;
  gpsLat: number | null;
  gpsLng: number | null;
  photoUrls: string[] | null;
  responsibility: string;
  reason: string | null;
};

export type HandoverProof = {
  capturedAt: string;
  capturedByUid: string;
};

export type QualityHold = {
  serviceLineIndex: number;
  category: string | null;
  reason: string;
  photoUrls: string[] | null;
  blocksOrder: boolean;
  additionalChargeCentavos: number | null;
  customerResponse: QualityHoldResponse;
  raisedAt: string;
  respondTimeoutAt: string | null;
  resolvedAt: string | null;
};

export type ServiceLineSnapshot = {
  serviceRefId: string;
  serviceName: string;
  pricingType: string;
  price: number;
  productSurchargeCentavos: number;
  estimatedLineTotalCentavos: number;
  actualLineTotalCentavos: number | null;
  estimatedPieceCount: number | null;
  note: string | null;
};

export type OrderDetail = {
  _id: string;
  orderNumber: string | null;
  status: string;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  cancellationReason: string | null;
  rejectionReason: string | null;
  abandonmentDeadlineAt: string | null;

  // Derived, server-computed — never recompute these here.
  paymentStatus: OnlinePaymentStatus;
  amountDueCentavos: number;
  providerVerified: boolean;
  contactPhone: string | null;

  customer: {
    uid: string;
    displayName: string;
    maskedPhone: string | null;
    areaLabel: string | null;
    address: {
      streetAddress: string | null;
      barangayName: string | null;
      cityMunicipalityName: string | null;
      provinceName: string | null;
    } | null;
  };
  provider: {
    providerType: ProviderType;
    providerUid: string;
    branchId: string;
    providerName: string;
    allowsPayAtHandover: boolean | null;
  };
  serviceLines: ServiceLineSnapshot[];
  instructions: {
    pickupInstructions: string | null;
    accessInstructions: string | null;
    laundryCareInstructions: string | null;
    returnInstructions: string | null;
    customerGeneralNotes: string | null;
    providerNotes: string | null;
  };
  fulfillment: {
    pickupMode: string;
    pickupSubMode: string | null;
    returnMode: string;
    deliverySubMode: string | null;
    scheduledPickup: { date: string; label: string } | null;
  };
  turnaround: {
    tierCode: string;
    feeCentavos: number;
    slaHours: number | null;
    promisedCompletionAt: string | null;
  };
  pricing: {
    estimatedWeightKg: number | null;
    estimatedTotalCentavos: number;
    actualWeightKg: number | null;
    actualPieceCount: number | null;
    actualServiceTotalCentavos: number | null;
    customerTotalCentavos: number | null;
    serviceSubtotalCentavos: number | null;
    pickupFeeCentavos: number | null;
    returnFeeCentavos: number | null;
    turnaroundFeeCentavos: number | null;
    platformFeePercent: number | null;
    platformFeeCentavos: number | null;
    platformFeeConsumedCentavos: number | null;
  };
  paymentTiming: PaymentTiming;
  paymentSummary: {
    method: PaymentMethod | null;
    referenceId: string | null;
    amountCollectedCentavos: number | null;
    collectedByUid: string | null;
    collectedAt: string | null;
    tenderedCentavos: number | null;
    changeCentavos: number | null;
  };
  pickupAssignment: LegAssignment | null;
  returnAssignment: LegAssignment | null;
  pickupAttempts: AttemptEvidence[];
  deliveryAttempts: AttemptEvidence[];
  pickupProof: HandoverProof | null;
  returnProof: HandoverProof | null;
  pickupProofUrls: string[] | null;
  returnProofUrls: string[] | null;
  activeQualityHold: QualityHold | null;
};

export type OrderEvent = {
  _id: string;
  orderId: string;
  sequence: number;
  fromStatus: string | null;
  toStatus: string;
  actorUid: string;
  actorRole: string;
  note: string | null;
  createdAt: string | null;
};

const ORDER_FIELDS = `
  _id
  orderNumber
  status
  version
  createdAt
  updatedAt
  completedAt
  cancellationReason
  rejectionReason
  abandonmentDeadlineAt
  paymentStatus
  amountDueCentavos
  providerVerified
  contactPhone
  customer {
    uid displayName maskedPhone areaLabel
    address { streetAddress barangayName cityMunicipalityName provinceName }
  }
  provider { providerType providerUid branchId providerName allowsPayAtHandover }
  serviceLines {
    serviceRefId serviceName pricingType price productSurchargeCentavos
    estimatedLineTotalCentavos actualLineTotalCentavos estimatedPieceCount note
  }
  instructions {
    pickupInstructions accessInstructions laundryCareInstructions
    returnInstructions customerGeneralNotes providerNotes
  }
  fulfillment {
    pickupMode pickupSubMode returnMode deliverySubMode
    scheduledPickup { date label }
  }
  turnaround { tierCode feeCentavos slaHours promisedCompletionAt }
  pricing {
    estimatedWeightKg estimatedTotalCentavos actualWeightKg actualPieceCount
    actualServiceTotalCentavos customerTotalCentavos serviceSubtotalCentavos
    pickupFeeCentavos returnFeeCentavos turnaroundFeeCentavos
    platformFeePercent platformFeeCentavos platformFeeConsumedCentavos
  }
  paymentTiming
  paymentSummary {
    method referenceId amountCollectedCentavos collectedByUid collectedAt
    tenderedCentavos changeCentavos
  }
  pickupAssignment {
    assignedStaffUid assignedAt enRouteAt arrivedAt completedAt
    locationLat locationLng locationAt locationAccuracy locationSpeed locationHeading
  }
  returnAssignment {
    assignedStaffUid assignedAt enRouteAt arrivedAt completedAt
    locationLat locationLng locationAt locationAccuracy locationSpeed locationHeading
  }
  pickupAttempts { attemptNumber actorUid timestamp gpsLat gpsLng photoUrls responsibility reason }
  deliveryAttempts { attemptNumber actorUid timestamp gpsLat gpsLng photoUrls responsibility reason }
  pickupProof { capturedAt capturedByUid }
  returnProof { capturedAt capturedByUid }
  pickupProofUrls
  returnProofUrls
  activeQualityHold {
    serviceLineIndex category reason photoUrls blocksOrder additionalChargeCentavos
    customerResponse raisedAt respondTimeoutAt resolvedAt
  }
`;

export async function fetchOrder(id: string): Promise<OrderDetail> {
  const data = await graphqlFetch<{ onlineOrder: OrderDetail }>(
    `query OrderLookup($id: ID!) {
       onlineOrder(id: $id) { ${ORDER_FIELDS} }
     }`,
    { id },
  );
  return data.onlineOrder;
}

export async function fetchOrderTimeline(orderId: string): Promise<OrderEvent[]> {
  const data = await graphqlFetch<{ onlineOrderTimeline: OrderEvent[] }>(
    `query OrderTimeline($orderId: ID!) {
       onlineOrderTimeline(orderId: $orderId) {
         _id orderId sequence fromStatus toStatus actorUid actorRole note createdAt
       }
     }`,
    { orderId },
  );
  return data.onlineOrderTimeline;
}

/** Centavos → "₱1,234.50". Money is never formatted ad hoc. */
export function peso(centavos: number | null | undefined): string {
  const value = (centavos ?? 0) / 100;
  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}


// ─── Admin order search ─────────────────────────────────────────────────────

/**
 * A row in the search results. Deliberately a much thinner projection than
 * `OrderDetail`: the list renders 25 of these at a time and needs six fields,
 * while the detail query pulls the full snapshot including service lines,
 * attempts and quality holds.
 */
export type OrderSearchRow = {
  _id: string;
  orderNumber: string | null;
  status: string;
  createdAt: string | null;
  paymentStatus: OnlinePaymentStatus;
  amountDueCentavos: number;
  customer: {
    uid: string;
    displayName: string;
    maskedPhone: string | null;
    areaLabel: string | null;
  };
  provider: {
    providerType: ProviderType;
    providerName: string;
    branchId: string;
  };
};

export type AdminOrderFilter = {
  search?: string;
  /**
   * Raw lifecycle values. The page expands its coarse buckets into these via
   * `orderStatusesInBucket` — the backend has no notion of a bucket, so the
   * mapping lives in exactly one place (lib/status.ts).
   */
  statuses?: string[];
  providerType?: ProviderType;
  branchId?: string;
  customerUid?: string;
  outstandingBalanceOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
};

const SEARCH_QUERY = `
  query AdminOrders($filter: AdminOrderFilterInput) {
    adminOrders(filter: $filter) {
      data {
        _id
        orderNumber
        status
        createdAt
        paymentStatus
        amountDueCentavos
        customer { uid displayName maskedPhone areaLabel }
        provider { providerType providerName branchId }
      }
      total
    }
  }
`;

export async function searchAdminOrders(filter: AdminOrderFilter) {
  const { adminOrders } = await graphqlFetch<{
    adminOrders: { data: OrderSearchRow[]; total: number };
  }>(SEARCH_QUERY, { filter });
  return adminOrders;
}


// ─── Manual status override ─────────────────────────────────────────────────

const STATUS_OPTIONS_QUERY = `
  query OrderStatusOptions($orderId: ID!) {
    orderStatusOptions(orderId: $orderId)
  }
`;

/**
 * The states this order may legally move to right now, straight from the
 * backend's transition table.
 *
 * Always fetch this rather than deriving it here: the panel would then hold a
 * second copy of the state machine, and the two would drift the first time a
 * transition changed.
 */
export async function fetchOrderStatusOptions(orderId: string) {
  const { orderStatusOptions } = await graphqlFetch<{
    orderStatusOptions: string[];
  }>(STATUS_OPTIONS_QUERY, { orderId });
  return orderStatusOptions;
}

const OVERRIDE_MUTATION = `
  mutation OverrideOrderStatus(
    $orderId: ID!
    $status: OrderStatus!
    $reason: String!
    $note: String!
  ) {
    overrideOrderStatus(
      orderId: $orderId
      status: $status
      reason: $reason
      note: $note
    ) {
      _id
      status
      version
    }
  }
`;

/** Both `reason` and `note` are required by the backend. */
export function overrideOrderStatus(
  orderId: string,
  status: string,
  reason: string,
  note: string,
) {
  return graphqlFetch(OVERRIDE_MUTATION, { orderId, status, reason, note });
}
