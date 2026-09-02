import { graphqlFetch } from "@/lib/api-client";

// The platform catalog of home-washer services. Lalaba controls WHICH services
// exist, WHICH charging methods each allows, and the safety limits around the
// amount; the washer sets the amount itself, per service, in the partner app
// (LALABA_BE_DEV/src/washer-service-offerings).
//
// A service can also be priced by the platform outright — see
// pricingControl: "PLATFORM_FIXED" below, which is how every service behaved
// before per-washer pricing existed.

// Who decides what a washer charges. Home washers don't share a cost
// structure, so the platform defines which services exist and how they may be
// charged, and the washer sets the amount.
export type WasherPricingControl = "PLATFORM_FIXED" | "WASHER_SET";

// The charging methods a washer may pick from for a service.
export type WasherPricingModel =
  | "PER_KG"
  | "PER_LOAD"
  | "BASE_EXCESS"
  | "PER_ITEM";

// What a PER_ITEM service counts. Platform-controlled, not free text — see the
// enum of the same name in the backend template schema.
export type WasherServiceUnit = "PIECE" | "PAIR" | "SET" | "PANEL";

export const SERVICE_UNIT_LABELS: Record<WasherServiceUnit, string> = {
  PIECE: "Piece",
  PAIR: "Pair",
  SET: "Set",
  PANEL: "Panel",
};

export const ALL_SERVICE_UNITS: WasherServiceUnit[] = [
  "PIECE",
  "PAIR",
  "SET",
  "PANEL",
];

export const PRICING_MODEL_LABELS: Record<WasherPricingModel, string> = {
  PER_KG: "Per kilogram",
  PER_LOAD: "Per load",
  BASE_EXCESS: "Base + excess",
  PER_ITEM: "Per item",
};

/**
 * The default allow-list for a new template — deliberately NOT every model.
 * Per-item is opt-in; see the matching constant in the backend schema for why
 * adding it here would retroactively change every existing template.
 */
export const ALL_PRICING_MODELS: WasherPricingModel[] = [
  "PER_KG",
  "PER_LOAD",
  "BASE_EXCESS",
];

/** Every model, for the admin pickers that must offer the full set. */
export const EVERY_PRICING_MODEL: WasherPricingModel[] = [
  ...ALL_PRICING_MODELS,
  "PER_ITEM",
];

export type WasherServiceTemplate = {
  _id: string;
  name: string;
  description: string | null;
  pricingControl: WasherPricingControl;
  allowedPricingModels: WasherPricingModel[];
  /** Broad safety limits on the washer's headline amount. Null = unbounded. */
  minPriceCentavos: number | null;
  maxPriceCentavos: number | null;
  /** How Lalaba's own numbers are charged, under PLATFORM_FIXED. */
  platformPricingModel: WasherPricingModel;
  /** Integer centavos, matching the rest of the system's money handling. */
  basePriceCentavos: number;
  baseWeightKg: number;
  excessRatePerKgCentavos: number;
  platformLoadCapacityKg: number | null;
  platformUnit: WasherServiceUnit | null;
  platformMinBillableKg: number | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type WasherServiceTemplateInput = {
  name: string;
  description?: string | null;
  pricingControl: WasherPricingControl;
  allowedPricingModels: WasherPricingModel[];
  minPriceCentavos?: number | null;
  maxPriceCentavos?: number | null;
  platformPricingModel: WasherPricingModel;
  // Still required under WASHER_SET: these are the fallback a washer is priced
  // at until she sets her own, which is what keeps existing washers unchanged.
  basePriceCentavos: number;
  baseWeightKg: number;
  excessRatePerKgCentavos: number;
  platformLoadCapacityKg?: number | null;
  platformUnit?: WasherServiceUnit | null;
  platformMinBillableKg?: number | null;
};

const TEMPLATE_FIELDS = `
  _id
  name
  description
  pricingControl
  allowedPricingModels
  minPriceCentavos
  maxPriceCentavos
  platformPricingModel
  basePriceCentavos
  baseWeightKg
  excessRatePerKgCentavos
  platformLoadCapacityKg
  platformUnit
  platformMinBillableKg
  isActive
  createdAt
  updatedAt
`;

// Admin-only: includes deactivated templates. The washer app calls
// `availableWasherServiceTemplates`, which returns the active ones only.
const LIST_QUERY = `
  query AllWasherServiceTemplates {
    allWasherServiceTemplates { ${TEMPLATE_FIELDS} }
  }
`;

export async function listWasherServiceTemplates() {
  const { allWasherServiceTemplates } = await graphqlFetch<{
    allWasherServiceTemplates: WasherServiceTemplate[];
  }>(LIST_QUERY);
  return allWasherServiceTemplates;
}

const CREATE_MUTATION = `
  mutation CreateWasherServiceTemplate($input: CreateWasherServiceTemplateInput!) {
    createWasherServiceTemplate(input: $input) { ${TEMPLATE_FIELDS} }
  }
`;

export async function createWasherServiceTemplate(
  input: WasherServiceTemplateInput,
) {
  const { createWasherServiceTemplate } = await graphqlFetch<{
    createWasherServiceTemplate: WasherServiceTemplate;
  }>(CREATE_MUTATION, { input });
  return createWasherServiceTemplate;
}

const UPDATE_MUTATION = `
  mutation UpdateWasherServiceTemplate($id: ID!, $input: UpdateWasherServiceTemplateInput!) {
    updateWasherServiceTemplate(id: $id, input: $input) { ${TEMPLATE_FIELDS} }
  }
`;

export async function updateWasherServiceTemplate(
  id: string,
  input: WasherServiceTemplateInput,
) {
  const { updateWasherServiceTemplate } = await graphqlFetch<{
    updateWasherServiceTemplate: WasherServiceTemplate;
  }>(UPDATE_MUTATION, { id, input });
  return updateWasherServiceTemplate;
}

const SET_ACTIVE_MUTATION = `
  mutation SetWasherServiceTemplateActive($id: ID!, $isActive: Boolean!) {
    setWasherServiceTemplateActive(id: $id, isActive: $isActive) { ${TEMPLATE_FIELDS} }
  }
`;

export async function setWasherServiceTemplateActive(
  id: string,
  isActive: boolean,
) {
  const { setWasherServiceTemplateActive } = await graphqlFetch<{
    setWasherServiceTemplateActive: WasherServiceTemplate;
  }>(SET_ACTIVE_MUTATION, { id, isActive });
  return setWasherServiceTemplateActive;
}

// ─── Money helpers ──────────────────────────────────────────────────────────
// Admins think in pesos; the API speaks integer centavos. Converting at this
// boundary keeps the rounding in one place instead of in every field handler.

export function centavosToPesoInput(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

/** NaN for anything that isn't a usable peso amount — callers validate. */
export function pesoInputToCentavos(peso: string): number {
  const parsed = Number.parseFloat(peso);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.round(parsed * 100);
}

/**
 * How Lalaba's own price reads, in whichever method the template declares.
 *
 * A platform-priced template used to be base + excess by definition, so its
 * summary could be hardcoded. Now that it can be per-load or per-item, reading
 * the three base+excess columns regardless would describe a ₱250-per-load
 * service as "₱250 up to 0 kg, +₱0/kg after".
 */
export function describePlatformPricing(
  t: Pick<
    WasherServiceTemplate,
    | "platformPricingModel"
    | "basePriceCentavos"
    | "baseWeightKg"
    | "excessRatePerKgCentavos"
    | "platformLoadCapacityKg"
    | "platformUnit"
    | "platformMinBillableKg"
  >,
): { headline: string; detail: string } {
  const price = formatPeso(t.basePriceCentavos);
  switch (t.platformPricingModel) {
    case "PER_KG":
      return {
        headline: `${price}/kg`,
        detail: t.platformMinBillableKg
          ? `min ${t.platformMinBillableKg} kg`
          : "any weight",
      };
    case "PER_LOAD":
      return {
        headline: `${price}/load`,
        detail: `up to ${t.platformLoadCapacityKg ?? "?"} kg per load`,
      };
    case "PER_ITEM":
      return {
        headline: `${price}/${(t.platformUnit ?? "PIECE").toLowerCase()}`,
        detail: "counted, not weighed",
      };
    case "BASE_EXCESS":
    default:
      return {
        headline: `${price} up to ${t.baseWeightKg} kg`,
        detail: `+ ${formatPeso(t.excessRatePerKgCentavos)}/kg after`,
      };
  }
}

export function formatPeso(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
