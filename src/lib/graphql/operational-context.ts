import { graphqlFetch } from "@/lib/api-client";

/**
 * ONE SUBJECT, ASSEMBLED — the query behind the context workspace.
 *
 * Every module comes back only if the BACKEND decided this caller may see it,
 * and `modules` says which were assembled. That list is the important field:
 * a module missing because you are not allowed to see it and a module missing
 * because the subject has none are identical in the payload and mean opposite
 * things. Without `modules` the page would tell a support agent that a
 * provider has no wallet.
 *
 * The panel's own capability map governs what it OFFERS; this list governs what
 * it can SHOW. Both, deliberately — the capability layer is an affordance
 * layer, and the backend remains the boundary.
 */

export type ContextSubjectType = "PERSON" | "BRANCH";

export type ContextModuleKey =
  | "IDENTITY"
  | "ORDERS"
  | "TICKETS"
  | "WALLET"
  | "KYC"
  | "BRANCHES"
  | "STAFF";

export type ContextIdentity = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  roleId: string | null;
  isActive: boolean;
  accountStatus: string | null;
  joinedAt: string | null;
  branchName: string | null;
};

export type ContextOrderRow = {
  id: string;
  orderNumber: string | null;
  status: string;
  counterpartyName: string;
  totalCentavos: number;
  collectedCentavos: number;
  createdAt: string | null;
};

export type ContextTicketRow = {
  id: string;
  ticketNumber: string | null;
  subject: string;
  status: string;
  priority: string;
  createdAt: string | null;
};

export type OperationalContext = {
  subjectType: ContextSubjectType;
  identity: ContextIdentity;
  modules: ContextModuleKey[];
  orders: {
    total: number;
    open: number;
    outstandingCentavos: number;
    recent: ContextOrderRow[];
  } | null;
  tickets: {
    total: number;
    open: number;
    recent: ContextTicketRow[];
  } | null;
  wallet: {
    branchId: string;
    balanceCentavos: number;
    activated: boolean;
  } | null;
  kyc: {
    submitted: number;
    approved: number;
    rejected: number;
    documents: {
      id: string;
      documentType: string;
      status: string;
      submittedAt: string | null;
    }[];
  } | null;
  branches: { id: string; branchName: string; isActive: boolean }[] | null;
  staff:
    | { id: string; displayName: string; email: string | null; isActive: boolean }[]
    | null;
};

const CONTEXT_QUERY = `
  query OperationalContext($subjectType: ContextSubjectType!, $id: ID!) {
    operationalContext(subjectType: $subjectType, id: $id) {
      subjectType
      modules
      identity {
        id
        displayName
        email
        phone
        roleId
        isActive
        accountStatus
        joinedAt
        branchName
      }
      orders {
        total
        open
        outstandingCentavos
        recent {
          id
          orderNumber
          status
          counterpartyName
          totalCentavos
          collectedCentavos
          createdAt
        }
      }
      tickets {
        total
        open
        recent {
          id
          ticketNumber
          subject
          status
          priority
          createdAt
        }
      }
      wallet {
        branchId
        balanceCentavos
        activated
      }
      kyc {
        submitted
        approved
        rejected
        documents {
          id
          documentType
          status
          submittedAt
        }
      }
      branches {
        id
        branchName
        isActive
      }
      staff {
        id
        displayName
        email
        isActive
      }
    }
  }
`;

export async function fetchOperationalContext(
  subjectType: ContextSubjectType,
  id: string,
) {
  const { operationalContext } = await graphqlFetch<{
    operationalContext: OperationalContext;
  }>(CONTEXT_QUERY, { subjectType, id });
  return operationalContext;
}

export const ROLE_LABELS: Record<string, string> = {
  customer: "Customer",
  merchant: "Laundromat owner",
  washer: "Home washer",
  staff: "Branch staff",
  courier: "Courier",
  admin: "Administrator",
  support: "Support agent",
};
