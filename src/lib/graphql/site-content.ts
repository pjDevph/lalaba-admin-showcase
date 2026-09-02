import { graphqlFetch } from "@/lib/api-client";

/**
 * Marketing website CMS. Reads/writes LALABA_BE_DEV/src/site-content — the
 * ONLY editable surface for lalaba-website's FAQ, service areas and promo
 * banners, which are otherwise hardcoded content/*.ts files in that repo.
 * The site itself never calls this GraphQL API; it reads the same data
 * through a separate unauthenticated REST endpoint (see the backend
 * module's own doc comment for why).
 */

// Wire values are the backend TS enum's MEMBER NAMES (GraphQL enum
// serialization), not the display strings the enum members hold — e.g.
// FaqCategory.GENERAL_AND_CUSTOMER = 'General & Customer' server-side, but
// "GENERAL_AND_CUSTOMER" is what actually crosses the wire in both
// directions. Caught live: sending the display string 400'd with "does not
// exist in FaqCategory enum".
export type FaqCategory = "GENERAL_AND_CUSTOMER" | "PARTNERS";

export const FAQ_CATEGORIES: { id: FaqCategory; label: string }[] = [
  { id: "GENERAL_AND_CUSTOMER", label: "General & Customer" },
  { id: "PARTNERS", label: "Partners" },
];

export type FaqEntry = {
  _id: string;
  category: FaqCategory;
  question: string;
  answer: string;
  order: number;
  isPublished: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

const FAQ_FIELDS = `_id category question answer order isPublished createdAt updatedAt`;

export async function listFaqEntries() {
  const { siteFaqEntries } = await graphqlFetch<{ siteFaqEntries: FaqEntry[] }>(
    `query { siteFaqEntries { ${FAQ_FIELDS} } }`,
  );
  return siteFaqEntries;
}

export type CreateFaqEntryInput = {
  category: FaqCategory;
  question: string;
  answer: string;
  order?: number;
};

export type UpdateFaqEntryInput = Partial<CreateFaqEntryInput> & {
  isPublished?: boolean;
};

export async function createFaqEntry(input: CreateFaqEntryInput) {
  const { createSiteFaqEntry } = await graphqlFetch<{ createSiteFaqEntry: FaqEntry }>(
    `mutation($input: CreateFaqEntryInput!) { createSiteFaqEntry(input: $input) { ${FAQ_FIELDS} } }`,
    { input },
  );
  return createSiteFaqEntry;
}

export async function updateFaqEntry(id: string, input: UpdateFaqEntryInput) {
  const { updateSiteFaqEntry } = await graphqlFetch<{ updateSiteFaqEntry: FaqEntry }>(
    `mutation($id: ID!, $input: UpdateFaqEntryInput!) { updateSiteFaqEntry(id: $id, input: $input) { ${FAQ_FIELDS} } }`,
    { id, input },
  );
  return updateSiteFaqEntry;
}

export function deleteFaqEntry(id: string) {
  return graphqlFetch(`mutation($id: ID!) { deleteSiteFaqEntry(id: $id) }`, { id });
}

export type ServiceArea = {
  _id: string;
  name: string;
  order: number;
  isPublished: boolean;
};

const AREA_FIELDS = `_id name order isPublished`;

export async function listServiceAreas() {
  const { siteServiceAreas } = await graphqlFetch<{ siteServiceAreas: ServiceArea[] }>(
    `query { siteServiceAreas { ${AREA_FIELDS} } }`,
  );
  return siteServiceAreas;
}

export type CreateServiceAreaInput = { name: string; order?: number };
export type UpdateServiceAreaInput = Partial<CreateServiceAreaInput> & {
  isPublished?: boolean;
};

export async function createServiceArea(input: CreateServiceAreaInput) {
  const { createSiteServiceArea } = await graphqlFetch<{
    createSiteServiceArea: ServiceArea;
  }>(
    `mutation($input: CreateServiceAreaInput!) { createSiteServiceArea(input: $input) { ${AREA_FIELDS} } }`,
    { input },
  );
  return createSiteServiceArea;
}

export async function updateServiceArea(id: string, input: UpdateServiceAreaInput) {
  const { updateSiteServiceArea } = await graphqlFetch<{
    updateSiteServiceArea: ServiceArea;
  }>(
    `mutation($id: ID!, $input: UpdateServiceAreaInput!) { updateSiteServiceArea(id: $id, input: $input) { ${AREA_FIELDS} } }`,
    { id, input },
  );
  return updateSiteServiceArea;
}

export function deleteServiceArea(id: string) {
  return graphqlFetch(`mutation($id: ID!) { deleteSiteServiceArea(id: $id) }`, { id });
}

// Wire values are the backend enum's member names, same caveat as
// FaqCategory above — CUSTOMER/LAUNDROMAT/HOME_WASHER/ALL, not the lowercase
// display-ish strings the enum members hold.
export type AnnouncementAudience = "CUSTOMER" | "LAUNDROMAT" | "HOME_WASHER" | "ALL";

export const ANNOUNCEMENT_AUDIENCES: { id: AnnouncementAudience; label: string }[] = [
  { id: "ALL", label: "Everyone" },
  { id: "CUSTOMER", label: "Customers" },
  { id: "LAUNDROMAT", label: "Laundromats" },
  { id: "HOME_WASHER", label: "Home washers" },
];

export type SiteAnnouncement = {
  _id: string;
  audience: AnnouncementAudience;
  eyebrow: string;
  title: string;
  description: string;
  promoCode: string | null;
  validityText: string | null;
  ctaText: string;
  ctaUrl: string;
  image: string | null;
  order: number;
  isPublished: boolean;
};

const ANNOUNCEMENT_FIELDS = `_id audience eyebrow title description promoCode validityText ctaText ctaUrl image order isPublished`;

export async function listAnnouncements() {
  const { siteAnnouncements } = await graphqlFetch<{
    siteAnnouncements: SiteAnnouncement[];
  }>(`query { siteAnnouncements { ${ANNOUNCEMENT_FIELDS} } }`);
  return siteAnnouncements;
}

export type CreateAnnouncementInput = {
  audience?: AnnouncementAudience;
  eyebrow: string;
  title: string;
  description: string;
  promoCode?: string;
  validityText?: string;
  ctaText: string;
  ctaUrl: string;
  image?: string;
  order?: number;
};

export type UpdateAnnouncementInput = Partial<CreateAnnouncementInput> & {
  isPublished?: boolean;
};

export async function createAnnouncement(input: CreateAnnouncementInput) {
  const { createSiteAnnouncement } = await graphqlFetch<{
    createSiteAnnouncement: SiteAnnouncement;
  }>(
    `mutation($input: CreateSiteAnnouncementInput!) { createSiteAnnouncement(input: $input) { ${ANNOUNCEMENT_FIELDS} } }`,
    { input },
  );
  return createSiteAnnouncement;
}

export async function updateAnnouncement(id: string, input: UpdateAnnouncementInput) {
  const { updateSiteAnnouncement } = await graphqlFetch<{
    updateSiteAnnouncement: SiteAnnouncement;
  }>(
    `mutation($id: ID!, $input: UpdateSiteAnnouncementInput!) { updateSiteAnnouncement(id: $id, input: $input) { ${ANNOUNCEMENT_FIELDS} } }`,
    { id, input },
  );
  return updateSiteAnnouncement;
}

export function deleteAnnouncement(id: string) {
  return graphqlFetch(`mutation($id: ID!) { deleteSiteAnnouncement(id: $id) }`, { id });
}
