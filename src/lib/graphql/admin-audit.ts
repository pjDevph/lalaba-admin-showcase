import { graphqlFetch } from "@/lib/api-client";

/**
 * PLATFORM-WIDE ADMIN AUDIT TRAIL — append-only, read-only.
 *
 * Separate from the KYC audit log (lib/graphql/kyc.ts), and deliberately so.
 * That trail is document-level and much richer — per-file claims, evidence URL
 * issuance — and folding the two together would either flatten detail the
 * reviewers depend on or bloat this one with KYC-only fields. The Audit Logs
 * page shows both, in two tabs.
 *
 * Hand-maintained mirror of LALABA_BE_DEV/src/admin-audit/*.
 */

export type AdminAuditAction =
  | "PROVIDER_SUSPENDED"
  | "PROVIDER_REACTIVATED"
  | "PROVIDER_CAP_CHANGED"
  | "ACCOUNT_DEACTIVATED"
  | "ACCOUNT_REACTIVATED"
  | "ADMIN_INVITED"
  | "COURIER_SELFIE_REVOKED"
  | "ORDER_STATUS_OVERRIDDEN"
  | "ORDER_REINSTATED"
  | "PLATFORM_FEE_PUBLISHED"
  | "PLATFORM_FEE_DEACTIVATED"
  | "MAINTENANCE_MODE_CHANGED"
  | "BOOKING_POLICY_PUBLISHED"
  | "WASHER_SERVICE_CHANGED";

export type AdminAuditTargetType =
  | "USER"
  | "PROVIDER"
  | "ORDER"
  | "COURIER_SELFIE"
  | "PLATFORM_CONFIG";

// Past tense, because every row describes something that already happened.
export const ADMIN_AUDIT_ACTION_LABELS: Record<AdminAuditAction, string> = {
  PROVIDER_SUSPENDED: "Suspended provider",
  PROVIDER_REACTIVATED: "Reactivated provider",
  PROVIDER_CAP_CHANGED: "Changed daily order cap",
  ACCOUNT_DEACTIVATED: "Deactivated account",
  ACCOUNT_REACTIVATED: "Reactivated account",
  ADMIN_INVITED: "Invited admin",
  COURIER_SELFIE_REVOKED: "Revoked courier photo",
  ORDER_STATUS_OVERRIDDEN: "Overrode order status",
  ORDER_REINSTATED: "Reinstated abandoned order",
  PLATFORM_FEE_PUBLISHED: "Published fee rule",
  PLATFORM_FEE_DEACTIVATED: "Deactivated fee rule",
  MAINTENANCE_MODE_CHANGED: "Changed maintenance mode",
  BOOKING_POLICY_PUBLISHED: "Published booking policy",
  WASHER_SERVICE_CHANGED: "Changed washer service",
};

export const ADMIN_AUDIT_TARGET_LABELS: Record<AdminAuditTargetType, string> = {
  USER: "Account",
  PROVIDER: "Provider",
  ORDER: "Order",
  COURIER_SELFIE: "Courier photo",
  PLATFORM_CONFIG: "Platform config",
};

/**
 * Which actions are decisions ABOUT someone, as opposed to configuration
 * changes. Only these carry a reason code, so the table can render an empty
 * reason cell as "not applicable" rather than "missing".
 */
export const ACTIONS_WITH_REASON: ReadonlySet<AdminAuditAction> = new Set([
  "PROVIDER_SUSPENDED",
  "ACCOUNT_DEACTIVATED",
  "COURIER_SELFIE_REVOKED",
  "ORDER_STATUS_OVERRIDDEN",
]);

export type AdminAuditEvent = {
  _id: string;
  action: AdminAuditAction;
  actorUid: string;
  /** Denormalised at write time — this is who they were THEN, not now. */
  actorName: string;
  actorEmail: string;
  actorRole: string;
  targetType: AdminAuditTargetType;
  targetId: string;
  targetLabel: string | null;
  reasonCode: string | null;
  note: string | null;
  /** JSON string; shape differs per action. Render, don't parse into a type. */
  detailsJson: string | null;
  timestamp: string | null;
};

export type AdminAuditFilter = {
  actions?: AdminAuditAction[];
  actorUid?: string;
  targetType?: AdminAuditTargetType;
  targetId?: string;
  limit: number;
  offset: number;
};

const QUERY = `
  query AdminAuditLog($filter: AdminAuditFilterInput) {
    adminAuditLog(filter: $filter) {
      data {
        _id
        action
        actorUid
        actorName
        actorEmail
        actorRole
        targetType
        targetId
        targetLabel
        reasonCode
        note
        detailsJson
        timestamp
      }
      total
    }
  }
`;

export async function listAdminAuditLog(filter: AdminAuditFilter) {
  const { adminAuditLog } = await graphqlFetch<{
    adminAuditLog: { data: AdminAuditEvent[]; total: number };
  }>(QUERY, { filter });
  return adminAuditLog;
}

/** Human-readable one-liner for a details blob whose shape varies per action. */
export function describeDetails(detailsJson: string | null): string | null {
  if (!detailsJson) return null;
  try {
    const parsed = JSON.parse(detailsJson) as Record<string, unknown>;
    return Object.entries(parsed)
      .map(([key, value]) => `${key}: ${value === null ? "none" : String(value)}`)
      .join(" · ");
  } catch {
    // Never throw over a log line — a malformed blob is still evidence that
    // something happened, and hiding the whole row would lose that.
    return detailsJson;
  }
}
