/**
 * OPERATIONAL MODULES — a capability-gated block of UI that fetches its own
 * data, mounted inside a page whose capability is different from its own.
 *
 * Until now every page was a single unit: one route, one capability, and
 * capability-coverage.test.ts asserted that every role able to open the route
 * was allowed to call every query the route fetched. That works while a route
 * and a permission are the same thing.
 *
 * They stop being the same thing the moment a page composes several
 * independently-authorized blocks. The unified operational context planned for
 * Phase 1B is precisely that shape — one route showing a person's identity,
 * orders, tickets, chats, wallet and devices, each behind a different
 * capability — and under the page-level rule it would have to demand the UNION
 * of every module's permissions, which no role holds, or escape checking
 * entirely. The second outcome is the dangerous one: the mechanism that would
 * catch a permission leak, switched off to ship the feature that needs it.
 *
 * So the boundary is declared here instead. A registered module is checked
 * against ITS OWN capability, and its queries are excluded from its host
 * page's check — the query is never unchecked, only checked against the
 * stricter of the two.
 *
 * THE REGISTRY IS NOT THE GATE. Registering a module here does not gate
 * anything at runtime; the `<Can capability="…">` around its mount point does.
 * This file records where those boundaries are so the test can verify both
 * halves, and the test fails if a registered module's mount site does not name
 * its capability.
 *
 * The three below are real and pre-date the Phase 1B work. They are here
 * because each one is already a place where a route's capability and a block's
 * capability differ.
 */

import type { Capability } from "@/lib/capabilities";

export type OperationalModule = {
  /** Stable id, used in test output. */
  id: string;
  /** What the module's own queries require. */
  capability: Capability;
  /** Implementation files, relative to `src/`. */
  sources: string[];
  /** Files that mount it — each must gate it with the capability above. */
  mountedIn: string[];
  /** Why this is a boundary rather than part of its host page. */
  why: string;
};

export const OPERATIONAL_MODULES: OperationalModule[] = [
  // ── The operational context ───────────────────────────────────────────────
  //
  // The route this registry was built for. One address, seven blocks, six
  // different capabilities — the shape that made the page-level rule
  // unworkable and this one necessary.
  //
  // All seven share ONE backend query, so they cannot be separated by source
  // file the way the three below are. They are registered as one module at the
  // FLOOR of what the page needs, and the backend authorizes each block
  // individually against its own matrix and reports what it assembled; the
  // page renders a block only when the backend served it AND this panel's
  // capability map allows it. The narrower gates therefore live in two places
  // that are checked against each other at runtime, not in this registry.
  {
    id: "operational-context",
    capability: "account:read",
    sources: ["lib/graphql/operational-context.ts"],
    mountedIn: ["app/(protected)/context/[type]/[id]/page.tsx"],
    why:
      "operationalContext is ('admin', 'support') — the floor to open the " +
      "page at all. Each block inside is gated twice more: by the backend's " +
      "module matrix, which never fetches what the caller may not see, and " +
      "by MODULE_CAPABILITY on the page. The wallet is the live asymmetry — " +
      "admin-only on both sides, so support gets this page with everything " +
      "except the money.",
  },
  {
    id: "kyc-dashboard-summary",
    capability: "kyc:review",
    sources: [
      "components/kyc/metrics-cards.tsx",
      "components/kyc/recent-activity.tsx",
    ],
    mountedIn: ["app/(protected)/page.tsx"],
    why:
      'The home route carries NO capability — everyone who can reach the panel ' +
      "opens it — while the verification summary it renders queries kycMetrics " +
      "and kycAuditLog. Those happen to be ('admin', 'support') today, which is " +
      "exactly the set of panel roles, so nothing was visibly wrong. Add the " +
      "finance role that capabilities.ts has anticipated since it was written " +
      "and this becomes a block of KYC data on the home page of a role with no " +
      "business seeing it.",
  },
  {
    id: "wallet-reconciliation",
    capability: "wallet:read",
    sources: ["components/wallets/reconciliation-dialog.tsx"],
    mountedIn: ["app/(protected)/wallets/page.tsx"],
    why:
      "walletReconciliationReport is @Roles('admin'), narrower than the wallets " +
      "page needs to be if wallet:read ever widens to a finance or support " +
      "role. Declaring it now means that widening fails this test instead of " +
      "shipping a 403 behind a button.",
  },
  {
    id: "provider-special-dates",
    capability: "provider:read",
    sources: ["components/booking/special-dates-dialog.tsx"],
    mountedIn: ["app/(protected)/providers/page.tsx"],
    why:
      "Its two reads had to widen to ('admin', 'support') before support could " +
      "be shown this dialog read-only — the coverage test failed on exactly " +
      "that mismatch when it was first built. As a declared module the " +
      "relationship is stated rather than rediscovered.",
  },
];
