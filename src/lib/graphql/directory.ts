import { graphqlFetch } from "@/lib/api-client";

/**
 * ACCOUNT DIRECTORY — every person on the platform, in one place.
 *
 * Read-only by design. The actions an admin takes on an account —
 * deactivate, reactivate, force logout — live in lib/graphql/merchants.ts and
 * admin-users.ts, already carry reason codes, and are already audited. This
 * module deliberately adds no second way to do them.
 *
 * Hand-maintained mirror of LALABA_BE_DEV/src/directory/*.
 */

export type DirectoryUser = {
  uid: string;
  displayName: string;
  email: string | null;
  phoneNumber: string | null;
  roleId: string;
  roleName: string;
  isActive: boolean;
  accountStatus: string | null;
  /** WASHER only. */
  washerStatus: string | null;
  /** COURIER only. */
  selfieStatus: string | null;
  /**
   * Other accounts sharing this phone number. A flag for a human, never
   * grounds on its own — families share numbers, and a provider signing up as
   * a customer is legitimate.
   */
  sharedPhoneCount: number;
  createdAt: string | null;
};

export type LinkedAccount = {
  uid: string;
  displayName: string;
  roleId: string;
  isActive: boolean;
  matchedOn: string;
  createdAt: string | null;
};

export type DirectoryDevice = {
  deviceId: string;
  deviceName: string;
  operatingSystem: string;
  deviceModel: string | null;
  status: string;
  staffName: string | null;
  createdAt: string | null;
};

export type DirectoryUserDetail = {
  user: DirectoryUser;
  ordersAsCustomer: number;
  ordersAsProvider: number;
  ticketsRaised: number;
  lastOrderAt: string | null;
  /** Null means NO WALLET — distinct from a provider whose balance is zero. */
  walletBalanceCentavos: number | null;
  devices: DirectoryDevice[];
  linkedAccounts: LinkedAccount[];
  sessionsValidAfter: string | null;
};

export type DirectoryFilter = {
  search?: string;
  roleIds?: string[];
  isActive?: boolean;
  sharedPhoneOnly?: boolean;
  limit: number;
  offset: number;
};

/** The roles a person can hold. `staff` is a merchant's employee, not back-office. */
export const DIRECTORY_ROLES = [
  { id: "customer", label: "Customers" },
  { id: "washer", label: "Home washers" },
  { id: "merchant", label: "Merchants" },
  { id: "staff", label: "Merchant staff" },
  { id: "courier", label: "Couriers" },
  { id: "admin", label: "Admins" },
  { id: "support", label: "Support" },
] as const;

export const ROLE_LABELS: Record<string, string> = {
  customer: "Customer",
  washer: "Home washer",
  merchant: "Merchant",
  staff: "Merchant staff",
  courier: "Courier",
  admin: "Admin",
  support: "Support",
};

const USER_FIELDS = `
  uid
  displayName
  email
  phoneNumber
  roleId
  roleName
  isActive
  accountStatus
  washerStatus
  selfieStatus
  sharedPhoneCount
  createdAt
`;

const LIST_QUERY = `
  query DirectoryUsers($filter: DirectoryFilterInput) {
    directoryUsers(filter: $filter) {
      data { ${USER_FIELDS} }
      total
    }
  }
`;

export async function listDirectoryUsers(filter: DirectoryFilter) {
  const { directoryUsers } = await graphqlFetch<{
    directoryUsers: { data: DirectoryUser[]; total: number };
  }>(LIST_QUERY, { filter });
  return directoryUsers;
}

const DETAIL_QUERY = `
  query DirectoryUser($uid: ID!) {
    directoryUser(uid: $uid) {
      user { ${USER_FIELDS} }
      ordersAsCustomer
      ordersAsProvider
      ticketsRaised
      lastOrderAt
      walletBalanceCentavos
      devices {
        deviceId
        deviceName
        operatingSystem
        deviceModel
        status
        staffName
        createdAt
      }
      linkedAccounts { uid displayName roleId isActive matchedOn createdAt }
      sessionsValidAfter
    }
  }
`;

export async function fetchDirectoryUser(uid: string) {
  const { directoryUser } = await graphqlFetch<{
    directoryUser: DirectoryUserDetail;
  }>(DETAIL_QUERY, { uid });
  return directoryUser;
}

// ─── Impersonation ("login as") ─────────────────────────────────────────────
//
// This mints a live Firebase credential for the target account — the most
// sensitive action in the panel. See the backend's DirectoryResolver for the
// two refusals (never a back-office account, never yourself) and why the
// audit write happens before the token is minted rather than after.

export type ImpersonationToken = {
  customToken: string;
  targetUid: string;
  targetName: string;
  /** Which client app this account signs into. */
  targetRoleId: string;
};

const IMPERSONATE_MUTATION = `
  mutation ImpersonateUser($uid: ID!, $reason: String!, $note: String) {
    impersonateUser(uid: $uid, reason: $reason, note: $note) {
      customToken
      targetUid
      targetName
      targetRoleId
    }
  }
`;

/**
 * The returned token must be exchanged for a real session within roughly an
 * hour of minting — a Firebase platform constraint, not ours. There is
 * currently no one-click way to open a client app already signed in as the
 * target: only the merchant/washer app has a signInWithCustomToken handler
 * today (built for biometric login), the customer app has none, and neither
 * has a debug entry point for an externally-minted token. The token is
 * exposed here for engineering/support to consume with what already exists.
 */
export function impersonateUser(uid: string, reason: string, note?: string | null) {
  return graphqlFetch<{ impersonateUser: ImpersonationToken }>(
    IMPERSONATE_MUTATION,
    { uid, reason, note: note ?? null },
  );
}
