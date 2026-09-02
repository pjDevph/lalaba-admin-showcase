import { describe, expect, it } from "vitest";

import { diffConfig, labelForPath } from "./config-diff";

describe("diffConfig", () => {
  it("[HP] reports only the leaves that actually changed", () => {
    const before = { enabled: true, defaults: { dailyCapacity: 20, leadTimeMinutes: 60 } };
    const after = { enabled: true, defaults: { dailyCapacity: 25, leadTimeMinutes: 60 } };

    expect(diffConfig(before, after)).toEqual([
      {
        path: "defaults.dailyCapacity",
        label: "Defaults · Daily capacity",
        before: "20",
        after: "25",
      },
    ]);
  });

  it("[HP] renders booleans as on/off rather than true/false", () => {
    const changes = diffConfig({ enabled: true }, { enabled: false });
    expect(changes[0]).toMatchObject({ before: "on", after: "off" });
  });

  it("[EC] treats null as a real value, not a missing one", () => {
    // A blank cap means NO cap, and nothing stands in behind it — the same
    // distinction the providers page makes.
    const changes = diffConfig({ cap: 5 }, { cap: null });
    expect(changes[0]).toMatchObject({ before: "5", after: "—" });
  });

  it("[EC] ignores __typename, which rides along on every fetched object", () => {
    const before = { __typename: "Policy", enabled: true };
    const after = { __typename: "Policy", enabled: true };
    expect(diffConfig(before, after)).toEqual([]);
  });

  it("[EC] compares an array as a whole rather than element by element", () => {
    // "Monday's windows changed" is the useful statement; "windows[0].start
    // changed" is not.
    const before = { windows: [{ start: "08:00", end: "20:00" }] };
    const after = { windows: [{ start: "09:00", end: "18:00" }] };

    const changes = diffConfig(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe("windows");
  });

  it("[EC] reports nothing for identical objects", () => {
    const config = { a: 1, b: { c: true, d: [1, 2] } };
    expect(diffConfig(config, structuredClone(config))).toEqual([]);
  });

  it("[EC] catches a field that only exists on one side", () => {
    const changes = diffConfig({}, { newField: 3 });
    expect(changes[0]).toMatchObject({ before: "—", after: "3" });
  });
});

describe("labelForPath", () => {
  it("[HP] turns a dotted camelCase path into something readable", () => {
    expect(labelForPath("defaults.advanceBookingDays")).toBe(
      "Defaults · Advance booking days",
    );
    expect(labelForPath("safetyLimits.maxServiceRadiusKm")).toBe(
      "Safety limits · Max service radius km",
    );
  });
});
