import { StatusBadge } from "@/components/ui/status-badge";
import { DOCUMENT_STATUS, VERIFICATION_STATUS } from "@/lib/status";
import type { KycDocumentStatus, KycVerificationStatus } from "@/lib/graphql/kyc";

// Thin wrappers over StatusBadge, kept so KYC call sites read in KYC's own
// vocabulary. The labels and colours themselves now live in lib/status.ts
// with every other status in the platform — this file used to own its own
// variant maps, which is how "approved" ended up meaning one colour here and
// another on the Merchants page.

export function VerificationStatusBadge({
  status,
}: {
  status: KycVerificationStatus;
}) {
  return <StatusBadge status={status} registry={VERIFICATION_STATUS} />;
}

export function DocumentStatusBadge({
  status,
  expired,
}: {
  status: KycDocumentStatus;
  /** An approved-but-expired document does not satisfy its requirement. */
  expired?: boolean;
}) {
  if (expired && status === "APPROVED") {
    // Deliberately not the APPROVED tone: an expired document is a gap in the
    // provider's file, and it must scan as one.
    return (
      <StatusBadge
        status="REJECTED"
        registry={DOCUMENT_STATUS}
        label="Approved · expired"
      />
    );
  }
  return <StatusBadge status={status} registry={DOCUMENT_STATUS} />;
}
