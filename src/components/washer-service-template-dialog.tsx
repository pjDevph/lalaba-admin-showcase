"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  ALL_PRICING_MODELS,
  ALL_SERVICE_UNITS,
  centavosToPesoInput,
  EVERY_PRICING_MODEL,
  formatPeso,
  PRICING_MODEL_LABELS,
  pesoInputToCentavos,
  SERVICE_UNIT_LABELS,
  type WasherPricingControl,
  type WasherPricingModel,
  type WasherServiceTemplate,
  type WasherServiceTemplateInput,
  type WasherServiceUnit,
} from "@/lib/graphql/washer-service-templates";

// Prices are entered in pesos and sent in centavos — see the converters in
// lib/graphql/washer-service-templates.ts. Everything is held as strings while
// editing so a half-typed "12." doesn't get coerced to a number mid-keystroke.
type FormState = {
  name: string;
  description: string;
  pricingControl: WasherPricingControl;
  allowedPricingModels: WasherPricingModel[];
  minPricePeso: string;
  maxPricePeso: string;
  platformPricingModel: WasherPricingModel;
  basePricePeso: string;
  baseWeightKg: string;
  excessRatePerKgPeso: string;
  platformLoadCapacityKg: string;
  platformUnit: WasherServiceUnit;
  platformMinBillableKg: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  pricingControl: "WASHER_SET",
  allowedPricingModels: [...ALL_PRICING_MODELS],
  minPricePeso: "",
  maxPricePeso: "",
  // Base + excess is what a platform-priced service has always been; keeping
  // it the default means opening an existing template shows what it already is.
  platformPricingModel: "BASE_EXCESS",
  basePricePeso: "",
  baseWeightKg: "",
  excessRatePerKgPeso: "",
  platformLoadCapacityKg: "",
  platformUnit: "PIECE",
  platformMinBillableKg: "",
};

const MODEL_HINTS: Record<WasherPricingModel, string> = {
  PER_KG: "₱X per kilo, with an optional minimum weight",
  PER_LOAD: "₱X per machine load — the washer sets her own load capacity",
  BASE_EXCESS: "₱X covers the first N kg, then ₱Y per extra kg",
  PER_ITEM:
    "₱X per counted item — for comforters, curtains and shoes, which have no sensible price per kilo",
};

/** The headline amount's label, which is a different number in each model. */
const PRICE_LABELS: Record<WasherPricingModel, string> = {
  PER_KG: "Price per kilo (₱)",
  PER_LOAD: "Price per load (₱)",
  BASE_EXCESS: "Base price (₱)",
  PER_ITEM: "Price per item (₱)",
};

function formFromTemplate(template: WasherServiceTemplate): FormState {
  return {
    name: template.name,
    description: template.description ?? "",
    pricingControl: template.pricingControl,
    allowedPricingModels: template.allowedPricingModels?.length
      ? [...template.allowedPricingModels]
      : [...ALL_PRICING_MODELS],
    minPricePeso:
      template.minPriceCentavos == null
        ? ""
        : centavosToPesoInput(template.minPriceCentavos),
    maxPricePeso:
      template.maxPriceCentavos == null
        ? ""
        : centavosToPesoInput(template.maxPriceCentavos),
    // Templates saved before the field existed come back null — fall back to
    // BASE_EXCESS, which is what they were priced as.
    platformPricingModel: template.platformPricingModel ?? "BASE_EXCESS",
    basePricePeso: centavosToPesoInput(template.basePriceCentavos),
    baseWeightKg: String(template.baseWeightKg),
    excessRatePerKgPeso: centavosToPesoInput(template.excessRatePerKgCentavos),
    platformLoadCapacityKg:
      template.platformLoadCapacityKg == null
        ? ""
        : String(template.platformLoadCapacityKg),
    platformUnit: template.platformUnit ?? "PIECE",
    platformMinBillableKg:
      template.platformMinBillableKg == null
        ? ""
        : String(template.platformMinBillableKg),
  };
}

/** Blank means "no limit" — only a filled-in field has to parse. */
function optionalCentavos(peso: string): number | null | undefined {
  if (!peso.trim()) return null;
  const value = pesoInputToCentavos(peso);
  return Number.isFinite(value) ? value : undefined; // undefined = unparseable
}

/** Null when valid; otherwise the message to show. */
function validate(form: FormState): string | null {
  if (!form.name.trim()) return "Give the service a name.";

  if (form.pricingControl === "WASHER_SET") {
    if (form.allowedPricingModels.length === 0) {
      return "Allow at least one charging method, or switch to a platform-set price.";
    }
    const min = optionalCentavos(form.minPricePeso);
    const max = optionalCentavos(form.maxPricePeso);
    if (min === undefined) return "Minimum price must be a peso amount, or blank for no limit.";
    if (max === undefined) return "Maximum price must be a peso amount, or blank for no limit.";
    if (min != null && max != null && min > max) {
      return "The minimum price cannot be higher than the maximum price.";
    }
  }

  const base = pesoInputToCentavos(form.basePricePeso);
  if (!Number.isFinite(base) || base < 0) {
    return `${PRICE_LABELS[platformModelOf(form)]} must be a peso amount of 0 or more.`;
  }

  // The base+excess trio stays required under WASHER_SET whatever method is
  // ticked: it is the fallback every washer is priced at until she sets her
  // own, and the backend keeps all three non-nullable for that reason.
  const needsBaseExcess =
    form.pricingControl === "WASHER_SET" ||
    form.platformPricingModel === "BASE_EXCESS";
  if (needsBaseExcess) {
    const excess = pesoInputToCentavos(form.excessRatePerKgPeso);
    if (!Number.isFinite(excess) || excess < 0) {
      return "Excess rate must be a peso amount of 0 or more.";
    }
    const weight = Number.parseFloat(form.baseWeightKg);
    if (!Number.isFinite(weight) || weight < 0) {
      return "Base weight must be a number of 0 or more.";
    }
  }

  if (form.pricingControl === "PLATFORM_FIXED") {
    if (form.platformPricingModel === "PER_LOAD") {
      const capacity = Number.parseFloat(form.platformLoadCapacityKg);
      if (!Number.isFinite(capacity) || capacity <= 0) {
        return "Set how many kilos one load covers.";
      }
    }
    if (form.platformPricingModel === "PER_ITEM" && !form.platformUnit) {
      return "Choose what this service counts.";
    }
    if (
      (form.platformPricingModel === "PER_KG" ||
        form.platformPricingModel === "BASE_EXCESS") &&
      form.platformMinBillableKg.trim() !== ""
    ) {
      const min = Number.parseFloat(form.platformMinBillableKg);
      if (!Number.isFinite(min) || min < 0) {
        return "Minimum billable weight must be a number of 0 or more, or blank for none.";
      }
    }
  }
  return null;
}

/** The method actually in force — WASHER_SET always falls back to base+excess. */
function platformModelOf(form: FormState): WasherPricingModel {
  return form.pricingControl === "PLATFORM_FIXED"
    ? form.platformPricingModel
    : "BASE_EXCESS";
}

function toInput(form: FormState): WasherServiceTemplateInput {
  const washerSet = form.pricingControl === "WASHER_SET";
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    pricingControl: form.pricingControl,
    // A platform-priced service allows no washer method by definition, but the
    // backend requires a non-empty list — send the full set so flipping back to
    // washer-set doesn't come back with everything disabled.
    allowedPricingModels: washerSet
      ? form.allowedPricingModels
      : [...ALL_PRICING_MODELS],
    minPriceCentavos: washerSet
      ? (optionalCentavos(form.minPricePeso) ?? null)
      : null,
    maxPriceCentavos: washerSet
      ? (optionalCentavos(form.maxPricePeso) ?? null)
      : null,
    platformPricingModel: platformModelOf(form),
    basePriceCentavos: pesoInputToCentavos(form.basePricePeso),
    // Non-nullable server-side even when the method ignores them, so an unused
    // or half-typed field becomes 0 rather than NaN. Whatever the form still
    // holds is sent, so switching a template to per-load and back doesn't lose
    // the excess rate it had.
    baseWeightKg: numberOr(form.baseWeightKg, 0),
    excessRatePerKgCentavos: centavosOr(form.excessRatePerKgPeso, 0),
    // The remaining three describe the platform's price only. Under WASHER_SET
    // they are meaningless, and sending stale values would leave a load
    // capacity on a service nobody prices by load.
    platformLoadCapacityKg:
      platformModelOf(form) === "PER_LOAD"
        ? numberOr(form.platformLoadCapacityKg, 0)
        : null,
    platformUnit:
      platformModelOf(form) === "PER_ITEM" ? form.platformUnit : null,
    platformMinBillableKg:
      platformModelOf(form) === "PER_KG" ||
      platformModelOf(form) === "BASE_EXCESS"
        ? nullableNumber(form.platformMinBillableKg)
        : null,
  };
}

function numberOr(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function centavosOr(value: string, fallback: number): number {
  const parsed = pesoInputToCentavos(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Blank means "no limit". */
function nullableNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Worked examples for the method in force, mirroring the backend's
 * calculateServiceLineTotal. Empty while the inputs are incomplete — a preview
 * that guesses at a missing field is worse than no preview.
 *
 * This is the one place the admin sees what they are actually configuring:
 * "₱250 per load, 7 kg capacity" and "₱250 for the first 7 kg" look nearly
 * identical in a form and price a 15 kg basket ₱750 apart.
 */
function buildPreview(
  form: FormState,
  model: WasherPricingModel,
): { label: string; amount: string }[] {
  const price = pesoInputToCentavos(form.basePricePeso);
  if (!Number.isFinite(price)) return [];

  switch (model) {
    case "PER_KG": {
      const min = Number.parseFloat(form.platformMinBillableKg);
      const floor = Number.isFinite(min) ? min : 0;
      return [3, 7, 10].map((kg) => ({
        label: `${kg} kg`,
        amount: formatPeso(Math.round(Math.max(kg, floor) * price)),
      }));
    }
    case "PER_LOAD": {
      const cap = Number.parseFloat(form.platformLoadCapacityKg);
      if (!Number.isFinite(cap) || cap <= 0) return [];
      // The boundary rows are the point: one gram over a load capacity is a
      // whole extra load, and that is what surprises people.
      return [
        { kg: cap, loads: 1 },
        { kg: cap + 0.1, loads: 2 },
        { kg: cap * 3, loads: 3 },
      ].map(({ kg, loads }) => ({
        label: `${round1(kg)} kg — ${loads} load${loads > 1 ? "s" : ""}`,
        amount: formatPeso(Math.round(loads * price)),
      }));
    }
    case "PER_ITEM": {
      const unit = SERVICE_UNIT_LABELS[form.platformUnit].toLowerCase();
      return [1, 2, 3].map((n) => ({
        label: `${n} ${unit}${n > 1 ? "s" : ""}`,
        amount: formatPeso(Math.round(n * price)),
      }));
    }
    case "BASE_EXCESS":
    default: {
      const baseKg = Number.parseFloat(form.baseWeightKg);
      const excess = pesoInputToCentavos(form.excessRatePerKgPeso);
      if (!Number.isFinite(baseKg) || !Number.isFinite(excess)) return [];
      return [baseKg, baseKg + 2, baseKg + 5].map((kg) => ({
        label: `${round1(kg)} kg`,
        amount: formatPeso(
          Math.round(price + Math.max(0, kg - baseKg) * excess),
        ),
      }));
    }
  }
}

/** Keeps 7.1 from rendering as 7.100000000000001. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function WasherServiceTemplateDialog({
  open,
  onOpenChange,
  /** The template being edited, or null to create a new one. */
  template,
  /**
   * "duplicate" pre-fills the form from `template` (name, pricing, etc.) but
   * submits as a brand-new template — the source's own id is never sent, so
   * this is a real Create under the hood, not an edit of the original.
   */
  mode = "edit",
  onSubmit,
  submitting,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: WasherServiceTemplate | null;
  mode?: "edit" | "duplicate";
  onSubmit: (input: WasherServiceTemplateInput) => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {/* Mounted only while open, so the form seeds itself from `template`
            on the way in and a cancelled edit can't leak into the next one —
            no reset effect, no cascading render. */}
        {open && (
          <TemplateForm
            template={template}
            isEdit={!!template && mode === "edit"}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
            submitting={submitting}
            error={error}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TemplateForm({
  template,
  isEdit,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  template: WasherServiceTemplate | null;
  isEdit: boolean;
  onSubmit: (input: WasherServiceTemplateInput) => void;
  onCancel: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<FormState>(() =>
    template ? formFromTemplate(template) : EMPTY_FORM,
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const washerSet = form.pricingControl === "WASHER_SET";

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validate(form);
    setLocalError(problem);
    if (problem) return;
    onSubmit(toInput(form));
  }

  function toggleModel(model: WasherPricingModel, checked: boolean) {
    setForm((f) => ({
      ...f,
      allowedPricingModels: checked
        ? [...f.allowedPricingModels, model]
        : f.allowedPricingModels.filter((m) => m !== model),
    }));
  }

  // The method actually in force. Under WASHER_SET the numbers below are the
  // base+excess fallback whatever the washer will eventually pick, so the form
  // keeps its original shape and only a platform-priced service switches.
  const activeModel = platformModelOf(form);
  const showBaseExcess = activeModel === "BASE_EXCESS";
  const preview = buildPreview(form, activeModel);

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit service" : "Add service"}</DialogTitle>
        {/* "you" used to be ambiguous here — an admin reading this could not
            tell whether it meant them or the washer. */}
        <DialogDescription>
          Define which services Home Washers can offer and how each service may
          be priced. Pricing can be controlled by Lalaba or set by the Home
          Washer within platform limits.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="py-4">
        <Field>
          <FieldLabel htmlFor="template-name">Name</FieldLabel>
          <Input
            id="template-name"
            required
            placeholder="e.g. Wash &amp; Fold"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <FieldDescription>
            Shown to washers and customers. Must be unique.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="template-description">Description</FieldLabel>
          <Textarea
            id="template-description"
            rows={2}
            placeholder="Optional — what the service includes"
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
          />
        </Field>

        {/* ── Pricing control ─────────────────────────────────────────── */}
        <Field>
          <FieldLabel>Pricing control</FieldLabel>
          <RadioGroup
            value={form.pricingControl}
            onValueChange={(value) =>
              value &&
              setForm((f) => ({
                ...f,
                pricingControl: value as WasherPricingControl,
              }))
            }
            className="gap-3"
          >
            <div className="flex items-start gap-3">
              <RadioGroupItem value="WASHER_SET" id="control-washer" />
              <div className="grid gap-0.5">
                <Label htmlFor="control-washer">Home Washer sets the price</Label>
                <span className="text-sm text-muted-foreground">
                  Home Washers choose their own amount, within the methods and
                  limits below.
                </span>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <RadioGroupItem value="PLATFORM_FIXED" id="control-platform" />
              <div className="grid gap-0.5">
                <Label htmlFor="control-platform">Lalaba sets the price</Label>
                <span className="text-sm text-muted-foreground">
                  All Home Washers offering this service use the same
                  platform-defined price. They only choose whether to offer it.
                </span>
              </div>
            </div>
          </RadioGroup>
        </Field>

        {washerSet && (
          <>
            <Field>
              <FieldLabel>Allowed charging methods</FieldLabel>
              <div className="grid gap-3">
                {EVERY_PRICING_MODEL.map((model) => {
                  const checked = form.allowedPricingModels.includes(model);
                  return (
                    <div key={model} className="flex items-start gap-3">
                      <Checkbox
                        id={`model-${model}`}
                        checked={checked}
                        onCheckedChange={(value) =>
                          toggleModel(model, value === true)
                        }
                      />
                      <div className="grid gap-0.5">
                        <Label htmlFor={`model-${model}`}>
                          {PRICING_MODEL_LABELS[model]}
                        </Label>
                        <span className="text-sm text-muted-foreground">
                          {MODEL_HINTS[model]}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <FieldDescription>
                A washer picks one of these per service. Most home washers think
                in loads, not kilos — the three weight-based methods cover
                ordinary laundry. Tick <em>Per item</em> only for services that
                are counted rather than weighed, like comforters or curtains;
                per-item services are left out of the &ldquo;from ₱X&rdquo;
                comparison customers browse by.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Price guardrails (optional)</FieldLabel>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  id="template-min-price"
                  inputMode="decimal"
                  placeholder="No minimum"
                  aria-label="Minimum price in pesos"
                  value={form.minPricePeso}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, minPricePeso: e.target.value }))
                  }
                />
                <Input
                  id="template-max-price"
                  inputMode="decimal"
                  placeholder="No maximum"
                  aria-label="Maximum price in pesos"
                  value={form.maxPricePeso}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, maxPricePeso: e.target.value }))
                  }
                />
              </div>
              <FieldDescription>
                Broad safety limits, not a market rate — they stop a mistyped
                ₱0.01/kg or ₱999,999/load reaching customers. Checked against
                the washer&apos;s headline amount, whichever method she picks.
              </FieldDescription>
            </Field>
          </>
        )}

        {/* ── Pricing method (platform-priced only) ───────────────────── */}
        {/* Under WASHER_SET the method is hers to pick from the allow-list
            above, and these numbers are only the fallback — so the picker
            appears solely when Lalaba is the one setting the price. */}
        {!washerSet && (
          <Field>
            <FieldLabel>Pricing method</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {EVERY_PRICING_MODEL.map((model) => (
                <Button
                  key={model}
                  type="button"
                  size="sm"
                  variant={
                    form.platformPricingModel === model ? "default" : "outline"
                  }
                  aria-pressed={form.platformPricingModel === model}
                  onClick={() =>
                    setForm((f) => ({ ...f, platformPricingModel: model }))
                  }
                >
                  {PRICING_MODEL_LABELS[model]}
                </Button>
              ))}
            </div>
            <FieldDescription>
              {MODEL_HINTS[form.platformPricingModel]}
            </FieldDescription>
          </Field>
        )}

        {/* ── Amounts ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          <Field>
            {/* These read as pre-filled because the placeholders are realistic
                numbers, so Create looked ready when the fields were still
                empty — hence the explicit "required". */}
            <FieldLabel htmlFor="template-base-price">
              {PRICE_LABELS[activeModel]} <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </FieldLabel>
            <Input
              id="template-base-price"
              required
              inputMode="decimal"
              placeholder="250.00"
              value={form.basePricePeso}
              onChange={(e) =>
                setForm((f) => ({ ...f, basePricePeso: e.target.value }))
              }
            />
          </Field>

          {activeModel === "PER_LOAD" && (
            <Field>
              <FieldLabel htmlFor="template-load-capacity">
                Maximum weight per load (kg) <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </FieldLabel>
              <Input
                id="template-load-capacity"
                required
                inputMode="decimal"
                placeholder="7"
                value={form.platformLoadCapacityKg}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    platformLoadCapacityKg: e.target.value,
                  }))
                }
              />
            </Field>
          )}

          {activeModel === "PER_ITEM" && (
            <Field>
              <FieldLabel htmlFor="template-unit">
                Unit <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </FieldLabel>
              <select
                id="template-unit"
                className="border-input bg-transparent h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs"
                value={form.platformUnit}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    platformUnit: e.target.value as WasherServiceUnit,
                  }))
                }
              >
                {ALL_SERVICE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {SERVICE_UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {showBaseExcess && (
            <Field>
              <FieldLabel htmlFor="template-base-weight">
                Base weight (kg) <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </FieldLabel>
              <Input
                id="template-base-weight"
                required
                inputMode="decimal"
                placeholder="7"
                value={form.baseWeightKg}
                onChange={(e) =>
                  setForm((f) => ({ ...f, baseWeightKg: e.target.value }))
                }
              />
            </Field>
          )}
        </div>

        {showBaseExcess && (
          <Field>
            <FieldLabel htmlFor="template-excess-rate">
              Excess rate (₱ per kg) <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </FieldLabel>
            <Input
              id="template-excess-rate"
              required
              inputMode="decimal"
              placeholder="30.00"
              value={form.excessRatePerKgPeso}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  excessRatePerKgPeso: e.target.value,
                }))
              }
            />
            <FieldDescription>
              {washerSet
                ? "The fallback: what a washer charges until she sets her own price. Required even when Base + excess is unticked. Existing washers keep this rate, so changing it re-prices everyone who hasn't set one."
                : "What every washer charges for this service."}
            </FieldDescription>
          </Field>
        )}

        {/* A worked example beats explaining the formula — this is the number
            a customer is quoted, so getting it wrong is a pricing incident. */}
        {preview.length > 0 && (
          <Field>
            <FieldLabel>Price preview</FieldLabel>
            <table className="w-full text-sm">
              <tbody>
                {preview.map((row) => (
                  <tr key={row.label} className="border-b last:border-0">
                    <td className="py-1 text-muted-foreground">{row.label}</td>
                    <td className="py-1 text-right tabular-nums">
                      {row.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <FieldDescription>
              What the washer receives. Customers also pay the platform fee on
              top of this.
            </FieldDescription>
          </Field>
        )}

        {(localError || error) && (
          <FieldError>{localError ?? error}</FieldError>
        )}
      </FieldGroup>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting
            ? isEdit
              ? "Saving…"
              : "Creating…"
            : isEdit
              ? "Save changes"
              : "Create"}
        </Button>
      </DialogFooter>
    </form>
  );
}
