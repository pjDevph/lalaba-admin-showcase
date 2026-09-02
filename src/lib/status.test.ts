import { describe, expect, it } from "vitest";

import {
  ACCOUNT_STATUS,
  ATTEMPT_RESPONSIBILITY,
  CASE_STATE,
  ORDER_STATUS,
  PAYMENT_STATUS,
  lookupStatus,
  orderStatusesInBucket,
} from "./status";

describe("lookupStatus", () => {
  it("resolves a status in the case the registry declares", () => {
    expect(lookupStatus("laundry_quality_hold", ORDER_STATUS)).toEqual({
      label: "Quality hold",
      tone: "danger",
      bucket: "in_progress",
    });
  });

  // The one that matters: OnlineOrder.status is a GraphQL enum and arrives
  // UPPERCASE, while OrderEvent.toStatus is a raw string and arrives
  // lowercase. Both must resolve to the same badge.
  it("resolves the same status in either case", () => {
    expect(lookupStatus("ABANDONED_UNSETTLED", ORDER_STATUS)).toEqual(
      lookupStatus("abandoned_unsettled", ORDER_STATUS),
    );
    expect(lookupStatus("ABANDONED_UNSETTLED", ORDER_STATUS).tone).toBe("danger");
  });

  it("falls back to a readable label and a neutral tone for unknown values", () => {
    // A new backend enum member must degrade, never blank out a queue.
    expect(lookupStatus("SOME_NEW_STATE", ORDER_STATUS)).toEqual({
      label: "Some new state",
      tone: "neutral",
    });
  });

  it("prefers the registry it was given over the global search order", () => {
    // ACTIVE exists in more than one registry; passing one must pin the answer.
    expect(lookupStatus("ACTIVE", ACCOUNT_STATUS).label).toBe("Active");
  });

  it("finds a status without a registry hint", () => {
    expect(lookupStatus("BALANCE_DUE").tone).toBe("danger");
    expect(lookupStatus("BALANCE_DUE")).toEqual(
      lookupStatus("BALANCE_DUE", PAYMENT_STATUS),
    );
  });
});

describe("tone assignment", () => {
  it("keeps every terminal money-at-risk state on the danger tone", () => {
    for (const status of ["disputed", "abandoned_unsettled", "BALANCE_DUE"]) {
      expect(lookupStatus(status).tone).toBe("danger");
    }
  });

  it("distinguishes a claimed case from an unclaimed one", () => {
    // The queue's backlog reads as waiting; a claimed case reads as in flight.
    expect(lookupStatus("NEEDS_REVIEW", CASE_STATE).tone).toBe("pending");
    expect(lookupStatus("IN_REVIEW", CASE_STATE).tone).toBe("info");
  });
});

describe("orderStatusesInBucket", () => {
  it("groups every order status into exactly one bucket", () => {
    const buckets = (
      ["placed", "in_progress", "completed", "disputed", "cancelled"] as const
    ).flatMap((bucket) => orderStatusesInBucket(bucket));

    expect(new Set(buckets).size).toBe(buckets.length);
    expect(buckets.length).toBe(Object.keys(ORDER_STATUS).length);
  });

  it("puts the abandonment queue where support looks for it", () => {
    expect(orderStatusesInBucket("disputed")).toContain("abandoned_unsettled");
  });
});

describe("attempt responsibility", () => {
  // Mirrors AttemptResponsibility in the backend's order-status.enum.ts, whose
  // own comment is the reason for the tones: a customer-caused failed attempt
  // may carry a fee, a provider- or system-caused one never does.
  it("marks only customer-caused attempts as danger", () => {
    expect(lookupStatus("CUSTOMER", ATTEMPT_RESPONSIBILITY).tone).toBe("danger");
    expect(lookupStatus("PROVIDER", ATTEMPT_RESPONSIBILITY).tone).not.toBe("danger");
    expect(lookupStatus("SYSTEM", ATTEMPT_RESPONSIBILITY).tone).not.toBe("danger");
  });

  // The order snapshot stores the raw enum value, so the lowercase form is
  // what actually reaches the badge.
  it("resolves the lowercase wire value the order snapshot stores", () => {
    expect(lookupStatus("customer", ATTEMPT_RESPONSIBILITY)).toEqual(
      lookupStatus("CUSTOMER", ATTEMPT_RESPONSIBILITY),
    );
  });

  it("covers every member of the backend enum", () => {
    expect(Object.keys(ATTEMPT_RESPONSIBILITY).sort()).toEqual([
      "CUSTOMER",
      "PROVIDER",
      "SYSTEM",
    ]);
  });
});
