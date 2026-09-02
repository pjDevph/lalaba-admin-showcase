import { graphqlFetch } from "@/lib/api-client";

/**
 * DSAR/compliance visibility: the account-deletion grace-period queue and
 * per-user consent history. Both mutations (cancelAccountDeletion, consent
 * recording itself) already existed elsewhere — this file is purely the
 * read side that was missing, matching LALABA_BE_DEV's accountDeletionQueue
 * and userConsents queries.
 */

export type DeletionQueueStatus = "pending" | "cancelled" | "completed";

export type DeletionQueueEntry = {
  uid: string;
  roleId: string | null;
  displayName: string;
  email: string;
  requestedAt: string;
  scheduledAt: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
  completedAt: string | null;
};

const QUEUE_FIELDS = `uid roleId displayName email requestedAt scheduledAt cancelledAt cancelledBy completedAt`;

export async function fetchDeletionQueue(status?: DeletionQueueStatus) {
  const { accountDeletionQueue } = await graphqlFetch<{
    accountDeletionQueue: DeletionQueueEntry[];
  }>(`query($status: String) { accountDeletionQueue(status: $status) { ${QUEUE_FIELDS} } }`, {
    status,
  });
  return accountDeletionQueue;
}

export function cancelAccountDeletion(uid: string) {
  return graphqlFetch(
    `mutation($uid: ID!) { cancelAccountDeletion(uid: $uid) { _id isActive } }`,
    { uid },
  );
}

export type Consent = {
  _id: string;
  policyType: string;
  version: string;
  locale: string | null;
  source: string;
  createdAt: string | null;
};

export async function fetchUserConsents(uid: string) {
  const { userConsents } = await graphqlFetch<{ userConsents: Consent[] }>(
    `query($uid: ID!) { userConsents(uid: $uid) { _id policyType version locale source createdAt } }`,
    { uid },
  );
  return userConsents;
}
