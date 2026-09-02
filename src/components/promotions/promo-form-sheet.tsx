"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  PROMO_AUDIENCES,
  type CreatePromoInput,
  type PromoCode,
  type PromoDiscountType,
  type PromoScope,
  type UpdatePromoInput,
} from "@/lib/graphql/promotions";

type Draft = {
  code: string;
  description: string;
  scope: PromoScope;
  discountType: PromoDiscountType;
  discountValue: string;
  maxDiscountCentavos: string;
  minOrderValueCentavos: string;
  targetRoleIds: string[];
  firstOrderOnly: boolean;
  usageCapTotal: string;
  usageCapPerCustomer: string;
  startsAt: string;
  expiresAt: string;
};

function toDraft(promo: PromoCode | null): Draft {
  const toDateInput = (iso: string | null) =>
    iso ? new Date(iso).toISOString().slice(0, 10) : "";
  return {
    code: promo?.code ?? "",
    description: promo?.description ?? "",
    scope: promo?.scope ?? "ORDER_TOTAL",
    discountType: promo?.discountType ?? "FLAT",
    discountValue: promo ? String(promo.discountValue) : "",
    maxDiscountCentavos: promo?.maxDiscountCentavos
      ? String(promo.maxDiscountCentavos / 100)
      : "",
    minOrderValueCentavos: promo?.minOrderValueCentavos
      ? String(promo.minOrderValueCentavos / 100)
      : "",
    targetRoleIds: promo?.targetRoleIds ?? ["customer"],
    firstOrderOnly: promo?.firstOrderOnly ?? false,
    usageCapTotal: promo?.usageCapTotal ? String(promo.usageCapTotal) : "",
    usageCapPerCustomer: promo ? String(promo.usageCapPerCustomer) : "1",
    startsAt: toDateInput(promo?.startsAt ?? null) || new Date().toISOString().slice(0, 10),
    expiresAt: toDateInput(promo?.expiresAt ?? null),
  };
}

type PromoFormSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promo: PromoCode | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: CreatePromoInput | UpdatePromoInput) => void;
};

/**
 * Create/edit. Editing is deliberately narrow — description, dates and the
 * total cap — because everything else (discount math, audience, per-customer
 * cap) changes what a code that may already be in someone's hands actually
 * does. Get those wrong and disable/recreate instead of "fixing" a live code.
 */
export function PromoFormSheet({
  open,
  onOpenChange,
  promo,
  submitting,
  error,
  onSubmit,
}: PromoFormSheetProps) {
  const isEdit = !!promo;
  const [draft, setDraft] = useState<Draft>(() => toDraft(promo));

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(toDraft(promo));
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function toggleAudience(id: string, checked: boolean) {
    update(
      "targetRoleIds",
      checked
        ? [...draft.targetRoleIds, id]
        : draft.targetRoleIds.filter((r) => r !== id),
    );
  }

  const pesosToCentavos = (v: string) =>
    v.trim() === "" ? undefined : Math.round(Number(v) * 100);

  function handleSubmit() {
    if (isEdit) {
      const input: UpdatePromoInput = {
        description: draft.description.trim(),
        startsAt: new Date(draft.startsAt).toISOString(),
        expiresAt: draft.expiresAt
          ? new Date(draft.expiresAt).toISOString()
          : undefined,
        usageCapTotal: draft.usageCapTotal.trim()
          ? Number(draft.usageCapTotal)
          : undefined,
      };
      onSubmit(input);
      return;
    }
    const input: CreatePromoInput = {
      code: draft.code.trim().toUpperCase(),
      description: draft.description.trim(),
      scope: draft.scope,
      discountType: draft.discountType,
      // A waiver takes no value — the amount is whatever the fee turns out to
      // be once the laundry is weighed, which is exactly why it is not
      // expressed as a percentage.
      discountValue:
        draft.scope === "PLATFORM_FEE" ? 0 : Number(draft.discountValue),
      maxDiscountCentavos: pesosToCentavos(draft.maxDiscountCentavos),
      minOrderValueCentavos: pesosToCentavos(draft.minOrderValueCentavos),
      targetRoleIds: draft.targetRoleIds,
      firstOrderOnly: draft.firstOrderOnly,
      usageCapTotal: draft.usageCapTotal.trim()
        ? Number(draft.usageCapTotal)
        : undefined,
      // Written to the newer field, which the backend reads for both a
      // customer and a branch. The older usageCapPerCustomer stays on existing
      // codes and is still honoured there.
      usageCapPerSubject: draft.usageCapPerCustomer.trim()
        ? Number(draft.usageCapPerCustomer)
        : undefined,
      startsAt: new Date(draft.startsAt).toISOString(),
      expiresAt: draft.expiresAt
        ? new Date(draft.expiresAt).toISOString()
        : undefined,
    };
    onSubmit(input);
  }

  const canSubmit =
    (isEdit || (draft.code.trim().length > 0 && draft.targetRoleIds.length > 0)) &&
    draft.description.trim().length > 0 &&
    (isEdit || draft.discountValue.trim() !== "") &&
    !submitting;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? `Edit ${promo.code}` : "Create promo code"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Discount math, audience and per-customer cap are locked once a code exists — disable and recreate if those need to change."
              : "The code is fixed once created. Discount math and audience cannot be changed later."}
          </SheetDescription>
        </SheetHeader>

        <FieldGroup className="px-4">
          {!isEdit && (
            <Field>
              <FieldLabel htmlFor="promo-code">Code</FieldLabel>
              <Input
                id="promo-code"
                value={draft.code}
                onChange={(e) => update("code", e.target.value.toUpperCase())}
                placeholder="WELCOME50"
                className="uppercase"
              />
              <FieldDescription>Letters, numbers and hyphens only.</FieldDescription>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="promo-description">Description</FieldLabel>
            <Input
              id="promo-description"
              value={draft.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="50% off a customer's first order"
            />
          </Field>

          {!isEdit && (
            <>
              <Field>
                <FieldLabel>What does it discount?</FieldLabel>
                <RadioGroup
                  value={draft.scope}
                  onValueChange={(v) => {
                    if (!v) return;
                    const scope = v as PromoScope;
                    update("scope", scope);
                    // A fee incentive can only WAIVE for now, and an order
                    // discount can never waive. Moving the method with the
                    // scope means the form cannot present a pair the backend
                    // will reject.
                    update(
                      "discountType",
                      scope === "PLATFORM_FEE" ? "WAIVE" : "FLAT",
                    );
                  }}
                  className="gap-2"
                >
                  <Label className="flex items-start gap-2 font-normal">
                    <RadioGroupItem value="ORDER_TOTAL" className="mt-1" />
                    <span>
                      <span className="block">The customer&apos;s order</span>
                      <span className="text-muted-foreground block text-xs">
                        Comes off what the customer pays.
                      </span>
                    </span>
                  </Label>
                  <Label className="flex items-start gap-2 font-normal">
                    <RadioGroupItem value="PLATFORM_FEE" className="mt-1" />
                    <span>
                      <span className="block">The Lalaba platform fee</span>
                      <span className="text-muted-foreground block text-xs">
                        A partner incentive. Applied automatically when the
                        provider accepts an order, and invisible to the
                        customer.
                      </span>
                    </span>
                  </Label>
                </RadioGroup>
              </Field>

              {draft.scope === "PLATFORM_FEE" ? (
                <FieldDescription>
                  The whole fee is waived for each qualifying order. Uses below
                  are counted per BRANCH — &quot;5 uses&quot; means five orders
                  for each of a merchant&apos;s shops, not five shared between
                  them.
                </FieldDescription>
              ) : null}

              {draft.scope === "ORDER_TOTAL" && (
              <>
              <Field>
                <FieldLabel>Discount type</FieldLabel>
                <RadioGroup
                  value={draft.discountType}
                  onValueChange={(v) => v && update("discountType", v as PromoDiscountType)}
                  className="flex gap-4"
                >
                  <Label className="flex items-center gap-2 font-normal">
                    <RadioGroupItem value="FLAT" /> Flat amount
                  </Label>
                  <Label className="flex items-center gap-2 font-normal">
                    <RadioGroupItem value="PERCENTAGE" /> Percentage
                  </Label>
                </RadioGroup>
              </Field>

              <Field>
                <FieldLabel htmlFor="promo-value">
                  {draft.discountType === "FLAT" ? "Discount (₱)" : "Discount (%)"}
                </FieldLabel>
                <Input
                  id="promo-value"
                  type="number"
                  min={0}
                  max={draft.discountType === "PERCENTAGE" ? 100 : undefined}
                  value={draft.discountValue}
                  onChange={(e) => update("discountValue", e.target.value)}
                />
              </Field>

              {draft.discountType === "PERCENTAGE" && (
                <Field>
                  <FieldLabel htmlFor="promo-max">Max discount (₱, optional)</FieldLabel>
                  <Input
                    id="promo-max"
                    type="number"
                    min={0}
                    value={draft.maxDiscountCentavos}
                    onChange={(e) => update("maxDiscountCentavos", e.target.value)}
                  />
                  <FieldDescription>Caps the peso amount a percentage code can take off.</FieldDescription>
                </Field>
              )}
              </>
              )}

              <Field>
                <FieldLabel htmlFor="promo-min-order">Minimum order (₱, optional)</FieldLabel>
                <Input
                  id="promo-min-order"
                  type="number"
                  min={0}
                  value={draft.minOrderValueCentavos}
                  onChange={(e) => update("minOrderValueCentavos", e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel>Who can use this</FieldLabel>
                <div className="flex flex-col gap-2">
                  {PROMO_AUDIENCES.map((a) => (
                    <Label key={a.id} className="flex items-center gap-2 font-normal">
                      <Checkbox
                        checked={draft.targetRoleIds.includes(a.id)}
                        onCheckedChange={(v) => toggleAudience(a.id, !!v)}
                      />
                      {a.label}
                    </Label>
                  ))}
                </div>
                {draft.targetRoleIds.length === 0 && (
                  <FieldError>Pick at least one audience.</FieldError>
                )}
              </Field>

              <Field orientation="horizontal">
                <Checkbox
                  checked={draft.firstOrderOnly}
                  onCheckedChange={(v) => update("firstOrderOnly", !!v)}
                />
                <FieldLabel className="font-normal">
                  First order only
                </FieldLabel>
              </Field>

              <Field>
                <FieldLabel htmlFor="promo-cap-customer">
                  {draft.scope === "PLATFORM_FEE"
                    ? "Uses per branch"
                    : "Uses per customer"}
                </FieldLabel>
                <Input
                  id="promo-cap-customer"
                  type="number"
                  min={1}
                  value={draft.usageCapPerCustomer}
                  onChange={(e) => update("usageCapPerCustomer", e.target.value)}
                />
                {draft.scope === "PLATFORM_FEE" ? (
                  <FieldDescription>
                    Counted per shop. A merchant with three branches gets this
                    many for each of them.
                  </FieldDescription>
                ) : null}
              </Field>
            </>
          )}

          <Field>
            <FieldLabel htmlFor="promo-cap-total">Total redemption cap (optional)</FieldLabel>
            <Input
              id="promo-cap-total"
              type="number"
              min={0}
              value={draft.usageCapTotal}
              onChange={(e) => update("usageCapTotal", e.target.value)}
            />
            <FieldDescription>Leave blank for no total cap.</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="promo-starts">Starts</FieldLabel>
            <Input
              id="promo-starts"
              type="date"
              value={draft.startsAt}
              onChange={(e) => update("startsAt", e.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="promo-expires">Expires (optional)</FieldLabel>
            <Input
              id="promo-expires"
              type="date"
              value={draft.expiresAt}
              onChange={(e) => update("expiresAt", e.target.value)}
            />
          </Field>

          {error && <FieldError>{error}</FieldError>}
        </FieldGroup>

        <SheetFooter>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Create promo code"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
