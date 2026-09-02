# Lalaba — Admin Panel

The internal operations console for Lalaba — 29 feature routes mirroring the backend's own module boundaries: merchants, orders, wallets, promotions, campaigns, booking-policy, and more. Public, redacted snapshot — see [Notes on this snapshot](#notes-on-this-snapshot).

Talks to the [Lalaba backend](https://github.com/pjDevph/lalaba-backend-showcase) via a hand-written GraphQL query/mutation layer under `src/lib/graphql/` — no Apollo or codegen, just typed fetch calls per module.

## Stack

Next.js 16 · React 19 · TanStack Query + Table · shadcn/base-ui components

## Notes on this snapshot

Single squashed commit, not the real project history (81 commits). Internal AI-agent instruction files (`AGENTS.md`, `CLAUDE.md`) were removed before publishing, and this README replaces the repo's own stock README, which was stale — it described the app as "a placeholder dashboard using generic demo data," which no longer matches the actual codebase (29 real feature routes and GraphQL modules).

---

Part of the Lalaba platform · built by [Prince John Gandollas](https://github.com/pjDevph) with a small engineering team
