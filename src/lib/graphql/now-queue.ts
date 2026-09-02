import { graphqlFetch } from "@/lib/api-client";

/**
 * WHAT NEEDS SOMEONE, RIGHT NOW.
 *
 * Every threshold behind these rows is the backend's — "overdue" and "stuck"
 * are operational facts about Lalaba, and a copy of them in React would drift
 * from the copy in the inbox within a release. This file therefore has no
 * business logic at all: it fetches, and it maps a work item to the route that
 * opens it.
 */

export type WorkItemType =
  | "TICKET_OVERDUE"
  | "TICKET_UNASSIGNED"
  | "KYC_AWAITING_REVIEW"
  | "ORDER_STUCK"
  | "ORDER_UNSETTLED"
  | "WALLET_VARIANCE";

export type WorkPriority = "HIGH" | "MEDIUM" | "LOW";

export type WorkSubjectType =
  | "ORDER"
  | "TICKET"
  | "PERSON"
  | "BRANCH"
  | "NONE";

export type WorkItem = {
  id: string;
  type: WorkItemType;
  priority: WorkPriority;
  title: string;
  reason: string;
  subjectType: WorkSubjectType;
  subjectId: string | null;
  enteredQueueAt: string | null;
  ageMinutes: number | null;
  dueAt: string | null;
  overdueMinutes: number | null;
  assigneeName: string | null;
  amountCentavos: number | null;
};

export type NowQueue = {
  items: WorkItem[];
  /** Which kinds of work this caller was allowed to look for. */
  searchedTypes: WorkItemType[];
  truncated: boolean;
  generatedAt: string;
};

const NOW_QUEUE_QUERY = `
  query NowQueue {
    nowQueue {
      items {
        id
        type
        priority
        title
        reason
        subjectType
        subjectId
        enteredQueueAt
        ageMinutes
        dueAt
        overdueMinutes
        assigneeName
        amountCentavos
      }
      searchedTypes
      truncated
      generatedAt
    }
  }
`;

export async function fetchNowQueue() {
  const { nowQueue } = await graphqlFetch<{ nowQueue: NowQueue }>(
    NOW_QUEUE_QUERY,
  );
  return nowQueue;
}

export const WORK_ITEM_LABELS: Record<WorkItemType, string> = {
  TICKET_OVERDUE: "Overdue reply",
  TICKET_UNASSIGNED: "Unanswered ticket",
  KYC_AWAITING_REVIEW: "Verification waiting",
  ORDER_STUCK: "Order stuck",
  ORDER_UNSETTLED: "Unsettled order",
  WALLET_VARIANCE: "Ledger variance",
};

/**
 * Where a row opens.
 *
 * Every one lands somewhere an operator can ACT, not on a list containing the
 * thing — which is what makes the queue worth clicking. A person or branch
 * opens as an operational context, which is why Now was built after it:
 * before that page existed these rows had nowhere useful to land.
 */
export function destinationFor(item: WorkItem): string {
  switch (item.subjectType) {
    case "ORDER":
      return `/orders/${item.subjectId}`;
    case "TICKET":
      return `/tickets?ticket=${encodeURIComponent(item.subjectId ?? "")}`;
    case "PERSON":
      return `/context/person/${encodeURIComponent(item.subjectId ?? "")}`;
    case "BRANCH":
      return `/context/branch/${encodeURIComponent(item.subjectId ?? "")}`;
    default:
      return "/";
  }
}
