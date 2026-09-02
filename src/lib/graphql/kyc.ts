import { graphqlFetch } from "@/lib/api-client";
// A washer's SELFIE is captured by the same on-device liveness check couriers
// pass, and carries the same challenge and metadata — one type, one label map,
// shared with the courier-selfies queue.
import type {
  LivenessChallenge,
  LivenessMetadata,
} from "@/lib/graphql/courier-selfies";

// Mirrors of the backend enums (LALABA_BE_DEV/src/kyc/schemas/kyc-document.schema.ts).
// Hand-maintained — this project has no GraphQL codegen.
export type KycProviderType = "MERCHANT_BRANCH" | "WASHER";

export type KycDocumentStatus =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SUPERSEDED";

export type KycDocumentType =
  | "BUSINESS_PERMIT"
  | "OWNER_VALID_ID"
  | "DTI_CERTIFICATE"
  | "BIR_2303"
  | "BUSINESS_PHOTO_STOREFRONT"
  | "BUSINESS_PHOTO_INTERIOR"
  | "BUSINESS_PHOTO_MACHINES"
  | "VALID_ID"
  | "VALID_ID_BACK"
  | "BARANGAY_CLEARANCE"
  | "PROOF_OF_ADDRESS"
  | "SELFIE";

// Reviewer-facing labels. The apps never show the raw enum, and neither
// should the queue.
export const KYC_DOCUMENT_TYPE_LABELS: Record<KycDocumentType, string> = {
  BUSINESS_PERMIT: "Business Permit (retired)",
  OWNER_VALID_ID: "Owner / Representative ID",
  DTI_CERTIFICATE: "DTI Certificate",
  BIR_2303: "BIR Form 2303",
  BUSINESS_PHOTO_STOREFRONT: "Business Photo — Storefront",
  BUSINESS_PHOTO_INTERIOR: "Business Photo — Inside store",
  BUSINESS_PHOTO_MACHINES: "Business Photo — Machines",
  VALID_ID: "Government ID (front)",
  VALID_ID_BACK: "Government ID (back)",
  BARANGAY_CLEARANCE: "Barangay Clearance",
  PROOF_OF_ADDRESS: "Proof of Address",
  SELFIE: "Selfie Verification",
};

// Which government ID the provider CLAIMED this is. A claim, not a finding —
// the whole point is that a reviewer can now compare it against the photo and
// reject WRONG_DOCUMENT when the two disagree.
export type GovernmentIdType =
  | "PHILSYS_NATIONAL_ID"
  | "DRIVERS_LICENSE"
  | "PASSPORT"
  | "UMID"
  | "SSS_ID"
  | "PHILHEALTH_ID"
  | "POSTAL_ID"
  | "VOTERS_ID"
  | "PRC_ID"
  | "TIN_ID"
  | "OTHER";

export const KYC_ID_TYPE_LABELS: Record<GovernmentIdType, string> = {
  PHILSYS_NATIONAL_ID: "PhilSys / National ID",
  DRIVERS_LICENSE: "Driver's License",
  PASSPORT: "Passport",
  UMID: "UMID",
  SSS_ID: "SSS ID",
  PHILHEALTH_ID: "PhilHealth ID",
  POSTAL_ID: "Postal ID",
  VOTERS_ID: "Voter's ID",
  PRC_ID: "PRC ID",
  TIN_ID: "TIN ID",
  OTHER: "Other government-issued ID",
};

/**
 * Reviewer-facing text for a claimed ID type, tolerant of a value this build
 * doesn't know — the enum is append-only server-side, so an admin panel one
 * deploy behind must not render "undefined" over a reviewer's evidence.
 */
export function idTypeLabel(
  idType: GovernmentIdType | null | undefined,
): string | null {
  if (!idType) return null;
  return KYC_ID_TYPE_LABELS[idType] ?? idType.replaceAll("_", " ");
}

export const KYC_PROVIDER_TYPE_LABELS: Record<KycProviderType, string> = {
  MERCHANT_BRANCH: "Laundromat",
  WASHER: "Home washer",
};

// Provider-level badge. Mirrors BranchVerificationStatus / VerificationStatus,
// which the backend keeps identical (LALABA_BE_DEV/src/branches/schemas/branch.schema.ts).
// IN_REVIEW means every required document is in and none is rejected — the
// provider has nothing left to do, only a reviewer does.
export type KycVerificationStatus =
  | "PENDING"
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED";

export const KYC_VERIFICATION_STATUS_LABELS: Record<
  KycVerificationStatus,
  string
> = {
  PENDING: "Incomplete",
  IN_REVIEW: "In review",
  APPROVED: "Verified",
  REJECTED: "Action required",
};

export type KycAuditEventType =
  | "DOCUMENT_SUBMITTED"
  | "DOCUMENT_SUPERSEDED"
  | "DOCUMENT_CLAIMED_FOR_REVIEW"
  | "DOCUMENT_CLAIM_OVERRIDDEN"
  | "DOCUMENT_APPROVED"
  | "DOCUMENT_REJECTED"
  | "DOCUMENT_URL_ISSUED"
  | "PROVIDER_VERIFICATION_APPROVED"
  | "PROVIDER_VERIFICATION_REJECTED";

export const KYC_AUDIT_EVENT_LABELS: Record<KycAuditEventType, string> = {
  DOCUMENT_SUBMITTED: "Submitted",
  DOCUMENT_SUPERSEDED: "Superseded",
  DOCUMENT_CLAIMED_FOR_REVIEW: "Claimed",
  DOCUMENT_CLAIM_OVERRIDDEN: "Claim overridden",
  DOCUMENT_APPROVED: "Approved",
  DOCUMENT_REJECTED: "Rejected",
  DOCUMENT_URL_ISSUED: "Evidence viewed",
  PROVIDER_VERIFICATION_APPROVED: "Provider verified",
  PROVIDER_VERIFICATION_REJECTED: "Provider rejected",
};

export type KycDocumentRow = {
  _id: string;
  providerId: string;
  providerType: KycProviderType;
  ownerUid: string;
  documentType: KycDocumentType;
  /** Set only on the front-of-ID types; null on everything else. */
  governmentIdType: GovernmentIdType | null;
  mimeType: string;
  fileSizeBytes: number;
  status: KycDocumentStatus;
  submittedAt: string;
  expiresAt: string | null;
  claimedByUid: string | null;
  claimedAt: string | null;
};

export type KycReviewQueueItem = {
  document: KycDocumentRow;
  providerName: string | null;
  ownerEmail: string | null;
  /** Email of the reviewer holding the claim. Null when unclaimed. */
  claimedByEmail: string | null;
};

export type KycReviewQueueFilter = {
  /** undefined = both claimed and unclaimed. */
  claimed?: boolean;
  /**
   * undefined = the backend's default actionable queue (SUBMITTED +
   * UNDER_REVIEW). Pass an explicit list to audit already-decided documents.
   */
  status?: KycDocumentStatus[];
  limit: number;
  offset: number;
};

const QUEUE_QUERY = `
  query KycReviewQueue($claimed: Boolean, $limit: Int, $offset: Int, $status: [KycDocumentStatus!]) {
    kycReviewQueue(claimed: $claimed, limit: $limit, offset: $offset, status: $status) {
      data {
        document {
          _id
          providerId
          providerType
          ownerUid
          documentType
          governmentIdType
          mimeType
          fileSizeBytes
          status
          submittedAt
          expiresAt
          claimedByUid
          claimedAt
        }
        providerName
        ownerEmail
        claimedByEmail
      }
      total
    }
  }
`;

export async function listKycReviewQueue(filter: KycReviewQueueFilter) {
  const { kycReviewQueue } = await graphqlFetch<{
    kycReviewQueue: { data: KycReviewQueueItem[]; total: number };
  }>(QUEUE_QUERY, filter);
  return kycReviewQueue;
}

// ─── Monitoring: per-provider rollup ──────────────────────────────────────

export type KycProviderSummary = {
  providerId: string;
  providerType: KycProviderType;
  providerName: string | null;
  ownerEmail: string | null;
  ownerUid: string;
  verificationStatus: KycVerificationStatus;
  verifiedAt: string | null;
  rejectionReason: string | null;
  requiredCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  lastSubmittedAt: string | null;
  lastDecisionAt: string | null;
  /** Reviewer holding the whole case (claiming is per case, not per document). */
  claimedByUid: string | null;
  claimedByEmail: string | null;
  /** Policy edition the provider was verified under; null if never approved. */
  verificationPolicyVersion: number | null;
  /**
   * Verified under a superseded policy. approvedCount/requiredCount is NOT
   * meaningful for these — render "Verified · legacy policy", never "0 of 6".
   */
  grandfathered: boolean;
};

export type KycProviderFilter = {
  providerType?: KycProviderType;
  verificationStatus?: KycVerificationStatus;
  search?: string;
  limit: number;
  offset: number;
};

const PROVIDER_SUMMARY_FIELDS = `
  providerId
  providerType
  providerName
  ownerEmail
  ownerUid
  verificationStatus
  verifiedAt
  rejectionReason
  requiredCount
  approvedCount
  pendingCount
  rejectedCount
  lastSubmittedAt
  lastDecisionAt
  claimedByUid
  claimedByEmail
  verificationPolicyVersion
  grandfathered
`;

const PROVIDERS_QUERY = `
  query KycProviders($filter: KycProviderFilterInput) {
    kycProviders(filter: $filter) {
      data { ${PROVIDER_SUMMARY_FIELDS} }
      total
    }
  }
`;

export async function listKycProviders(filter: KycProviderFilter) {
  const { kycProviders } = await graphqlFetch<{
    kycProviders: { data: KycProviderSummary[]; total: number };
  }>(PROVIDERS_QUERY, { filter });
  return kycProviders;
}

export type KycProviderDocumentView = {
  document: KycDocumentRow & {
    reviewedAt: string | null;
    reviewedByUid: string | null;
    rejectionReason: string | null;
    supersedesDocumentId: string | null;
    // SELFIE only, and only when the partner's app captured it through the
    // liveness check. Null on every other document type, and on selfies taken
    // before that check shipped. Client-asserted — see LivenessSummary in
    // components/kyc/provider-detail-dialog.tsx.
    livenessChallenge: LivenessChallenge | null;
    livenessMetadata: LivenessMetadata | null;
  };
  required: boolean;
  reviewedByEmail: string | null;
  claimedByEmail: string | null;
  expired: boolean;
};

export type KycAuditEventView = {
  _id: string;
  event: KycAuditEventType;
  actorUid: string;
  actorEmail: string | null;
  documentId: string | null;
  providerId: string;
  providerType: KycProviderType;
  providerName: string | null;
  /** JSON-encoded event payload; shape varies per event. */
  details: string | null;
  timestamp: string;
};

export type KycProviderDetail = {
  summary: KycProviderSummary;
  documents: KycProviderDocumentView[];
  missingDocumentTypes: KycDocumentType[];
  auditTrail: KycAuditEventView[];
};

const AUDIT_EVENT_FIELDS = `
  _id
  event
  actorUid
  actorEmail
  documentId
  providerId
  providerType
  providerName
  details
  timestamp
`;

const PROVIDER_DETAIL_QUERY = `
  query KycProviderDetail($providerType: KycProviderType!, $providerId: ID!) {
    kycProviderDetail(providerType: $providerType, providerId: $providerId) {
      summary { ${PROVIDER_SUMMARY_FIELDS} }
      documents {
        document {
          _id
          providerId
          providerType
          ownerUid
          documentType
          governmentIdType
          mimeType
          fileSizeBytes
          status
          submittedAt
          expiresAt
          claimedByUid
          claimedAt
          reviewedAt
          reviewedByUid
          rejectionReason
          supersedesDocumentId
          livenessChallenge
          livenessMetadata {
            durationMs
            eyesOpenScore
            yawDegrees
            pitchDegrees
            attemptCount
          }
        }
        required
        reviewedByEmail
        claimedByEmail
        expired
      }
      missingDocumentTypes
      auditTrail { ${AUDIT_EVENT_FIELDS} }
    }
  }
`;

export async function getKycProviderDetail(
  providerType: KycProviderType,
  providerId: string,
) {
  const { kycProviderDetail } = await graphqlFetch<{
    kycProviderDetail: KycProviderDetail;
  }>(PROVIDER_DETAIL_QUERY, { providerType, providerId });
  return kycProviderDetail;
}

// ─── Monitoring: audit trail ──────────────────────────────────────────────

export type KycAuditFilter = {
  event?: KycAuditEventType;
  providerId?: string;
  documentId?: string;
  actorUid?: string;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
};

const AUDIT_LOG_QUERY = `
  query KycAuditLog($filter: KycAuditFilterInput) {
    kycAuditLog(filter: $filter) {
      data { ${AUDIT_EVENT_FIELDS} }
      total
    }
  }
`;

export async function listKycAuditLog(filter: KycAuditFilter) {
  const { kycAuditLog } = await graphqlFetch<{
    kycAuditLog: { data: KycAuditEventView[]; total: number };
  }>(AUDIT_LOG_QUERY, { filter });
  return kycAuditLog;
}

// ─── Monitoring: dashboard KPIs ───────────────────────────────────────────

export type KycMetrics = {
  pendingReview: number;
  claimedForReview: number;
  providersPending: number;
  providersInReview: number;
  providersApproved: number;
  providersRejected: number;
  approvedInPeriod: number;
  rejectedInPeriod: number;
  /** Null when nothing was decided in the window — not zero. */
  avgHoursToDecision: number | null;
  /** 0–1. Null when nothing was decided in the window. */
  rejectionRate: number | null;
  oldestPendingSubmittedAt: string | null;
};

const METRICS_QUERY = `
  query KycMetrics($dateFrom: DateTime, $dateTo: DateTime) {
    kycMetrics(dateFrom: $dateFrom, dateTo: $dateTo) {
      pendingReview
      claimedForReview
      providersPending
      providersInReview
      providersApproved
      providersRejected
      approvedInPeriod
      rejectedInPeriod
      avgHoursToDecision
      rejectionRate
      oldestPendingSubmittedAt
    }
  }
`;

export async function getKycMetrics(dateFrom?: string, dateTo?: string) {
  const { kycMetrics } = await graphqlFetch<{ kycMetrics: KycMetrics }>(
    METRICS_QUERY,
    { dateFrom, dateTo },
  );
  return kycMetrics;
}

const CLAIM_MUTATION = `
  mutation ClaimKycDocumentForReview($documentId: ID!) {
    claimKycDocumentForReview(documentId: $documentId) {
      _id
      status
      claimedByUid
    }
  }
`;

export function claimKycDocument(documentId: string) {
  return graphqlFetch(CLAIM_MUTATION, { documentId });
}

const APPROVE_MUTATION = `
  mutation ApproveKycDocument($documentId: ID!) {
    approveKycDocument(documentId: $documentId) {
      _id
      status
    }
  }
`;

export function approveKycDocument(documentId: string) {
  return graphqlFetch(APPROVE_MUTATION, { documentId });
}

/**
 * Structured reasons: the provider gets consistent, actionable copy and we can
 * answer "what do we reject most" without parsing prose. The optional note is
 * appended to the standard sentence.
 */
export const KYC_REJECTION_REASONS = [
  { code: "BLURRY", label: "Image is blurry or unreadable" },
  { code: "WRONG_DOCUMENT", label: "Wrong document" },
  { code: "INCOMPLETE", label: "Document is incomplete" },
  { code: "DETAILS_MISMATCH", label: "Details do not match the profile" },
  { code: "EXPIRED", label: "Document has expired" },
  { code: "OBSCURED", label: "Required details are obscured" },
  { code: "OTHER", label: "Other (describe below)" },
] as const;

export type KycRejectionReasonCode = (typeof KYC_REJECTION_REASONS)[number]["code"];

const REJECT_MUTATION = `
  mutation RejectKycDocument($documentId: ID!, $reason: KycRejectionReason!, $note: String) {
    rejectKycDocument(documentId: $documentId, reason: $reason, note: $note) {
      _id
      status
      rejectionReason
    }
  }
`;

export function rejectKycDocument(
  documentId: string,
  reason: KycRejectionReasonCode,
  note?: string | null,
) {
  return graphqlFetch(REJECT_MUTATION, { documentId, reason, note: note?.trim() || null });
}

const DOCUMENT_URL_QUERY = `
  query KycDocumentUrl($documentId: ID!) {
    kycDocumentUrl(documentId: $documentId)
  }
`;

/**
 * Short-lived (300s) signed read URL for one document's evidence.
 *
 * Never cache the result: it expires in five minutes, and a stale URL renders
 * as a broken preview. Callers fetch it when the viewer opens and discard it
 * when the viewer closes. Every issuance is written to the KYC audit trail.
 */
export async function getKycDocumentUrl(documentId: string) {
  const { kycDocumentUrl } = await graphqlFetch<{ kycDocumentUrl: string }>(
    DOCUMENT_URL_QUERY,
    { documentId },
  );
  return kycDocumentUrl;
}

const CLAIM_CASE_MUTATION = `
  mutation ClaimKycCase($providerType: KycProviderType!, $providerId: ID!) {
    claimKycCase(providerType: $providerType, providerId: $providerId) {
      summary { providerId verificationStatus claimedByUid claimedByEmail }
    }
  }
`;

/** Take the whole case, so one reviewer holds the entire identity. */
export function claimKycCase(providerType: KycProviderType, providerId: string) {
  return graphqlFetch(CLAIM_CASE_MUTATION, { providerType, providerId });
}

const RELEASE_CASE_MUTATION = `
  mutation ReleaseKycCase($providerType: KycProviderType!, $providerId: ID!) {
    releaseKycCase(providerType: $providerType, providerId: $providerId) {
      summary { providerId verificationStatus claimedByUid claimedByEmail }
    }
  }
`;

export function releaseKycCase(providerType: KycProviderType, providerId: string) {
  return graphqlFetch(RELEASE_CASE_MUTATION, { providerType, providerId });
}

const COMPLETE_CASE_MUTATION = `
  mutation CompleteKycCaseReview(
    $providerType: KycProviderType!
    $providerId: ID!
    $decisions: [KycCaseDecisionInput!]!
  ) {
    completeKycCaseReview(
      providerType: $providerType
      providerId: $providerId
      decisions: $decisions
    ) {
      summary { providerId verificationStatus approvedCount requiredCount }
    }
  }
`;

export type KycCaseDecision = {
  documentId: string;
  approve: boolean;
  reasonCode?: KycRejectionReasonCode | null;
  note?: string | null;
};

/**
 * Apply every decision for a case at once. The provider is notified ONCE with a
 * consolidated result instead of a push per document.
 */
export function completeKycCaseReview(
  providerType: KycProviderType,
  providerId: string,
  decisions: KycCaseDecision[],
) {
  return graphqlFetch(COMPLETE_CASE_MUTATION, { providerType, providerId, decisions });
}
