import { graphqlFetch } from "@/lib/api-client";
import type { UserProfile } from "@/lib/types";

export type AdminUserFilter = {
  search?: string;
  role?: "admin" | "support";
  isActive?: boolean;
  limit: number;
  offset: number;
};

export type CreateAdminUserInput = {
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  role: "admin" | "support";
};

const LIST_QUERY = `
  query ListAdminUsers($filter: UserFilterInput) {
    listAdminUsers(filter: $filter) {
      data {
        _id
        firstName
        lastName
        email
        role { roleId roleName }
        isActive
        createdAt
      }
      total
    }
  }
`;

export async function listAdminUsers(filter: AdminUserFilter) {
  const { listAdminUsers } = await graphqlFetch<{
    listAdminUsers: { data: UserProfile[]; total: number };
  }>(LIST_QUERY, { filter });
  return listAdminUsers;
}

const CREATE_MUTATION = `
  mutation CreateAdminUser($input: CreateAdminUserInput!) {
    createAdminUser(input: $input) { _id }
  }
`;

export function createAdminUser(input: CreateAdminUserInput) {
  return graphqlFetch(CREATE_MUTATION, { input });
}

const RESEND_MUTATION = `
  mutation ResendAdminInvite($uid: String!) {
    resendAdminInvite(uid: $uid)
  }
`;

export function resendAdminInvite(uid: string) {
  return graphqlFetch(RESEND_MUTATION, { uid });
}

const REVOKE_MUTATION = `
  mutation RevokeUserSessions($uid: String!, $reason: String!, $note: String) {
    revokeUserSessions(uid: $uid, reason: $reason, note: $note)
  }
`;

/**
 * End every session for an account, immediately.
 *
 * Distinct from deactivating them: a lost laptop needs the sessions killed
 * without stopping the person working. The backend kills both the token they
 * currently hold and their ability to mint a new one.
 */
export function revokeUserSessions(
  uid: string,
  reason: string,
  note?: string | null,
) {
  return graphqlFetch(REVOKE_MUTATION, { uid, reason, note: note ?? null });
}
