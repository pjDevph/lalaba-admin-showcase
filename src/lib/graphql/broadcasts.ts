import { graphqlFetch } from "@/lib/api-client";

/**
 * PUSH BROADCASTS — irreversible by nature.
 *
 * A notification on someone's lock screen cannot be recalled, edited or
 * deleted. Everything here exists so an admin can find out exactly what they
 * are about to do before they do it.
 *
 * Hand-maintained mirror of LALABA_BE_DEV/src/notifications/*.
 */

export type BroadcastStatus = "SENDING" | "SENT" | "NO_RECIPIENTS" | "FAILED";

export type Broadcast = {
  _id: string;
  title: string;
  body: string;
  audienceRoleIds: string[];
  includedInactive: boolean;
  status: BroadcastStatus;
  /** Accounts matching the audience. */
  audienceCount: number;
  /** Devices targeted — always fewer than the audience has people. */
  tokenCount: number;
  deadTokenCount: number;
  sentByUid: string;
  sentByName: string;
  failureReason: string | null;
  createdAt: string | null;
};

export type BroadcastPreview = {
  audienceCount: number;
  /** Of the audience, how many have ever opened the app. */
  reachableCount: number;
  tokenCount: number;
};

/**
 * Who a broadcast can target. Deliberately roles, not a segment builder —
 * a targeting language nobody can predict the output of is how the wrong
 * 4,000 people get a push at 6am.
 */
export const BROADCAST_AUDIENCES = [
  { id: "customer", label: "Customers" },
  { id: "washer", label: "Home washers" },
  { id: "merchant", label: "Merchants" },
  { id: "staff", label: "Merchant staff" },
  { id: "courier", label: "Couriers" },
] as const;

const PREVIEW_QUERY = `
  query BroadcastPreview($audienceRoleIds: [String!]!, $includeInactive: Boolean) {
    broadcastPreview(
      audienceRoleIds: $audienceRoleIds
      includeInactive: $includeInactive
    ) {
      audienceCount
      reachableCount
      tokenCount
    }
  }
`;

export async function fetchBroadcastPreview(
  audienceRoleIds: string[],
  includeInactive: boolean,
) {
  const { broadcastPreview } = await graphqlFetch<{
    broadcastPreview: BroadcastPreview;
  }>(PREVIEW_QUERY, { audienceRoleIds, includeInactive });
  return broadcastPreview;
}

const BROADCAST_FIELDS = `
  _id
  title
  body
  audienceRoleIds
  includedInactive
  status
  audienceCount
  tokenCount
  deadTokenCount
  sentByUid
  sentByName
  failureReason
  createdAt
`;

const HISTORY_QUERY = `
  query BroadcastHistory($limit: Int, $offset: Int) {
    broadcastHistory(limit: $limit, offset: $offset) {
      data { ${BROADCAST_FIELDS} }
      total
    }
  }
`;

export async function fetchBroadcastHistory(limit: number, offset: number) {
  const { broadcastHistory } = await graphqlFetch<{
    broadcastHistory: { data: Broadcast[]; total: number };
  }>(HISTORY_QUERY, { limit, offset });
  return broadcastHistory;
}

const SEND_MUTATION = `
  mutation SendBroadcast($input: SendBroadcastInput!) {
    sendBroadcast(input: $input) { ${BROADCAST_FIELDS} }
  }
`;

export type SendBroadcastInput = {
  title: string;
  body: string;
  audienceRoleIds: string[];
  includeInactive?: boolean;
};

/** There is no undo. The caller must confirm before reaching this. */
export async function sendBroadcast(input: SendBroadcastInput) {
  const { sendBroadcast } = await graphqlFetch<{ sendBroadcast: Broadcast }>(
    SEND_MUTATION,
    { input },
  );
  return sendBroadcast;
}

/** Android truncates a push title around here; the backend enforces it too. */
export const TITLE_MAX = 65;
export const BODY_MAX = 240;
