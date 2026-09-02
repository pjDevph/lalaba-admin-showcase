import { graphqlFetch } from "@/lib/api-client";

/**
 * THE OMNIBOX'S ONE QUERY.
 *
 * Deliberately a single backend call rather than a fan-out over the order,
 * directory and ticket searches this panel already has. Merging in the browser
 * would put ranking in React — so the palette would rank differently from every
 * page — decide permissions after the data arrived, and still fail on the
 * commonest input: an order stores only a masked phone, so the digits a
 * customer reads out can only be resolved against the user record server-side.
 */

export type SearchEntityType =
  | "CUSTOMER"
  | "BACK_OFFICE"
  | "PROVIDER"
  | "BRANCH"
  | "STAFF"
  | "COURIER"
  | "ORDER"
  | "TICKET";

export type SearchMatchedOn =
  | "ORDER_NUMBER"
  | "TICKET_NUMBER"
  | "PHONE"
  | "EMAIL"
  | "UID"
  | "REFERENCE"
  | "NAME";

export type SearchResult = {
  entityType: SearchEntityType;
  id: string;
  title: string;
  subtitle: string | null;
  matchedOn: SearchMatchedOn;
  matchStrength: "EXACT" | "PREFIX" | "FUZZY";
  context: {
    openOrders: number | null;
    openTickets: number | null;
    providerName: string | null;
    status: string | null;
  } | null;
};

export type OperationalSearchResults = {
  results: SearchResult[];
  /** Which types the backend was allowed to search FOR THIS CALLER. */
  searchedTypes: SearchEntityType[];
  truncated: boolean;
};

const SEARCH_QUERY = `
  query SearchOperationalEntities($query: String!, $limit: Int) {
    searchOperationalEntities(query: $query, limit: $limit) {
      results {
        entityType
        id
        title
        subtitle
        matchedOn
        matchStrength
        context {
          openOrders
          openTickets
          providerName
          status
        }
      }
      searchedTypes
      truncated
    }
  }
`;

export async function searchOperationalEntities(query: string, limit = 20) {
  const { searchOperationalEntities } = await graphqlFetch<{
    searchOperationalEntities: OperationalSearchResults;
  }>(SEARCH_QUERY, { query, limit });
  return searchOperationalEntities;
}

export const ENTITY_LABELS: Record<SearchEntityType, string> = {
  CUSTOMER: "Customers",
  BACK_OFFICE: "Back office",
  PROVIDER: "Providers",
  BRANCH: "Branches",
  STAFF: "Staff",
  COURIER: "Couriers",
  ORDER: "Orders",
  TICKET: "Tickets",
};

/** Why this row matched — shown so an operator can trust the top result. */
export const MATCHED_ON_LABELS: Record<SearchMatchedOn, string> = {
  ORDER_NUMBER: "order no.",
  TICKET_NUMBER: "ticket no.",
  PHONE: "phone",
  EMAIL: "email",
  UID: "id",
  REFERENCE: "reference",
  NAME: "name",
};

/**
 * Where a result opens.
 *
 * Every destination is a real route that survives a refresh and can be pasted
 * to a colleague — the whole point of the search is undone if it lands you on
 * a list you then have to search again. Tickets gained `?ticket=` for exactly
 * this, and opens its existing drawer.
 *
 * Kept per-type here rather than as a switch buried in a component, which is
 * what made pointing people at the operational context a one-line change once
 * that page existed.
 */
export function destinationFor(result: SearchResult): string {
  switch (result.entityType) {
    case "ORDER":
      // An order is already its own full surface — timeline, service lines,
      // the override control. The context page would be a worse version of it.
      return `/orders/${result.id}`;
    case "TICKET":
      return `/tickets?ticket=${encodeURIComponent(result.id)}`;
    case "BRANCH":
      return `/context/branch/${encodeURIComponent(result.id)}`;
    default:
      // Every person — customer, provider owner, staff, courier, back-office —
      // opens as an operational context: one address holding their orders,
      // tickets, wallet, branches and verification, each authorized on its
      // own. This is what makes "one search" the whole interaction rather
      // than the first step of one.
      return `/context/person/${encodeURIComponent(result.id)}`;
  }
}
