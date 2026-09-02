import { describe, expect, it } from "vitest";

import {
  appImpact,
  configProblems,
  effectiveBlock,
  saveImpact,
  type ConfigState,
} from "@/lib/maintenance-impact";

/**
 * These rules are a mirror of the backend's effectiveStateForRole, and the
 * confirmation dialog is only worth showing if the mirror is faithful. A
 * dialog that describes the wrong outcome is worse than none — it will be
 * believed, and the person believing it is about to take the platform down.
 */

const NOW = new Date("2026-08-24T12:00:00+08:00");
const EARLIER = "2026-08-24T10:00:00+08:00";
const LATER = "2026-08-24T16:00:00+08:00";
const TOMORROW = "2026-08-25T10:00:00+08:00";

const off = (): ConfigState => ({
  globalEmergencyActive: false,
  globalEmergencyMessage: null,
  customerApp: {
    active: false,
    mode: "EMERGENCY",
    message: null,
    scheduledStart: null,
    scheduledEnd: null,
  },
  partnerApp: {
    active: false,
    mode: "EMERGENCY",
    message: null,
    scheduledStart: null,
    scheduledEnd: null,
  },
  supportEmail: "support@lalaba.ph",
  supportPhone: null,
  bypassUids: [],
});

describe("effectiveBlock", () => {
  it("does not block when nothing is switched on", () => {
    expect(effectiveBlock(off(), "customerApp", NOW).blocked).toBe(false);
  });

  it("blocks both apps under global emergency, ignoring their own settings", () => {
    const c = off();
    c.globalEmergencyActive = true;
    c.customerApp.active = false;
    c.partnerApp.active = false;
    expect(effectiveBlock(c, "customerApp", NOW).blocked).toBe(true);
    expect(effectiveBlock(c, "partnerApp", NOW).blocked).toBe(true);
  });

  it("blocks one app on its own without touching the other", () => {
    const c = off();
    c.customerApp.active = true;
    expect(effectiveBlock(c, "customerApp", NOW).blocked).toBe(true);
    expect(effectiveBlock(c, "partnerApp", NOW).blocked).toBe(false);
  });

  it("falls back to the backend's own default message", () => {
    const c = off();
    c.customerApp.active = true;
    expect(effectiveBlock(c, "customerApp", NOW).message).toBe(
      "This app is temporarily unavailable.",
    );
  });

  describe("SCHEDULED only blocks inside its window", () => {
    const scheduled = (start: string | null, end: string | null): ConfigState => {
      const c = off();
      c.customerApp = {
        active: true,
        mode: "SCHEDULED",
        message: "Back at 4pm.",
        scheduledStart: start,
        scheduledEnd: end,
      };
      return c;
    };

    it("blocks inside the window and reports when it ends", () => {
      const b = effectiveBlock(scheduled(EARLIER, LATER), "customerApp", NOW);
      expect(b.blocked).toBe(true);
      expect(b.type).toBe("SCHEDULED");
      expect(b.endsAt).toBe(LATER);
    });

    it("does not block before the window, but says it is coming", () => {
      const b = effectiveBlock(scheduled(TOMORROW, LATER), "customerApp", NOW);
      expect(b.blocked).toBe(false);
      expect(b.pendingFrom).toBe(TOMORROW);
    });

    it("does not block after the window", () => {
      const b = effectiveBlock(
        scheduled("2026-08-20T10:00:00+08:00", "2026-08-20T11:00:00+08:00"),
        "customerApp",
        NOW,
      );
      expect(b.blocked).toBe(false);
      expect(b.pendingFrom).toBeNull();
    });

    // The trap this whole module exists for: switched on, and blocking nobody.
    it("blocks NOBODY when the window is missing", () => {
      expect(effectiveBlock(scheduled(null, null), "customerApp", NOW).blocked).toBe(
        false,
      );
      expect(effectiveBlock(scheduled(EARLIER, null), "customerApp", NOW).blocked).toBe(
        false,
      );
    });
  });
});

describe("appImpact", () => {
  it("calls out an app going from usable to blocked", () => {
    const after = off();
    after.customerApp.active = true;
    const i = appImpact(off(), after, "customerApp", NOW);
    expect(i.severity).toBe("blocking");
    expect(i.sentence).toContain("will be blocked immediately");
  });

  it("calls out an app being released", () => {
    const before = off();
    before.customerApp.active = true;
    const i = appImpact(before, off(), "customerApp", NOW);
    expect(i.severity).toBe("releasing");
    expect(i.sentence).toContain("unblocked");
  });

  it("distinguishes a changed message from no change at all", () => {
    const before = off();
    before.customerApp = { ...before.customerApp, active: true, message: "old" };
    const after = off();
    after.customerApp = { ...after.customerApp, active: true, message: "new" };

    expect(appImpact(before, after, "customerApp", NOW).sentence).toContain(
      "new message",
    );
    expect(appImpact(before, before, "customerApp", NOW).sentence).toContain(
      "No change",
    );
  });

  it("reports a scheduled window that has not started as pending, not as blocking", () => {
    const after = off();
    after.customerApp = {
      active: true,
      mode: "SCHEDULED",
      message: "Soon.",
      scheduledStart: TOMORROW,
      scheduledEnd: "2026-08-25T12:00:00+08:00",
    };
    const i = appImpact(off(), after, "customerApp", NOW);
    expect(i.severity).toBe("pending");
    expect(i.sentence).toContain("not blocked yet");
  });
});

describe("saveImpact", () => {
  it("flags the master override going on, and that it hits both apps", () => {
    const after = off();
    after.globalEmergencyActive = true;
    const s = saveImpact(off(), after, NOW);
    expect(s.globalEmergencyTurningOn).toBe(true);
    expect(s.blocksAnyone).toBe(true);
    expect(s.apps.every((a) => a.severity === "blocking")).toBe(true);
  });

  it("counts bypass accounts, which are the exception to everything above", () => {
    const after = off();
    after.bypassUids = ["a", "b"];
    expect(saveImpact(off(), after, NOW).bypassCount).toBe(2);
  });

  it("reports a pure release as blocking nobody", () => {
    const before = off();
    before.globalEmergencyActive = true;
    expect(saveImpact(before, off(), NOW).blocksAnyone).toBe(false);
  });
});

describe("configProblems", () => {
  it("insists on a way to reach support before blocking anyone", () => {
    const c = off();
    c.customerApp = { ...c.customerApp, active: true, message: "Back soon." };
    c.supportEmail = null;
    c.supportPhone = null;
    expect(configProblems(c).map((p) => p.field)).toContain("support");
  });

  // TEST-MNT-012 — the rule is an invariant over the RESULT, not a rule about
  // the transition. Blocking first and deleting the contacts afterwards has to
  // be refused too, or the guarantee only ever held for a moment.
  it("refuses clearing the contacts while a block stays active", () => {
    const c = off();
    c.customerApp = { ...c.customerApp, active: true, message: "Back soon." };
    c.supportEmail = null;
    c.supportPhone = null;
    expect(configProblems(c).map((p) => p.field)).toContain("support");
  });

  it("accepts a phone number alone", () => {
    const c = off();
    c.customerApp = { ...c.customerApp, active: true, message: "Back soon." };
    c.supportEmail = null;
    c.supportPhone = "+63 900 000 0000";
    expect(configProblems(c).map((p) => p.field)).not.toContain("support");
  });

  it("does not demand a contact when nothing is blocked", () => {
    const c = off();
    c.supportEmail = null;
    c.supportPhone = null;
    expect(configProblems(c)).toEqual([]);
  });

  it("accepts a config with nothing switched on", () => {
    expect(configProblems(off())).toEqual([]);
  });

  it("insists on a message whenever a block is switched on", () => {
    const c = off();
    c.customerApp.active = true;
    expect(configProblems(c).map((p) => p.field)).toContain("customerApp.message");
  });

  it("insists on a message for the global override too", () => {
    const c = off();
    c.globalEmergencyActive = true;
    expect(configProblems(c).map((p) => p.field)).toContain(
      "globalEmergencyMessage",
    );
  });

  it("refuses a SCHEDULED block with no window — it would block nobody", () => {
    const c = off();
    c.customerApp = {
      active: true,
      mode: "SCHEDULED",
      message: "Back soon.",
      scheduledStart: null,
      scheduledEnd: null,
    };
    expect(configProblems(c).map((p) => p.field)).toContain("customerApp.window");
  });

  it("refuses a window that ends before it starts", () => {
    const c = off();
    c.customerApp = {
      active: true,
      mode: "SCHEDULED",
      message: "Back soon.",
      scheduledStart: LATER,
      scheduledEnd: EARLIER,
    };
    expect(configProblems(c).map((p) => p.field)).toContain("customerApp.window");
  });

  it("says nothing about an app that is switched off", () => {
    const c = off();
    c.customerApp.mode = "SCHEDULED";
    expect(configProblems(c)).toEqual([]);
  });
});
