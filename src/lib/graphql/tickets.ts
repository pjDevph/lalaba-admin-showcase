import { graphqlFetch } from "@/lib/api-client";

/**
 * SUPPORT TICKETS — the unified inbox.
 *
 * Everything here is STAFF-facing. When the customer app eventually shows a
 * customer their own tickets, it must use its own queries scoped to the
 * requester and reading only customer-visible notes — never these with a
 * filter bolted on. The backend keeps that split as two separate methods for
 * the same reason.
 *
 * Hand-maintained mirror of LALABA_BE_DEV/src/support-tickets/*.
 */

export type TicketStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_ON_CUSTOMER"
  | "ESCALATED"
  | "RESOLVED"
  | "CLOSED";

export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type TicketSource =
  | "CUSTOMER_APP"
  | "PARTNER_APP"
  | "COURIER_APP"
  | "CHAT"
  | "WEBSITE"
  | "PHONE"
  | "ADMIN";

export type TicketCategory =
  | "ORDER_LATE"
  | "ORDER_DAMAGED"
  | "ORDER_MISSING_ITEMS"
  | "PAYMENT_DISPUTE"
  | "REFUND_REQUEST"
  | "WALLET_TOPUP"
  | "COURIER_CONDUCT"
  | "PROVIDER_CONDUCT"
  | "CUSTOMER_CONDUCT"
  | "ACCOUNT_ACCESS"
  | "VERIFICATION"
  | "APP_BUG"
  | "OTHER";

export type NoteVisibility = "INTERNAL" | "CUSTOMER";

export const TICKET_SOURCE_LABELS: Record<TicketSource, string> = {
  CUSTOMER_APP: "Customer app",
  PARTNER_APP: "Partner app",
  COURIER_APP: "Courier app",
  CHAT: "Chat",
  WEBSITE: "Website",
  PHONE: "Phone",
  ADMIN: "Raised in panel",
};

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  ORDER_LATE: "Order late",
  ORDER_DAMAGED: "Damaged items",
  ORDER_MISSING_ITEMS: "Missing items",
  PAYMENT_DISPUTE: "Payment dispute",
  REFUND_REQUEST: "Refund request",
  WALLET_TOPUP: "Wallet top-up",
  COURIER_CONDUCT: "Courier conduct",
  PROVIDER_CONDUCT: "Provider conduct",
  CUSTOMER_CONDUCT: "Customer conduct",
  ACCOUNT_ACCESS: "Account access",
  VERIFICATION: "Verification",
  APP_BUG: "App bug",
  OTHER: "Other",
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  NORMAL: "Normal",
  LOW: "Low",
};

/**
 * How a resolution is recorded. Structured for the same reason every other
 * decision in this platform is: "how do we usually fix these" should be
 * answerable without reading every closing note.
 */
export const TICKET_RESOLUTION_REASONS = [
  { code: "RESOLVED_EXPLAINED", label: "Explained — no action needed" },
  { code: "REFUND_ISSUED", label: "Refund issued" },
  { code: "REDELIVERY_ARRANGED", label: "Redelivery arranged" },
  { code: "ORDER_CORRECTED", label: "Order corrected" },
  { code: "PROVIDER_WARNED", label: "Provider or courier warned" },
  { code: "ACCOUNT_FIXED", label: "Account issue fixed" },
  { code: "BUG_ESCALATED", label: "Passed to engineering" },
  { code: "NO_RESPONSE", label: "Closed — customer stopped replying" },
  { code: "DUPLICATE", label: "Duplicate of another ticket" },
  { code: "OTHER", label: "Other (describe below)", requiresNote: true },
] as const;

/** Why a ticket is being escalated or handed to someone else. */
export const TICKET_HANDOFF_REASONS = [
  { code: "NEEDS_FINANCE", label: "Needs finance — refund or wallet" },
  { code: "NEEDS_OPS", label: "Needs ops — provider or courier action" },
  { code: "NEEDS_ENGINEERING", label: "Suspected bug" },
  { code: "REPEAT_COMPLAINT", label: "Repeat complaint from this customer" },
  { code: "AGENT_UNAVAILABLE", label: "Original agent unavailable" },
  { code: "SPECIALIST_KNOWLEDGE", label: "Colleague knows this case" },
  { code: "OTHER", label: "Other (describe below)", requiresNote: true },
] as const;

export type TicketRequester = {
  uid: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  role: string;
};

export type TicketNote = {
  _id: string;
  authorUid: string;
  authorName: string;
  visibility: NoteVisibility;
  body: string;
  /** Signed, short-lived read URL; null if no attachment. */
  imageUrl: string | null;
  createdAt: string | null;
};

export type TicketEvent = {
  _id: string;
  type: string;
  actorUid: string;
  actorName: string;
  fromValue: string | null;
  toValue: string | null;
  reason: string | null;
  createdAt: string | null;
};

export type Ticket = {
  _id: string;
  ticketNumber: string;
  subject: string;
  body: string;
  source: TicketSource;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  requester: TicketRequester;
  links: {
    orderId: string | null;
    providerBranchId: string | null;
    paymentReference: string | null;
  };
  assignedToUid: string | null;
  assignedToName: string | null;
  assignedAt: string | null;
  firstResponseAt: string | null;
  /** Null once answered — there is no longer a clock to count down. */
  firstResponseDueAt: string | null;
  resolvedAt: string | null;
  resolutionCode: string | null;
  createdAt: string | null;
};

export type TicketDetail = Ticket & {
  notes: TicketNote[];
  events: TicketEvent[];
};

const TICKET_FIELDS = `
  _id
  ticketNumber
  subject
  body
  source
  status
  priority
  category
  requester { uid displayName email phone role }
  links { orderId providerBranchId paymentReference }
  assignedToUid
  assignedToName
  assignedAt
  firstResponseAt
  firstResponseDueAt
  resolvedAt
  resolutionCode
  createdAt
`;

export type TicketFilter = {
  search?: string;
  statuses?: TicketStatus[];
  activeOnly?: boolean;
  priorities?: TicketPriority[];
  categories?: TicketCategory[];
  sources?: TicketSource[];
  assignedToUid?: string;
  unassignedOnly?: boolean;
  orderId?: string;
  limit: number;
  offset: number;
};

const LIST_QUERY = `
  query SupportTickets($filter: TicketFilterInput) {
    supportTickets(filter: $filter) {
      data { ${TICKET_FIELDS} }
      total
    }
  }
`;

export async function listTickets(filter: TicketFilter) {
  const { supportTickets } = await graphqlFetch<{
    supportTickets: { data: Ticket[]; total: number };
  }>(LIST_QUERY, { filter });
  return supportTickets;
}

const DETAIL_QUERY = `
  query SupportTicket($ticketId: ID!) {
    supportTicket(ticketId: $ticketId) {
      ${TICKET_FIELDS}
      notes { _id authorUid authorName visibility body imageUrl createdAt }
      events { _id type actorUid actorName fromValue toValue reason createdAt }
    }
  }
`;

export async function fetchTicket(ticketId: string) {
  const { supportTicket } = await graphqlFetch<{ supportTicket: TicketDetail }>(
    DETAIL_QUERY,
    { ticketId },
  );
  return supportTicket;
}

export type TicketMetrics = {
  open: number;
  inProgress: number;
  waitingOnCustomer: number;
  escalated: number;
  unassigned: number;
  breachedFirstResponse: number;
};

const METRICS_QUERY = `
  query SupportTicketMetrics {
    supportTicketMetrics {
      open
      inProgress
      waitingOnCustomer
      escalated
      unassigned
      breachedFirstResponse
    }
  }
`;

export async function fetchTicketMetrics() {
  const { supportTicketMetrics } = await graphqlFetch<{
    supportTicketMetrics: TicketMetrics;
  }>(METRICS_QUERY);
  return supportTicketMetrics;
}

const ADD_NOTE = `
  mutation AddSupportTicketNote(
    $ticketId: ID!
    $body: String!
    $visibility: NoteVisibility!
    $imageKey: String
  ) {
    addSupportTicketNote(
      ticketId: $ticketId
      body: $body
      visibility: $visibility
      imageKey: $imageKey
    ) {
      _id
      visibility
      body
      imageUrl
      createdAt
    }
  }
`;

export function addTicketNote(
  ticketId: string,
  body: string,
  visibility: NoteVisibility,
  imageKey?: string,
) {
  return graphqlFetch(ADD_NOTE, { ticketId, body, visibility, imageKey });
}

/**
 * Attachments on an agent's reply.
 *
 * Notes have always RENDERED an image — a customer photographing a stained
 * shirt is most of what this ticket system carries — and the panel had no way
 * to send one back. So an agent could see the damage and could not send the
 * photo of the replacement, the receipt, or the courier's handover shot.
 *
 * Upload first, reference next: `uploadSupportTicketImage` stores the bytes
 * against the ticket and returns a key, which is then passed to
 * addSupportTicketNote. The two-step is the backend's own contract — it scopes
 * the object to the ticket before any note exists to point at it.
 */
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const TICKET_IMAGE_ACCEPT = ACCEPTED_IMAGE_TYPES.join(",");

/** 5 MB, matching the campaign uploader — one photo, not a scan of a folder. */
export const TICKET_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export class TicketImageRejected extends Error {}

export async function uploadTicketImage(
  ticketId: string,
  file: File,
): Promise<string> {
  // Checked here so the mistake surfaces before a multi-megabyte round trip.
  // The bytes are sniffed server-side regardless, so a renamed file still
  // fails there — this is the fast, legible half of the same rule.
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new TicketImageRejected("Use a JPG, PNG or WebP image.");
  }
  if (file.size > TICKET_IMAGE_MAX_BYTES) {
    throw new TicketImageRejected("That image is over 5 MB — please compress it.");
  }

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new TicketImageRejected("Could not read that file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      // Strip the `data:image/png;base64,` prefix — same contract the campaign
      // uploader uses.
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.readAsDataURL(file);
  });

  const { uploadSupportTicketImage } = await graphqlFetch<{
    uploadSupportTicketImage: string;
  }>(
    `mutation UploadSupportTicketImage($ticketId: ID!, $base64: String!, $mimeType: String!) {
       uploadSupportTicketImage(ticketId: $ticketId, base64: $base64, mimeType: $mimeType)
     }`,
    { ticketId, base64, mimeType: file.type },
  );
  return uploadSupportTicketImage;
}

const SET_STATUS = `
  mutation SetSupportTicketStatus(
    $ticketId: ID!
    $status: TicketStatus!
    $reason: String
  ) {
    setSupportTicketStatus(
      ticketId: $ticketId
      status: $status
      reason: $reason
    ) {
      _id
      status
    }
  }
`;

/** The backend REQUIRES a reason to escalate; it will reject an empty one. */
export function setTicketStatus(
  ticketId: string,
  status: TicketStatus,
  reason?: string | null,
) {
  return graphqlFetch(SET_STATUS, { ticketId, status, reason: reason ?? null });
}

const ASSIGN = `
  mutation AssignSupportTicket(
    $ticketId: ID!
    $assigneeUid: ID
    $reason: String
  ) {
    assignSupportTicket(
      ticketId: $ticketId
      assigneeUid: $assigneeUid
      reason: $reason
    ) {
      _id
      assignedToUid
      assignedToName
    }
  }
`;

/**
 * `assigneeUid: null` unassigns. Taking a ticket OFF someone else requires a
 * handoff reason — the backend rejects it without one.
 */
export function assignTicket(
  ticketId: string,
  assigneeUid: string | null,
  reason?: string | null,
) {
  return graphqlFetch(ASSIGN, {
    ticketId,
    assigneeUid,
    reason: reason ?? null,
  });
}

const SET_PRIORITY = `
  mutation SetSupportTicketPriority($ticketId: ID!, $priority: TicketPriority!) {
    setSupportTicketPriority(ticketId: $ticketId, priority: $priority) {
      _id
      priority
    }
  }
`;

export function setTicketPriority(ticketId: string, priority: TicketPriority) {
  return graphqlFetch(SET_PRIORITY, { ticketId, priority });
}

const RESOLVE = `
  mutation ResolveSupportTicket(
    $ticketId: ID!
    $resolutionCode: String!
    $note: String
  ) {
    resolveSupportTicket(
      ticketId: $ticketId
      resolutionCode: $resolutionCode
      note: $note
    ) {
      _id
      status
      resolutionCode
    }
  }
`;

/** The note is sent to the CUSTOMER, not filed internally. */
export function resolveTicket(
  ticketId: string,
  resolutionCode: string,
  note?: string | null,
) {
  return graphqlFetch(RESOLVE, {
    ticketId,
    resolutionCode,
    note: note ?? null,
  });
}

const CREATE = `
  mutation CreateSupportTicket($input: CreateTicketInput!) {
    createSupportTicket(input: $input) { _id ticketNumber }
  }
`;

export type CreateTicketInput = {
  requesterUid: string;
  subject: string;
  body: string;
  category: TicketCategory;
  source?: TicketSource;
  priority?: TicketPriority;
  orderId?: string;
};

export function createTicket(input: CreateTicketInput) {
  return graphqlFetch<{ createSupportTicket: { _id: string; ticketNumber: string } }>(
    CREATE,
    { input },
  );
}

/** Minutes remaining against the first-response target; negative = breached. */
export function minutesUntilDue(dueAt: string | null): number | null {
  if (!dueAt) return null;
  return Math.round((new Date(dueAt).getTime() - Date.now()) / 60_000);
}
