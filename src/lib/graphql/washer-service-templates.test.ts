import { describe, expect, it } from "vitest";
import {
  ALL_PRICING_MODELS,
  centavosToPesoInput,
  describePlatformPricing,
  EVERY_PRICING_MODEL,
  formatPeso,
  pesoInputToCentavos,
  type WasherServiceTemplate,
} from "./washer-service-templates";

// The catalog is the only place washer prices are set, and the form speaks
// pesos while the API speaks integer centavos. A rounding slip here is a
// silent pricing bug on every booking, so the conversion is pinned down.
describe("peso ↔ centavos conversion", () => {
  it("round-trips whole and fractional amounts", () => {
    for (const centavos of [0, 1, 99, 100, 25000, 35050, 123456]) {
      expect(pesoInputToCentavos(centavosToPesoInput(centavos))).toBe(centavos);
    }
  });

  it("rounds to the nearest centavo rather than truncating", () => {
    // A half-centavo is reachable from a plain typed price; truncating would
    // quietly shave a centavo off every booking at that rate.
    expect(pesoInputToCentavos("45.675")).toBe(4568);
    expect(pesoInputToCentavos("0.005")).toBe(1);
    expect(pesoInputToCentavos("19.99")).toBe(1999);
    expect(pesoInputToCentavos("350")).toBe(35000);
  });

  it("returns NaN for input that is not a usable amount", () => {
    for (const bad of ["", "   ", "abc", "₱250"]) {
      expect(Number.isNaN(pesoInputToCentavos(bad))).toBe(true);
    }
  });

  it("keeps two decimals when seeding the form from stored centavos", () => {
    expect(centavosToPesoInput(35000)).toBe("350.00");
    expect(centavosToPesoInput(4050)).toBe("40.50");
    expect(centavosToPesoInput(0)).toBe("0.00");
  });

  it("formats for display with a peso sign and thousands separators", () => {
    expect(formatPeso(35000)).toBe("₱350.00");
    expect(formatPeso(123456789)).toBe("₱1,234,567.89");
    expect(formatPeso(0)).toBe("₱0.00");
  });
});

describe("describePlatformPricing", () => {
  const t = (over: Partial<WasherServiceTemplate>) =>
    ({
      platformPricingModel: "BASE_EXCESS",
      basePriceCentavos: 25000,
      baseWeightKg: 7,
      excessRatePerKgCentavos: 3000,
      platformLoadCapacityKg: null,
      platformUnit: null,
      platformMinBillableKg: null,
      ...over,
    }) as WasherServiceTemplate;

  // A platform-priced template used to be base + excess by definition, so the
  // Pricing column could hardcode it. Now that it can be per-load or per-item,
  // reading those three columns regardless describes a ₱250-per-load service
  // as "₱250.00 up to 7 kg" — the wrong price for any basket over 7 kg.
  it("describes each method in its own terms", () => {
    expect(describePlatformPricing(t({}))).toEqual({
      headline: "₱250.00 up to 7 kg",
      detail: "+ ₱30.00/kg after",
    });
    expect(
      describePlatformPricing(
        t({ platformPricingModel: "PER_LOAD", platformLoadCapacityKg: 7 }),
      ),
    ).toEqual({ headline: "₱250.00/load", detail: "up to 7 kg per load" });
    expect(
      describePlatformPricing(
        t({ platformPricingModel: "PER_ITEM", platformUnit: "PAIR" }),
      ),
    ).toEqual({ headline: "₱250.00/pair", detail: "counted, not weighed" });
    expect(
      describePlatformPricing(
        t({
          platformPricingModel: "PER_KG",
          basePriceCentavos: 3500,
          platformMinBillableKg: 3,
        }),
      ),
    ).toEqual({ headline: "₱35.00/kg", detail: "min 3 kg" });
  });

  it("reads a template saved before the field existed as base + excess", () => {
    expect(
      describePlatformPricing(t({ platformPricingModel: null as never })),
    ).toEqual({
      headline: "₱250.00 up to 7 kg",
      detail: "+ ₱30.00/kg after",
    });
  });
});

describe("pricing model constants", () => {
  it("keeps per-item out of the default allow-list", () => {
    // ALL_PRICING_MODELS is also the fallback for templates stored before a
    // model existed, so adding PER_ITEM here would retroactively let washers
    // price Wash & Fold per piece on every template already in the database.
    expect(ALL_PRICING_MODELS).not.toContain("PER_ITEM");
    expect(EVERY_PRICING_MODEL).toContain("PER_ITEM");
    expect(EVERY_PRICING_MODEL).toHaveLength(ALL_PRICING_MODELS.length + 1);
  });
});
