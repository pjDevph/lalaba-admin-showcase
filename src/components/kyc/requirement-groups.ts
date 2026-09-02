import type { KycDocumentType } from "@/lib/graphql/kyc";

/**
 * Requirements grouped the way a reviewer thinks about them, instead of one
 * flat list of six or seven equal-looking cards.
 *
 * The three business photos in particular are one check ("is this a real
 * laundry?") that happens to be stored as three documents — the backend keeps
 * them separate so one blurry photo can be rejected without invalidating the
 * others, but a reviewer should see them together.
 */
export type RequirementGroup = {
  key: string;
  title: string;
  types: KycDocumentType[];
};

export const MERCHANT_GROUPS: RequirementGroup[] = [
  { key: "owner", title: "Owner / representative", types: ["OWNER_VALID_ID"] },
  {
    key: "registration",
    title: "Business registration",
    types: ["DTI_CERTIFICATE", "BIR_2303", "BUSINESS_PERMIT"],
  },
  {
    key: "photos",
    title: "Business photos",
    types: [
      "BUSINESS_PHOTO_STOREFRONT",
      "BUSINESS_PHOTO_INTERIOR",
      "BUSINESS_PHOTO_MACHINES",
    ],
  },
];

export const WASHER_GROUPS: RequirementGroup[] = [
  { key: "identity", title: "Identity", types: ["VALID_ID", "VALID_ID_BACK", "SELFIE"] },
  {
    key: "address",
    title: "Address",
    types: ["PROOF_OF_ADDRESS", "BARANGAY_CLEARANCE"],
  },
];

export function groupsFor(providerType: string): RequirementGroup[] {
  return providerType === "MERCHANT_BRANCH" ? MERCHANT_GROUPS : WASHER_GROUPS;
}

/** Group a provider's documents, keeping anything unrecognised visible. */
export function groupDocuments<T extends { document: { documentType: string } }>(
  providerType: string,
  documents: T[],
): Array<{ group: RequirementGroup; rows: T[] }> {
  const groups = groupsFor(providerType);
  const used = new Set<T>();
  const result = groups.map((group) => {
    const rows = documents.filter((d) => {
      const match = group.types.includes(d.document.documentType as KycDocumentType);
      if (match) used.add(d);
      return match;
    });
    return { group, rows };
  });

  // Never hide a document just because it predates this grouping.
  const rest = documents.filter((d) => !used.has(d));
  if (rest.length) {
    result.push({
      group: { key: "other", title: "Other documents", types: [] },
      rows: rest,
    });
  }
  return result.filter((g) => g.rows.length > 0);
}
