import { graphqlFetch } from "@/lib/api-client";

export type MerchantRow = {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  isActive: boolean;
  createdAt: string;
  branchCount: number;
};

export type MerchantFilter = {
  search?: string;
  isActive?: boolean;
  limit: number;
  offset: number;
};

const LIST_QUERY = `
  query ListMerchants($filter: UserFilterInput) {
    listMerchants(filter: $filter) {
      data {
        _id
        firstName
        lastName
        email
        phoneNumber
        isActive
        createdAt
        branchCount
      }
      total
    }
  }
`;

export async function listMerchants(filter: MerchantFilter) {
  const { listMerchants } = await graphqlFetch<{
    listMerchants: { data: MerchantRow[]; total: number };
  }>(LIST_QUERY, { filter });
  return listMerchants;
}

const COUNT_BY_ROLE_QUERY = `
  query CountUsersByRole($roleId: String!) {
    countUsersByRole(roleId: $roleId)
  }
`;

/** Active headcount for one role, platform-wide — not merchant-specific. */
export async function countUsersByRole(roleId: string): Promise<number> {
  const { countUsersByRole } = await graphqlFetch<{
    countUsersByRole: number;
  }>(COUNT_BY_ROLE_QUERY, { roleId });
  return countUsersByRole;
}

// Generic user-activation mutations (any role, not merchant-specific) —
// kept here since the Merchants page was the first caller. The account
// directory drawer uses these too now.
const DEACTIVATE_MUTATION = `
  mutation DeactivateUser($uid: String!, $reason: String!, $note: String) {
    deactivateUser(uid: $uid, reason: $reason, note: $note) { _id isActive }
  }
`;

/**
 * `reason` is required by the backend, not merely collected here — it is
 * written to the platform audit trail as a structured code alongside who did
 * it and when. Pass a code from ACCOUNT_DEACTIVATION_REASONS, never prose.
 */
export function deactivateUser(uid: string, reason: string, note?: string | null) {
  return graphqlFetch(DEACTIVATE_MUTATION, { uid, reason, note: note ?? null });
}

const REACTIVATE_MUTATION = `
  mutation ReactivateUser($uid: String!, $note: String) {
    reactivateUser(uid: $uid, note: $note) { _id isActive }
  }
`;

// No reason code: restoring the default state has no taxonomy worth counting.
// Who and when are still recorded.
export function reactivateUser(uid: string, note?: string | null) {
  return graphqlFetch(REACTIVATE_MUTATION, { uid, note: note ?? null });
}
