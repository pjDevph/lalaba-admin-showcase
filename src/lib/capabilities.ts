/**
 * What a back-office account is allowed to DO, named per action rather than
 * per role.
 *
 * Before this file, thirteen pages each asked `profile?.role.roleId ===
 * "admin"` inline and the sidebar kept its own separate list. Adding a role —
 * `finance`, which should touch money but never ban anyone — meant finding and
 * correcting every one of those, and missing one meant either a dead button or
 * a visible control that 403s on click.
 *
 * IMPORTANT: this is a UI affordance layer, not a security boundary. The
 * backend's `@Roles(...)` guards are the boundary. Everything here must mirror
 * a guard that already exists server-side; if the two disagree, the backend
 * wins and the UI is the bug. Never grant a capability here to "unblock" a
 * screen — grant it in the backend resolver first.
 */

export const CAPABILITIES = [
  // Operations — support's daily surface
  "kyc:review", // claim, approve/reject documents, complete a case
  "order:read", // look up an order and its timeline
  "order:override", // move an order by hand, within the transition table
  "chat:read", // read existing conversation threads
  // Post into a thread as a third party. The message renders under its own
  // "Support" sender label, which is also why support holds it: the one role
  // named on the message used to be the one role that could not send it.
  "chat:takeover",
  "courier:revoke_selfie",
  "settlement:reinstate", // pull an abandoned order back into play

  // Support tickets — the one module whose primary user is an agent rather
  // than an operator, so support holds all of these.
  "ticket:read",
  "ticket:reply", // add a note, internal or customer-visible
  "ticket:assign", // claim, reassign, hand back
  "ticket:escalate",
  "ticket:resolve",

  // The account directory — a lookup surface, not an admin one. Support needs
  // it to answer "who is this person" on the call they are already on.
  "account:read",
  // DSAR/compliance: the deletion grace-period queue and cancelling a
  // pending request on someone's behalf. Matches the backend's own
  // @Roles('admin', 'support') on accountDeletionQueue and
  // cancelAccountDeletion — support handles "I changed my mind" calls
  // directly, same as it handles order overrides.
  "compliance:read",
  // The single most sensitive capability in the panel: mints a live
  // credential for someone else's account. Never given to support — see
  // ROLE_CAPABILITIES below and the backend's own admin-only guard, which is
  // the actual boundary this mirrors.
  "account:impersonate",
  // Force-logout for ANY account (revokeUserSessions takes any uid on the
  // backend, not just back-office ones). Separate from admin_user:manage,
  // which is about administering back-office accounts specifically — this is
  // usable from the directory, on a customer or provider, and is admin-only
  // to match the backend's own @Roles('admin') gate.
  "account:force_logout",
  // Deactivate/reactivate for any non-back-office account, from the
  // directory. Same backend mutations the Merchants page already uses
  // (@Roles('admin') there too) — this is a second UI entry point onto them,
  // not a new capability the backend doesn't already enforce.
  "account:deactivate",
  // Moderating a review changes a provider's public score, so it sits with
  // the operations work rather than with platform config.
  "review:moderate",

  // Provider directory
  // Reading the washer directory is admin AND support: `bookingProviders`,
  // its only data source, is @Roles('admin', 'support'). It was admin-only
  // for a while and the page was shown to support anyway — the query 403'd
  // and the table rendered "No home washers yet", which is worse than no page
  // at all. The guard widened first, then this. Merchants needs no
  // equivalent: listMerchants was already ('admin', 'support').
  //
  // The two WRITES below stay admin-only, so support sees the same table with
  // the cap as a badge instead of an input and no suspend button.
  "provider:read", // washer directory — bookingProviders
  "provider:suspend", // suspend/reactivate a washer or merchant
  "provider:set_cap", // per-washer daily order cap

  // Money
  "fee:manage", // publish platform fee rules
  "wallet:read", // wallet list, ledger, top-up log, reconciliation
  "wallet:adjust", // manual wallet adjustment — ledgered, mandatory reason
  // No payout capability, and there is not meant to be one. The wallet is
  // prepaid and consumable: money moves provider → platform (top-up, fee
  // consumption) and never the other way, because the customer pays the
  // provider directly in cash or an e-wallet outside the app. The platform
  // never holds money owed to a provider, so there is nothing to pay out.
  //
  // `payout:approve` used to sit here marked "NOT BUILT YET", which read as a
  // missing feature rather than an absent concept. It was a leftover from the
  // pre-Phase-2 model — the same era as the retired `washer_earnings`
  // collection, whose own file says nothing reads or writes it. Phase 2 §17
  // dropped `settlement_available` and `withdrawals` outright: "there is no
  // payout leg in this design."
  //
  // If that is ever reversed, it is a product decision about money movement
  // and needs a backend module first — not a capability added here.
  // Promo/voucher codes — admin-only to match the backend's @Roles('admin')
  // on the whole resolver: a discount is money the platform gives up, same
  // rationale as fee:manage.
  "promo:manage",
  // Platform-wide GMV/revenue reporting. Admin-only, matching the backend's
  // @Roles('admin') on platform-analytics — the same class of information as
  // the fee rules and promo codes that produce these numbers.
  "reports:read",

  // Outbound messaging. Admin-only and NOT granted to support: a push
  // reaches every customer's lock screen and cannot be recalled, which is a
  // wider blast radius than anything else in the panel.
  "broadcast:send",

  // Platform configuration
  "service:manage", // washer service templates
  "booking_policy:manage",
  "maintenance:toggle",
  // Marketing website content (FAQ, service areas, promo banners) — the
  // only editable surface for lalaba-website, which has no CMS of its own.
  "site_content:manage",

  // System
  "admin_user:manage", // invite/list back-office accounts
  "audit:read",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Role → capabilities.
 *
 * Only `admin` and `support` exist today — those are the two roleIds the
 * backend recognises for this panel (see auth-context's ALLOWED_ROLES and the
 * `@Roles('admin', 'support')` guards). The spec's `finance`, `support_lead`
 * and `ops_admin` need backend roles before they can be added here; a row in
 * this map with no matching server-side guard grants nothing real.
 *
 * Support deliberately gets no money and no config capabilities: an agent's
 * job is to answer "what is going on with this order/provider", and every
 * outward-facing platform rule stays with admin.
 */
export const ROLE_CAPABILITIES: Record<string, readonly Capability[]> = {
  admin: CAPABILITIES,
  support: [
    "kyc:review",
    "order:read",
    "chat:read",
    "chat:takeover",
    "courier:revoke_selfie",
    "settlement:reinstate",
    "ticket:read",
    "ticket:reply",
    "ticket:assign",
    "ticket:escalate",
    "ticket:resolve",
    "account:read",
    "compliance:read",
    "review:moderate",
    // Read-only: the cap input and the suspend button are gated separately on
    // provider:set_cap / provider:suspend, which support does not hold.
    "provider:read",
    // Support holds this because fixing a stuck order IS the use case — the
    // reasons are all "the app did not do what it should have". It is
    // constrained to transitions the state machine already allows and every
    // use is audited, so it advances a lifecycle rather than overriding one.
    // Mirrors @Roles('admin', 'support') on overrideOrderStatus.
    "order:override",
  ],
};

export function capabilitiesFor(roleId: string | null | undefined): ReadonlySet<Capability> {
  if (!roleId) return new Set();
  return new Set(ROLE_CAPABILITIES[roleId] ?? []);
}

export function roleHasCapability(
  roleId: string | null | undefined,
  capability: Capability,
): boolean {
  return capabilitiesFor(roleId).has(capability);
}
