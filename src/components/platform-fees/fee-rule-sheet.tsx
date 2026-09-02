"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  BASIS_LABELS,
  CALCULATION_LABELS,
  CATEGORY_LABELS,
  CHARGED_TO_LABELS,
  DEDUCTION_LABELS,
  PAYER_LABELS,
  TAX_TREATMENT_LABELS,
  formatPeso,
  isNonCharge,
  previewPlatformFeeRule,
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
import {
  diffRuleAgainstForm,
  emptyForm,
  formFromRule,
  inputFromForm,
  todayDateInput,
  validateForm,
  type FeeRuleFormState,
} from "./fee-rule-form";

/** The example order the preview is computed against — ₱500, a typical basket. */
const PREVIEW_BASE_CENTAVOS = 50_000;

const PAYERS: FeePayerRole[] = [
  "CUSTOMER",
  "HOME_WASHER",
  "LAUNDROMAT",
  "COURIER",
];
const CATEGORIES: FeeCategory[] = [
  "COMMISSION",
  "BOOKING_FEE",
  "SURCHARGE",
  "ACTIVATION_MINIMUM",
  "ACCEPT_MINIMUM",
  "OTHER",
];
const BASES: FeeBasis[] = [
  "SERVICE_SUBTOTAL",
  "ORDER_SUBTOTAL",
  "PER_ORDER",
  "PER_BOOKING",
  "PER_TRANSACTION",
  "PER_DELIVERY",
  "PER_PROVIDER",
  "ONE_TIME_ACTIVATION",
];
const DEDUCTIONS: FeeDeductionSource[] = [
  "ORDER_SETTLEMENT",
  "MAIN_WALLET",
  "SEPARATE_INVOICE",
  "NOT_DEDUCTED",
];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

type FeeRuleSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null = creating a new rule. */
  rule: PlatformFeeRule | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: PlatformFeeRuleInput) => void;
};

/**
 * The Sheet shell only. The form lives in a child that is mounted fresh per
 * rule (see the `key`), so its state initializes straight from props instead
 * of being resynced by an effect every time the sheet opens — the shell stays
 * mounted so the close animation still runs.
 */
export function FeeRuleSheet(props: FeeRuleSheetProps) {
  const { open, onOpenChange, rule } = props;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {open && <FeeRuleEditor key={rule?.ruleKey ?? "new"} {...props} />}
      </SheetContent>
    </Sheet>
  );
}

function FeeRuleEditor({
  onOpenChange,
  rule,
  submitting,
  error,
  onSubmit,
}: FeeRuleSheetProps) {
  const [form, setForm] = useState<FeeRuleFormState>(() =>
    rule ? formFromRule(rule) : emptyForm(),
  );
  // Two-step publish (§23): the form never saves directly. Fee changes move
  // real money, so the admin confirms a diff of exactly what they changed
  // before anything is written.
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [showErrors, setShowErrors] = useState(false);

  const errors = useMemo(() => validateForm(form), [form]);
  const hasErrors = Object.keys(errors).length > 0;

  function set<K extends keyof FeeRuleFormState>(
    key: K,
    value: FeeRuleFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const usesPercent = form.calculationType !== "FIXED";
  const usesFixed = form.calculationType !== "PERCENTAGE";
  const nonCharge = isNonCharge(form.category);

  // Debounced so typing a rate doesn't fire a request per keystroke; skipped
  // entirely while the draft is invalid, since the backend would just reject it.
  const debouncedForm = useDebouncedValue(form, 400);
  const previewInput = useMemo(() => {
    if (Object.keys(validateForm(debouncedForm)).length > 0) return null;
    return inputFromForm(debouncedForm);
  }, [debouncedForm]);

  const { data: preview } = useQuery({
    queryKey: ["fee-rule-preview", previewInput],
    queryFn: () => previewPlatformFeeRule(previewInput!, PREVIEW_BASE_CENTAVOS),
    // No `open` check — this component only exists while the sheet is open.
    enabled: previewInput != null && !nonCharge,
  });

  const changes = rule ? diffRuleAgainstForm(rule, form) : [];
  const isRateChange = changes.some((c) =>
    ["Percentage", "Amount", "Calculation"].includes(c.label),
  );

  function goToReview() {
    setShowErrors(true);
    if (hasErrors) return;
    // Nothing to publish is not an error, but silently writing a new version
    // that changes nothing would pollute the history with empty entries.
    if (rule && changes.length === 0 && !form.changeReason.trim()) return;
    setStep("review");
  }

  function publish() {
    onSubmit(inputFromForm(form));
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          {step === "review"
            ? "Review fee changes"
            : rule
              ? `Edit ${rule.name}`
              : "Create fee rule"}
        </SheetTitle>
        <SheetDescription>
          {step === "review"
            ? "New terms apply to future qualifying transactions only. Completed transactions keep the rate they were priced at."
            : rule
              ? `${PAYER_LABELS[rule.appliesTo]} · currently version ${rule.version}. Saving publishes a new version and keeps the old one in the history.`
              : "Define what is charged, who pays it, and when it applies."}
        </SheetDescription>
      </SheetHeader>

      {step === "review" ? (
        <ReviewStep
          rule={rule}
          form={form}
          changes={changes}
          isRateChange={isRateChange}
          onReasonChange={(value) => set("changeReason", value)}
        />
      ) : (
        <div className="flex flex-col gap-6 px-4">
          {/* ── General ─────────────────────────────────────────────── */}
          <FieldGroup>
            <SectionHeading>General</SectionHeading>

            <Field data-invalid={showErrors && !!errors.name}>
              <FieldLabel htmlFor="fee-name">Fee name</FieldLabel>
              <Input
                id="fee-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Platform Commission"
              />
              {showErrors && errors.name && (
                <FieldError>{errors.name}</FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="fee-description">Description</FieldLabel>
              <Textarea
                id="fee-description"
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Platform fee deducted from completed orders"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Applies to</FieldLabel>
                <Select
                  value={form.appliesTo}
                  // Locked after creation: the pricing code looks a rule up
                  // BY payer, so repointing one would rewrite the meaning of
                  // its whole history. A second payer is a second rule.
                  disabled={!!rule}
                  onValueChange={(v) =>
                    v && set("appliesTo", v as FeePayerRole)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: FeePayerRole) => PAYER_LABELS[v]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PAYERS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PAYER_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {rule && (
                  <FieldDescription>
                    Fixed after creation — create a separate rule for another
                    payer.
                  </FieldDescription>
                )}
              </Field>

              <Field>
                <FieldLabel>Fee category</FieldLabel>
                <Select
                  value={form.category}
                  disabled={!!rule}
                  onValueChange={(v) => v && set("category", v as FeeCategory)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: FeeCategory) => CATEGORY_LABELS[v]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {nonCharge && (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                This is a wallet balance the provider must hold, not a charge.
                Nothing is deducted — the money stays theirs.
              </p>
            )}
          </FieldGroup>

          <Separator />

          {/* ── Calculation ─────────────────────────────────────────── */}
          <FieldGroup>
            <SectionHeading>Calculation</SectionHeading>

            <RadioGroup
              value={form.calculationType}
              onValueChange={(v) =>
                v && set("calculationType", v as FeeCalculationType)
              }
              className="gap-2"
            >
              {(["FIXED", "PERCENTAGE", "FIXED_PLUS_PERCENTAGE"] as const).map(
                (t) => (
                  <div key={t} className="flex items-center gap-2">
                    <RadioGroupItem value={t} id={`calc-${t}`} />
                    <Label htmlFor={`calc-${t}`} className="font-normal">
                      {CALCULATION_LABELS[t]}
                    </Label>
                  </div>
                ),
              )}
            </RadioGroup>

            <div className="grid gap-4 sm:grid-cols-2">
              {usesFixed && (
                <Field data-invalid={showErrors && !!errors.fixedAmountPeso}>
                  <FieldLabel htmlFor="fee-amount">Amount (₱)</FieldLabel>
                  <Input
                    id="fee-amount"
                    inputMode="decimal"
                    value={form.fixedAmountPeso}
                    onChange={(e) => set("fixedAmountPeso", e.target.value)}
                    placeholder="15.00"
                  />
                  {showErrors && errors.fixedAmountPeso && (
                    <FieldError>{errors.fixedAmountPeso}</FieldError>
                  )}
                </Field>
              )}

              {usesPercent && (
                <Field data-invalid={showErrors && !!errors.percent}>
                  <FieldLabel htmlFor="fee-percent">Percentage (%)</FieldLabel>
                  <Input
                    id="fee-percent"
                    inputMode="decimal"
                    value={form.percent}
                    onChange={(e) => set("percent", e.target.value)}
                    placeholder="10"
                  />
                  {showErrors && errors.percent && (
                    <FieldError>{errors.percent}</FieldError>
                  )}
                </Field>
              )}
            </div>

            <Field>
              <FieldLabel>
                {usesPercent ? "Calculated from" : "Charged"}
              </FieldLabel>
              <Select
                value={form.basis}
                onValueChange={(v) => v && set("basis", v as FeeBasis)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: FeeBasis) => BASIS_LABELS[v]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {BASES.map((b) => (
                    <SelectItem key={b} value={b}>
                      {BASIS_LABELS[b]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={showErrors && !!errors.minFeePeso}>
                <FieldLabel htmlFor="fee-min">Minimum fee (₱)</FieldLabel>
                <Input
                  id="fee-min"
                  inputMode="decimal"
                  value={form.minFeePeso}
                  onChange={(e) => set("minFeePeso", e.target.value)}
                  placeholder="No minimum"
                />
                {showErrors && errors.minFeePeso && (
                  <FieldError>{errors.minFeePeso}</FieldError>
                )}
              </Field>
              <Field data-invalid={showErrors && !!errors.maxFeePeso}>
                <FieldLabel htmlFor="fee-max">Maximum fee (₱)</FieldLabel>
                <Input
                  id="fee-max"
                  inputMode="decimal"
                  value={form.maxFeePeso}
                  onChange={(e) => set("maxFeePeso", e.target.value)}
                  placeholder="No maximum"
                />
                {showErrors && errors.maxFeePeso && (
                  <FieldError>{errors.maxFeePeso}</FieldError>
                )}
              </Field>
            </div>
          </FieldGroup>

          <Separator />

          {/* ── Allocation ──────────────────────────────────────────── */}
          <FieldGroup>
            <SectionHeading>Charged to</SectionHeading>

            <RadioGroup
              value={form.chargedTo}
              onValueChange={(v) => v && set("chargedTo", v as FeeChargedTo)}
              className="gap-2"
            >
              {(["CUSTOMER", "PROVIDER", "SPLIT"] as const).map((c) => (
                <div key={c} className="flex items-center gap-2">
                  <RadioGroupItem value={c} id={`charged-${c}`} />
                  <Label htmlFor={`charged-${c}`} className="font-normal">
                    {CHARGED_TO_LABELS[c]}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            {form.chargedTo === "SPLIT" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  data-invalid={showErrors && !!errors.customerSharePercent}
                >
                  <FieldLabel htmlFor="share-customer">Customer (%)</FieldLabel>
                  <Input
                    id="share-customer"
                    inputMode="decimal"
                    value={form.customerSharePercent}
                    onChange={(e) =>
                      set("customerSharePercent", e.target.value)
                    }
                  />
                  {showErrors && errors.customerSharePercent && (
                    <FieldError>{errors.customerSharePercent}</FieldError>
                  )}
                </Field>
                <Field
                  data-invalid={showErrors && !!errors.providerSharePercent}
                >
                  <FieldLabel htmlFor="share-provider">Provider (%)</FieldLabel>
                  <Input
                    id="share-provider"
                    inputMode="decimal"
                    value={form.providerSharePercent}
                    onChange={(e) =>
                      set("providerSharePercent", e.target.value)
                    }
                  />
                  {showErrors && errors.providerSharePercent && (
                    <FieldError>{errors.providerSharePercent}</FieldError>
                  )}
                </Field>
              </div>
            )}

            <Field>
              <FieldLabel>Deducted from</FieldLabel>
              <Select
                value={form.deductFrom}
                onValueChange={(v) =>
                  v && set("deductFrom", v as FeeDeductionSource)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: FeeDeductionSource) => DEDUCTION_LABELS[v]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DEDUCTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {DEDUCTION_LABELS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                A customer-paid fee deducts nothing — it is added to what the
                customer owes. Providers have a single wallet today; there is no
                separate fee wallet.
              </FieldDescription>
            </Field>
          </FieldGroup>

          <Separator />

          {/* ── Tax ─────────────────────────────────────────────────── */}
          <FieldGroup>
            <SectionHeading>Tax</SectionHeading>

            <Field>
              <FieldLabel>Fee entered as</FieldLabel>
              <Select
                value={form.taxTreatment}
                onValueChange={(v) =>
                  v && set("taxTreatment", v as FeeTaxTreatment)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: FeeTaxTreatment) => TAX_TREATMENT_LABELS[v]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(["TAX_INCLUSIVE", "TAX_EXCLUSIVE"] as const).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TAX_TREATMENT_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field orientation="horizontal">
              <FieldLabel htmlFor="apply-vat">Apply VAT to this fee</FieldLabel>
              <Switch
                id="apply-vat"
                checked={form.applyVat}
                onCheckedChange={(checked) => set("applyVat", checked)}
              />
            </Field>

            {form.applyVat && (
              <Field data-invalid={showErrors && !!errors.vatRatePercent}>
                <FieldLabel htmlFor="vat-rate">VAT rate (%)</FieldLabel>
                <Input
                  id="vat-rate"
                  inputMode="decimal"
                  value={form.vatRatePercent}
                  onChange={(e) => set("vatRatePercent", e.target.value)}
                  placeholder="12"
                />
                {showErrors && errors.vatRatePercent && (
                  <FieldError>{errors.vatRatePercent}</FieldError>
                )}
              </Field>
            )}

            <FieldDescription>
              Recorded with the rule so the terms are unambiguous. Order pricing
              does not add VAT as a separate line yet.
            </FieldDescription>
          </FieldGroup>

          <Separator />

          {/* ── Effective period ────────────────────────────────────── */}
          <FieldGroup>
            <SectionHeading>Effective period</SectionHeading>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={showErrors && !!errors.effectiveFrom}>
                <FieldLabel htmlFor="effective-from">Starts</FieldLabel>
                <Input
                  id="effective-from"
                  type="date"
                  value={form.effectiveFrom}
                  min={todayDateInput()}
                  onChange={(e) => set("effectiveFrom", e.target.value)}
                />
                <FieldDescription>
                  A future date schedules the change — the current rate stays in
                  force until then.
                </FieldDescription>
                {showErrors && errors.effectiveFrom && (
                  <FieldError>{errors.effectiveFrom}</FieldError>
                )}
              </Field>
              <Field data-invalid={showErrors && !!errors.effectiveUntil}>
                <FieldLabel htmlFor="effective-until">Ends</FieldLabel>
                <Input
                  id="effective-until"
                  type="date"
                  value={form.effectiveUntil}
                  onChange={(e) => set("effectiveUntil", e.target.value)}
                />
                <FieldDescription>Blank for no end date.</FieldDescription>
                {showErrors && errors.effectiveUntil && (
                  <FieldError>{errors.effectiveUntil}</FieldError>
                )}
              </Field>
            </div>

            <Field orientation="horizontal">
              <FieldLabel htmlFor="rule-active">Active</FieldLabel>
              <Switch
                id="rule-active"
                checked={form.isActive}
                onCheckedChange={(checked) => set("isActive", checked)}
              />
            </Field>

            <Field orientation="horizontal">
              <FieldLabel htmlFor="rule-stackable">
                Can combine with other fees
              </FieldLabel>
              <Switch
                id="rule-stackable"
                checked={form.stackable}
                onCheckedChange={(checked) => set("stackable", checked)}
              />
            </Field>
          </FieldGroup>

          {!nonCharge && preview && (
            <>
              <Separator />
              <PreviewPanel
                chargedTo={form.chargedTo}
                preview={preview}
                hasMin={!!form.minFeePeso.trim()}
                hasMax={!!form.maxFeePeso.trim()}
              />
            </>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      <SheetFooter>
        {step === "review" ? (
          <div className="flex w-full flex-col gap-2">
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setStep("edit")}
                disabled={submitting}
              >
                Back
              </Button>
              <Button onClick={publish} disabled={submitting}>
                {submitting ? "Publishing…" : "Publish changes"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={goToReview}
              disabled={rule ? changes.length === 0 : false}
            >
              Review changes
            </Button>
          </div>
        )}
      </SheetFooter>
    </>
  );
}

/**
 * §15/§16 — the same numbers from both sides. Which one matters depends on who
 * pays, so both are shown and the irrelevant one is not hidden: a fee "charged
 * to the customer" still changes nothing for the provider, and seeing that
 * spelled out is the point.
 */
function PreviewPanel({
  chargedTo,
  preview,
  hasMin,
  hasMax,
}: {
  chargedTo: FeeChargedTo;
  preview: {
    baseCentavos: number;
    feeCentavos: number;
    uncappedFeeCentavos: number;
    minimumApplied: boolean;
    maximumApplied: boolean;
    vatCentavos: number;
    customerShareCentavos: number;
    providerShareCentavos: number;
    customerTotalCentavos: number;
    providerEarningsCentavos: number;
  };
  hasMin: boolean;
  hasMax: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <SectionHeading>
        Preview · {formatPeso(preview.baseCentavos)} order
      </SectionHeading>

      {(preview.minimumApplied || preview.maximumApplied) && (
        <p className="text-sm text-muted-foreground">
          The fee would be {formatPeso(preview.uncappedFeeCentavos)}; the{" "}
          {preview.minimumApplied ? "minimum" : "maximum"} brings it to{" "}
          {formatPeso(preview.feeCentavos)}.
        </p>
      )}
      {!preview.minimumApplied &&
        !preview.maximumApplied &&
        (hasMin || hasMax) && (
          <p className="text-sm text-muted-foreground">
            Neither limit applies at this order size.
          </p>
        )}

      {chargedTo !== "PROVIDER" && (
        <div className="rounded-md border p-3 text-sm">
          <div className="mb-2 font-medium">Customer pays</div>
          <PreviewRow label="Services" value={preview.baseCentavos} />
          <PreviewRow
            label="Platform fee"
            value={preview.customerShareCentavos}
          />
          {preview.vatCentavos > 0 && (
            <PreviewRow label="VAT" value={preview.vatCentavos} />
          )}
          <Separator className="my-2" />
          <PreviewRow
            label="Total"
            value={preview.customerTotalCentavos}
            bold
          />
        </div>
      )}

      {chargedTo !== "CUSTOMER" && (
        <div className="rounded-md border p-3 text-sm">
          <div className="mb-2 font-medium">Provider settlement</div>
          <PreviewRow label="Order subtotal" value={preview.baseCentavos} />
          <PreviewRow
            label="Fee deducted"
            value={-preview.providerShareCentavos}
          />
          <Separator className="my-2" />
          <PreviewRow
            label="Provider earnings"
            value={preview.providerEarningsCentavos}
            bold
          />
        </div>
      )}
    </div>
  );
}

function PreviewRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex justify-between tabular-nums ${bold ? "font-medium" : ""}`}
    >
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>
        {value < 0 ? `-${formatPeso(Math.abs(value))}` : formatPeso(value)}
      </span>
    </div>
  );
}

function ReviewStep({
  rule,
  form,
  changes,
  isRateChange,
  onReasonChange,
}: {
  rule: PlatformFeeRule | null;
  form: FeeRuleFormState;
  changes: { label: string; before: string; after: string }[];
  isRateChange: boolean;
  onReasonChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5 px-4">
      <div>
        <SectionHeading>
          {rule ? `${rule.name} · ${PAYER_LABELS[rule.appliesTo]}` : "New rule"}
        </SectionHeading>
        {rule && (
          <p className="mt-1 text-sm text-muted-foreground">
            Publishing version {rule.version + 1}.
          </p>
        )}
      </div>

      {rule ? (
        <div className="rounded-md border">
          {changes.map((c) => (
            <div
              key={c.label}
              className="flex items-baseline justify-between gap-4 border-b px-3 py-2 text-sm last:border-b-0"
            >
              <span className="text-muted-foreground">{c.label}</span>
              <span className="text-right tabular-nums">
                <span className="text-muted-foreground line-through">
                  {c.before}
                </span>{" "}
                → <span className="font-medium">{c.after}</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border px-3 py-2 text-sm">
          <div className="font-medium">{form.name}</div>
          <div className="text-muted-foreground">
            {PAYER_LABELS[form.appliesTo]} ·{" "}
            {form.calculationType === "FIXED"
              ? `₱${form.fixedAmountPeso}`
              : `${form.percent}%`}{" "}
            · paid by {CHARGED_TO_LABELS[form.chargedTo].toLowerCase()}
          </div>
        </div>
      )}

      <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        Effective {form.effectiveFrom}
        {form.effectiveUntil
          ? ` until ${form.effectiveUntil}`
          : " · no end date"}
        . New terms apply to qualifying transactions created from that date.
        Existing completed transactions keep the rate they were priced at and
        are not recalculated.
      </div>

      <Field>
        <FieldLabel htmlFor="change-reason">
          Reason for change{isRateChange ? "" : " (optional)"}
        </FieldLabel>
        <Textarea
          id="change-reason"
          rows={2}
          value={form.changeReason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Updated platform commission for Q3…"
        />
        <FieldDescription>
          Stored with this version and shown in the fee history.
        </FieldDescription>
      </Field>
    </div>
  );
}
