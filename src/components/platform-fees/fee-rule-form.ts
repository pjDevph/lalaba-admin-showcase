import {
  centavosToPesoInput,
  pesoInputToCentavos,
  type FeeBasis,
  type FeeCalculationType,
  type FeeCategory,
  type FeeChargedTo,
  type FeeDeductionSource,
  type FeePayerRole,
  type FeeTaxTreatment,
  type PlatformFeeRule,
  type PlatformFeeRuleInput,
} from "@/lib/graphql/platform-fees";

/**
 * The edit form's state, and the conversion to and from the API shape.
 *
 * Split out of the component because it is the part worth reading on its own:
 * every money field is held as a STRING while editing (so a half-typed "12."
 * isn't coerced mid-keystroke), blank means "no limit" rather than zero, and
 * the same validation the backend enforces runs here first so the admin gets
 * the message next to the field instead of as a failed mutation.
 */
export type FeeRuleFormState = {
  name: string;
  description: string;
  appliesTo: FeePayerRole;
  category: FeeCategory;
  calculationType: FeeCalculationType;
  percent: string;
  fixedAmountPeso: string;
  basis: FeeBasis;
  minFeePeso: string;
  maxFeePeso: string;
  chargedTo: FeeChargedTo;
  customerSharePercent: string;
  providerSharePercent: string;
  deductFrom: FeeDeductionSource;
  taxTreatment: FeeTaxTreatment;
  applyVat: boolean;
  vatRatePercent: string;
  stackable: boolean;
  isActive: boolean;
  /** 'YYYY-MM-DD', the value a native date input speaks. */
  effectiveFrom: string;
  effectiveUntil: string;
  changeReason: string;
};

/** Today in the browser's timezone as 'YYYY-MM-DD'. */
export function todayDateInput(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function dateInputFrom(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function emptyForm(): FeeRuleFormState {
  return {
    name: "",
    description: "",
    appliesTo: "HOME_WASHER",
    category: "COMMISSION",
    calculationType: "PERCENTAGE",
    percent: "",
    fixedAmountPeso: "",
    basis: "SERVICE_SUBTOTAL",
    minFeePeso: "",
    maxFeePeso: "",
    chargedTo: "CUSTOMER",
    customerSharePercent: "",
    providerSharePercent: "",
    deductFrom: "NOT_DEDUCTED",
    taxTreatment: "TAX_INCLUSIVE",
    applyVat: false,
    vatRatePercent: "",
    stackable: true,
    isActive: true,
    effectiveFrom: todayDateInput(),
    effectiveUntil: "",
    changeReason: "",
  };
}

export function formFromRule(rule: PlatformFeeRule): FeeRuleFormState {
  return {
    name: rule.name,
    description: rule.description ?? "",
    appliesTo: rule.appliesTo,
    category: rule.category,
    calculationType: rule.calculationType,
    percent: rule.percent == null ? "" : String(rule.percent),
    fixedAmountPeso:
      rule.fixedAmountCentavos == null
        ? ""
        : centavosToPesoInput(rule.fixedAmountCentavos),
    basis: rule.basis,
    minFeePeso:
      rule.minFeeCentavos == null ? "" : centavosToPesoInput(rule.minFeeCentavos),
    maxFeePeso:
      rule.maxFeeCentavos == null ? "" : centavosToPesoInput(rule.maxFeeCentavos),
    chargedTo: rule.chargedTo,
    customerSharePercent:
      rule.customerSharePercent == null ? "" : String(rule.customerSharePercent),
    providerSharePercent:
      rule.providerSharePercent == null ? "" : String(rule.providerSharePercent),
    deductFrom: rule.deductFrom,
    taxTreatment: rule.taxTreatment,
    applyVat: rule.applyVat,
    vatRatePercent:
      rule.vatRatePercent == null ? "" : String(rule.vatRatePercent),
    stackable: rule.stackable,
    isActive: rule.isActive,
    effectiveFrom: dateInputFrom(rule.effectiveFrom),
    effectiveUntil: dateInputFrom(rule.effectiveUntil),
    // Deliberately NOT carried over: the reason belongs to the version that
    // was published, and prefilling it would let last quarter's justification
    // be silently reused for this quarter's rate change.
    changeReason: "",
  };
}

const usesPercent = (t: FeeCalculationType) => t !== "FIXED";
const usesFixed = (t: FeeCalculationType) => t !== "PERCENTAGE";

/** Blank -> null (no limit). NaN signals an unparseable entry. */
function optionalCentavos(peso: string): number | null {
  if (!peso.trim()) return null;
  return pesoInputToCentavos(peso);
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Client-side validation mirroring platform-fee-rule.util.ts. Duplicated
 * deliberately rather than round-tripping every keystroke: the backend stays
 * the authority (it rejects the same cases), this just puts the message where
 * the admin is looking.
 *
 * Returns a field-keyed map so each message renders under its own input.
 */
export function validateForm(
  form: FeeRuleFormState,
): Partial<Record<keyof FeeRuleFormState, string>> {
  const errors: Partial<Record<keyof FeeRuleFormState, string>> = {};

  if (!form.name.trim()) errors.name = "Give the fee a name.";

  if (usesPercent(form.calculationType)) {
    const pct = Number.parseFloat(form.percent);
    if (!Number.isFinite(pct) || pct <= 0) {
      errors.percent = "Enter a percentage greater than 0.";
    } else if (pct > 100) {
      errors.percent = "Percentage cannot exceed 100%.";
    }
  }

  if (usesFixed(form.calculationType)) {
    const amount = pesoInputToCentavos(form.fixedAmountPeso);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.fixedAmountPeso = "Enter an amount greater than ₱0.";
    }
  }

  const min = optionalCentavos(form.minFeePeso);
  const max = optionalCentavos(form.maxFeePeso);
  if (min != null && !Number.isFinite(min)) {
    errors.minFeePeso = "Enter a peso amount, or leave blank for no minimum.";
  }
  if (max != null && !Number.isFinite(max)) {
    errors.maxFeePeso = "Enter a peso amount, or leave blank for no maximum.";
  }
  if (
    min != null &&
    max != null &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    max < min
  ) {
    errors.maxFeePeso = "Maximum fee must be greater than the minimum fee.";
  }

  if (form.chargedTo === "SPLIT") {
    const customer = optionalNumber(form.customerSharePercent);
    const provider = optionalNumber(form.providerSharePercent);
    if (customer == null || !Number.isFinite(customer)) {
      errors.customerSharePercent = "Enter the customer's share.";
    }
    if (provider == null || !Number.isFinite(provider)) {
      errors.providerSharePercent = "Enter the provider's share.";
    }
    if (
      customer != null &&
      provider != null &&
      Number.isFinite(customer) &&
      Number.isFinite(provider) &&
      Math.round(customer + provider) !== 100
    ) {
      errors.providerSharePercent = `Allocation must total 100% — currently ${Math.round(customer + provider)}%.`;
    }
  }

  if (form.applyVat) {
    const rate = Number.parseFloat(form.vatRatePercent);
    if (!Number.isFinite(rate) || rate <= 0) {
      errors.vatRatePercent = "Enter the VAT rate.";
    }
  }

  if (!form.effectiveFrom) {
    errors.effectiveFrom = "Choose when this takes effect.";
  } else if (form.effectiveUntil && form.effectiveUntil <= form.effectiveFrom) {
    errors.effectiveUntil = "The end date must be after the start date.";
  }

  return errors;
}

/**
 * Form -> API input. Fields that don't apply to the chosen calculation type or
 * allocation are sent as null rather than left over, because the backend
 * rejects a stale percentage on a fixed-amount rule — a leftover value reads,
 * in the history, as though it were still in force.
 */
export function inputFromForm(form: FeeRuleFormState): PlatformFeeRuleInput {
  const percentUsed = usesPercent(form.calculationType);
  const fixedUsed = usesFixed(form.calculationType);
  const split = form.chargedTo === "SPLIT";

  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    appliesTo: form.appliesTo,
    category: form.category,
    calculationType: form.calculationType,
    percent: percentUsed ? Number.parseFloat(form.percent) : null,
    fixedAmountCentavos: fixedUsed
      ? pesoInputToCentavos(form.fixedAmountPeso)
      : null,
    basis: form.basis,
    minFeeCentavos: optionalCentavos(form.minFeePeso),
    maxFeeCentavos: optionalCentavos(form.maxFeePeso),
    chargedTo: form.chargedTo,
    customerSharePercent: split
      ? Number.parseFloat(form.customerSharePercent)
      : null,
    providerSharePercent: split
      ? Number.parseFloat(form.providerSharePercent)
      : null,
    deductFrom: form.deductFrom,
    taxTreatment: form.taxTreatment,
    applyVat: form.applyVat,
    vatRatePercent: form.applyVat
      ? Number.parseFloat(form.vatRatePercent)
      : null,
    stackable: form.stackable,
    isActive: form.isActive,
    // Midnight local on the chosen day, sent as an instant.
    effectiveFrom: new Date(`${form.effectiveFrom}T00:00:00`).toISOString(),
    effectiveUntil: form.effectiveUntil
      ? new Date(`${form.effectiveUntil}T00:00:00`).toISOString()
      : null,
    changeReason: form.changeReason.trim() || null,
  };
}

/** One human-readable line per field that differs — the review-changes list. */
export function diffRuleAgainstForm(
  rule: PlatformFeeRule,
  form: FeeRuleFormState,
): { label: string; before: string; after: string }[] {
  const before = formFromRule(rule);
  const fields: { key: keyof FeeRuleFormState; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "calculationType", label: "Calculation" },
    { key: "percent", label: "Percentage" },
    { key: "fixedAmountPeso", label: "Amount" },
    { key: "basis", label: "Calculated from" },
    { key: "minFeePeso", label: "Minimum fee" },
    { key: "maxFeePeso", label: "Maximum fee" },
    { key: "chargedTo", label: "Charged to" },
    { key: "customerSharePercent", label: "Customer share" },
    { key: "providerSharePercent", label: "Provider share" },
    { key: "deductFrom", label: "Deducted from" },
    { key: "taxTreatment", label: "Tax treatment" },
    { key: "applyVat", label: "Apply VAT" },
    { key: "vatRatePercent", label: "VAT rate" },
    { key: "stackable", label: "Combines with other fees" },
    { key: "isActive", label: "Status" },
    { key: "effectiveFrom", label: "Starts" },
    { key: "effectiveUntil", label: "Ends" },
  ];

  return fields
    .filter((f) => String(before[f.key]) !== String(form[f.key]))
    .map((f) => ({
      label: f.label,
      before: displayValue(before[f.key]),
      after: displayValue(form[f.key]),
    }));
}

function displayValue(value: string | boolean): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value.trim() === "" ? "—" : value;
}
