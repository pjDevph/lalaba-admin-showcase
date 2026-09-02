import { describe, expect, it } from "vitest";
import {
  diffRuleAgainstForm,
  emptyForm,
  formFromRule,
  inputFromForm,
  validateForm,
  type FeeRuleFormState,
} from "./fee-rule-form";
import type { PlatformFeeRule } from "@/lib/graphql/platform-fees";

function form(overrides: Partial<FeeRuleFormState> = {}): FeeRuleFormState {
  return {
    ...emptyForm(),
    name: "Platform Commission",
    percent: "10",
    effectiveFrom: "2026-08-20",
    ...overrides,
  };
}

const RULE: PlatformFeeRule = {
  _id: "1",
  ruleKey: "platform-commission-washer",
  version: 2,
  name: "Platform Commission",
  description: null,
  appliesTo: "HOME_WASHER",
  category: "COMMISSION",
  calculationType: "PERCENTAGE",
  percent: 8,
  fixedAmountCentavos: null,
  basis: "SERVICE_SUBTOTAL",
  minFeeCentavos: null,
  maxFeeCentavos: null,
  chargedTo: "CUSTOMER",
  customerSharePercent: null,
  providerSharePercent: null,
  deductFrom: "NOT_DEDUCTED",
  taxTreatment: "TAX_INCLUSIVE",
  applyVat: false,
  vatRatePercent: null,
  stackable: true,
  isActive: true,
  effectiveFrom: "2026-06-01T00:00:00.000Z",
  effectiveUntil: null,
  supersededByVersion: null,
  setByUid: "admin-1",
  setByName: "Prince Gandollas",
  changeReason: "Q2 rate",
  createdAt: "2026-06-01T00:00:00.000Z",
};

describe("validateForm", () => {
  it("accepts a plain percentage commission", () => {
    expect(validateForm(form())).toEqual({});
  });

  it("rejects a percentage over 100", () => {
    expect(validateForm(form({ percent: "125" })).percent).toMatch(
      /cannot exceed 100/i,
    );
  });

  it("rejects a percentage rule with no percentage", () => {
    expect(validateForm(form({ percent: "" })).percent).toBeTruthy();
  });

  it("rejects a maximum below the minimum", () => {
    const errors = validateForm(
      form({ minFeePeso: "100", maxFeePeso: "50" }),
    );
    expect(errors.maxFeePeso).toMatch(/greater than the minimum/i);
  });

  it("accepts blank min/max as no limit", () => {
    expect(validateForm(form({ minFeePeso: "", maxFeePeso: "" }))).toEqual({});
  });

  it("reports the running total when a split does not reach 100%", () => {
    const errors = validateForm(
      form({
        chargedTo: "SPLIT",
        customerSharePercent: "40",
        providerSharePercent: "40",
      }),
    );
    expect(errors.providerSharePercent).toMatch(/currently 80%/);
  });

  it("accepts a split totalling 100%", () => {
    expect(
      validateForm(
        form({
          chargedTo: "SPLIT",
          customerSharePercent: "40",
          providerSharePercent: "60",
        }),
      ),
    ).toEqual({});
  });

  it("rejects VAT switched on with no rate", () => {
    expect(validateForm(form({ applyVat: true })).vatRatePercent).toBeTruthy();
  });

  it("rejects an end date on or before the start date", () => {
    expect(
      validateForm(
        form({ effectiveFrom: "2026-08-20", effectiveUntil: "2026-08-01" }),
      ).effectiveUntil,
    ).toMatch(/after the start date/i);
  });
});

describe("inputFromForm", () => {
  it("clears the percentage on a fixed-amount rule", () => {
    const input = inputFromForm(
      form({ calculationType: "FIXED", percent: "10", fixedAmountPeso: "15" }),
    );
    // Not merely unused — the backend rejects a leftover value, because it
    // would read in the history as though it were still in force.
    expect(input.percent).toBeNull();
    expect(input.fixedAmountCentavos).toBe(1500);
  });

  it("clears the fixed amount on a percentage rule", () => {
    const input = inputFromForm(form({ fixedAmountPeso: "15" }));
    expect(input.fixedAmountCentavos).toBeNull();
    expect(input.percent).toBe(10);
  });

  it("keeps both parts on a fixed + percentage rule", () => {
    const input = inputFromForm(
      form({ calculationType: "FIXED_PLUS_PERCENTAGE", fixedAmountPeso: "15" }),
    );
    expect(input.fixedAmountCentavos).toBe(1500);
    expect(input.percent).toBe(10);
  });

  it("clears shares when the fee is not split", () => {
    const input = inputFromForm(form({ customerSharePercent: "40" }));
    expect(input.customerSharePercent).toBeNull();
    expect(input.providerSharePercent).toBeNull();
  });

  it("sends blank limits as null rather than zero", () => {
    const input = inputFromForm(form({ minFeePeso: "", maxFeePeso: "" }));
    expect(input.minFeeCentavos).toBeNull();
    expect(input.maxFeeCentavos).toBeNull();
  });
});

describe("formFromRule", () => {
  it("round-trips a rule through the form without changing it", () => {
    const input = inputFromForm(formFromRule(RULE));
    expect(input.percent).toBe(8);
    expect(input.appliesTo).toBe("HOME_WASHER");
    expect(input.calculationType).toBe("PERCENTAGE");
    expect(input.isActive).toBe(true);
  });

  it("does not carry the previous version's change reason forward", () => {
    // Reusing last quarter's justification for this quarter's rate change is
    // exactly what the reason field exists to prevent.
    expect(formFromRule(RULE).changeReason).toBe("");
  });
});

describe("diffRuleAgainstForm", () => {
  it("finds nothing when the form is untouched", () => {
    expect(diffRuleAgainstForm(RULE, formFromRule(RULE))).toEqual([]);
  });

  it("reports a rate change as before → after", () => {
    const changes = diffRuleAgainstForm(RULE, {
      ...formFromRule(RULE),
      percent: "10",
    });
    expect(changes).toEqual([
      { label: "Percentage", before: "8", after: "10" },
    ]);
  });

  it("renders a cleared value as an em dash rather than blank", () => {
    const changes = diffRuleAgainstForm(RULE, {
      ...formFromRule(RULE),
      maxFeePeso: "100.00",
    });
    expect(changes).toEqual([
      { label: "Maximum fee", before: "—", after: "100.00" },
    ]);
  });

  it("renders booleans as yes/no", () => {
    const changes = diffRuleAgainstForm(RULE, {
      ...formFromRule(RULE),
      isActive: false,
    });
    expect(changes).toEqual([
      { label: "Status", before: "Yes", after: "No" },
    ]);
  });
});
