import { graphqlFetch } from "@/lib/api-client";

/**
 * POPUP CAMPAIGNS.
 *
 * The advertisement half of Promotions, and deliberately separate from promo
 * codes: a campaign decides what a person SEES, a promo code decides what they
 * are financially entitled to. A campaign can advertise a code, but it never
 * calculates money — so a mistake here shows the wrong picture, never charges
 * the wrong price.
 *
 * Hand-maintained mirror of LALABA_BE_DEV/src/campaigns/*.
 */

export type CampaignFrequency =
  | "ONCE_EVER"
  | "EVERY_LOGIN"
  | "EVERY_APP_OPEN"
  | "DAILY"
  | "WEEKLY";

export type CampaignActionType = "NONE" | "PROMO" | "DEEP_LINK";

export type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

/** Plain-language descriptions — an admin picks behaviour, not an enum. */
export const CAMPAIGN_FREQUENCIES: {
  id: CampaignFrequency;
  label: string;
  hint: string;
}[] = [
  { id: "ONCE_EVER", label: "Once only", hint: "Each person sees it a single time, ever." },
  { id: "EVERY_LOGIN", label: "Every sign-in", hint: "Once per sign-in." },
  {
    id: "EVERY_APP_OPEN",
    label: "Every app open",
    hint: "Once per launch, and never more than once every 30 minutes.",
  },
  { id: "DAILY", label: "Once a day", hint: "Resets at midnight, Manila time." },
  { id: "WEEKLY", label: "Once a week", hint: "Resets Monday, Manila time." },
];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
};

/**
 * Audience presets.
 *
 * These write role ids — there is no separate audience vocabulary on the
 * backend. "All partners" is two roles, not a third thing: merchant and washer
 * are distinct roles that happen to share an app, and staff and couriers do
 * NOT inherit their employer's campaigns.
 */
export const CAMPAIGN_AUDIENCES: {
  id: string;
  label: string;
  roleIds: string[];
  hint?: string;
}[] = [
  { id: "customer", label: "Customers", roleIds: ["customer"] },
  { id: "merchant", label: "Merchants", roleIds: ["merchant"] },
  { id: "washer", label: "Home washers", roleIds: ["washer"] },
  {
    id: "partners",
    label: "All partners",
    roleIds: ["merchant", "washer"],
    hint: "Merchants and home washers. Not their staff or couriers.",
  },
];

/**
 * WHAT TAPPING THE ARTWORK DOES.
 *
 * The backend accepts all three for any audience. The apps do not, and the
 * two exclusions below are properties of the app code, not policy:
 *
 * - PROMO only works for customers. The partner app's CampaignPopup
 *   deliberately records the tap and nothing else; only the customer app has
 *   the claim call and a vouchers screen to put the result in. A partner promo
 *   campaign would be a button that silently does nothing.
 * - DEEP_LINK cannot target "All partners". Merchants and home washers are
 *   two separate route stacks inside one binary — `/(tabs)/dashboard` and
 *   `/(washer)/dashboard` — so no single path is valid for both.
 *
 * The form disables the combinations rather than letting an admin publish one
 * and find out from a customer.
 */
export const CAMPAIGN_ACTIONS: {
  id: CampaignActionType;
  label: string;
  hint: string;
  /** Audience preset ids this action can be used with; undefined = any. */
  audiences?: string[];
}[] = [
  {
    id: "NONE",
    label: "Nothing — it just closes",
    hint: "An announcement. Tapping the image records the tap and dismisses it.",
  },
  {
    id: "PROMO",
    label: "Save a voucher to their account",
    hint: "The code lands in their vouchers, ready at checkout. Customers only — the partner app cannot claim vouchers yet.",
    audiences: ["customer"],
  },
  {
    id: "DEEP_LINK",
    label: "Open a screen in the app",
    hint: "Takes them straight to the screen the campaign is about.",
    audiences: ["customer", "merchant", "washer"],
  },
];

/**
 * Where a campaign may send someone, per audience.
 *
 * A hand-kept list rather than a free-text field: the app calls `router.push`
 * with whatever is stored, and a mistyped route is a dead tap that only shows
 * up in production. Paths mirror the expo-router files in
 * LALABA_CUSTOMER_APP_DEV/app and LALABA_MERCHANT_APP_DEV/app; screens taking
 * an id parameter are excluded, since a campaign has no id to give them.
 */
export const CAMPAIGN_DESTINATIONS: Record<
  string,
  { path: string; label: string }[]
> = {
  customer: [
    { path: "/(tabs)", label: "Home" },
    { path: "/search", label: "Browse laundry shops" },
    { path: "/favorites", label: "Saved shops" },
    { path: "/vouchers", label: "My vouchers" },
    { path: "/(tabs)/orders", label: "My orders" },
    { path: "/settings/support", label: "Help & support" },
  ],
  merchant: [
    { path: "/(tabs)/dashboard", label: "Dashboard" },
    { path: "/(tabs)/online-orders", label: "Online orders" },
    { path: "/(tabs)/services", label: "Services" },
    { path: "/(tabs)/wallet", label: "Wallet" },
    { path: "/(tabs)/booking-availability", label: "Booking & availability" },
    { path: "/(tabs)/settings", label: "Settings" },
  ],
  washer: [
    { path: "/(washer)/dashboard", label: "Dashboard" },
    { path: "/(washer)/orders", label: "Orders" },
    { path: "/(washer)/services", label: "Services" },
    { path: "/(washer)/fee-balance", label: "Fee balance" },
    { path: "/(washer)/certification", label: "Certification" },
    { path: "/(washer)/settings", label: "Settings" },
  ],
};

/** Reads as the end of "Tapping the artwork …", for the preview. */
export const CAMPAIGN_ACTION_EFFECTS: Record<CampaignActionType, string> = {
  NONE: "just closes it",
  PROMO: "saves the voucher to their account",
  DEEP_LINK: "opens a screen in the app",
};

/** Short label for the campaigns table. */
export const CAMPAIGN_ACTION_LABELS: Record<CampaignActionType, string> = {
  NONE: "None",
  PROMO: "Saves a voucher",
  DEEP_LINK: "Opens a screen",
};

export type Campaign = {
  _id: string;
  name: string;
  targetRoleIds: string[];
  imageUrl: string;
  imagePath: string | null;
  altText: string | null;
  frequency: CampaignFrequency;
  actionType: CampaignActionType;
  promoId: string | null;
  deepLink: string | null;
  startsAt: string;
  endsAt: string | null;
  priority: number;
  status: CampaignStatus;
  createdByUid: string;
  createdByName: string;
  createdAt: string | null;
  updatedAt: string | null;
};

const CAMPAIGN_FIELDS = `
  _id
  name
  targetRoleIds
  imageUrl
  imagePath
  altText
  frequency
  actionType
  promoId
  deepLink
  startsAt
  endsAt
  priority
  status
  createdByUid
  createdByName
  createdAt
  updatedAt
`;

export async function listCampaigns() {
  const { campaigns } = await graphqlFetch<{ campaigns: Campaign[] }>(
    `query Campaigns { campaigns { ${CAMPAIGN_FIELDS} } }`,
  );
  return campaigns;
}

export type CampaignInput = {
  name: string;
  targetRoleIds: string[];
  imageUrl: string;
  imagePath?: string;
  altText?: string;
  frequency: CampaignFrequency;
  actionType?: CampaignActionType;
  promoId?: string;
  deepLink?: string;
  startsAt: string;
  endsAt?: string;
  priority?: number;
  status?: CampaignStatus;
};

export async function createCampaign(input: CampaignInput) {
  const { createCampaign } = await graphqlFetch<{ createCampaign: Campaign }>(
    `mutation CreateCampaign($input: CreateCampaignInput!) {
       createCampaign(input: $input) { ${CAMPAIGN_FIELDS} }
     }`,
    { input },
  );
  return createCampaign;
}

export async function updateCampaign(id: string, input: Partial<CampaignInput>) {
  const { updateCampaign } = await graphqlFetch<{ updateCampaign: Campaign }>(
    `mutation UpdateCampaign($id: ID!, $input: UpdateCampaignInput!) {
       updateCampaign(id: $id, input: $input) { ${CAMPAIGN_FIELDS} }
     }`,
    { id, input },
  );
  return updateCampaign;
}
