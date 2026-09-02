import type { NextConfig } from "next";

/**
 * WEBSEC-001..006 — response security headers.
 *
 * The panel holds provider suspension, wallet adjustment and KYC decisions,
 * and shipped with none of these. It was framable by any site, which is a
 * one-click clickjack against exactly those controls.
 *
 * connect-src is derived from the same env the API client reads, so the CSP
 * cannot drift from where the app actually talks. Firebase Auth is listed
 * explicitly: sign-in runs against Google's endpoints, not our backend.
 */
const apiOrigin = (() => {
  const raw =
    process.env.NEXT_PUBLIC_ONLINE === "on"
      ? process.env.NEXT_PUBLIC_API_URL_ONLINE
      : process.env.NEXT_PUBLIC_API_URL_LOCAL;
  try {
    return raw ? new URL(raw).origin : "";
  } catch {
    return "";
  }
})();

/**
 * The Auth emulator, when one is configured.
 *
 * Sign-in runs against Google in production and against the emulator locally —
 * and only the first was listed, so `connect-src` blocked every local sign-in
 * with "Refused to connect". That surfaces as
 * `auth/network-request-failed`, which reads as a network problem and sends
 * you looking at the emulator, the credentials and the firewall. It is none of
 * those: the request never leaves the page.
 *
 * Derived from the SAME variable `src/lib/firebase.ts` reads, for the reason
 * stated above about apiOrigin — a CSP that is maintained separately from the
 * code it describes drifts, and this is what that drift looks like.
 *
 * Empty in production (the variable is unset there), so no localhost exception
 * ever ships.
 */
const authEmulatorOrigins = (() => {
  const hostPort = (
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? ""
  ).trim();
  if (!hostPort) return [];

  const origins = [`http://${hostPort}`];

  // The page can be opened from something other than localhost — the Android
  // emulator reaches this machine as 10.0.2.2, a phone uses the LAN IP — and
  // the client rewrites the emulator host to match (see lib/loopback-host.ts).
  // Those rewritten origins have to be allowed too, or sign-in works on this
  // machine and is refused everywhere else. Reuses the dev-origin list that
  // already exists for HMR rather than inventing a second one.
  const port = hostPort.split(":")[1];
  if (port) {
    for (const origin of (process.env.ADMIN_DEV_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean)) {
      origins.push(`http://${origin}:${port}`);
    }
  }
  return origins;
})();

/**
 * The Storage emulator, when one is configured.
 *
 * Locally, uploaded artwork is served by the Firebase Storage emulator over
 * plain `http://<host>:9199/...` (see LALABA_BE_DEV's
 * firebase-storage.provider.ts). `img-src` allowed `https:` and nothing else,
 * so every emulator-served image — campaign artwork, KYC evidence, courier
 * selfies — was blocked in this panel while loading perfectly in the apps,
 * which have no CSP. The symptom is an image that is plainly there in the
 * database and plainly missing on screen, with the reason visible only in the
 * console.
 *
 * Derived from an env var mirroring the backend's FIREBASE_STORAGE_EMULATOR_HOST
 * for the same reason apiOrigin and authEmulatorOrigins are derived rather than
 * hardcoded. Empty in production, so no http exception ever ships.
 */
const storageEmulatorOrigins = (() => {
  const hostPort = (
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_HOST ?? ""
  ).trim();
  if (!hostPort) return [];

  const origins = [`http://${hostPort}`];
  const port = hostPort.split(":")[1];
  if (port) {
    for (const origin of (process.env.ADMIN_DEV_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean)) {
      origins.push(`http://${origin}:${port}`);
    }
  }
  return origins;
})();

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // WEBSEC-002 — the clickjacking fix. frame-ancestors is the directive that
  // actually matters here and it is unaffected by the inline-script problem
  // below, so it takes effect immediately and in full.
  "frame-ancestors 'none'",
  ["img-src 'self' data: blob: https:", ...storageEmulatorOrigins].join(" "),
  // Recharts writes a <style> tag per chart (components/ui/chart.tsx), and
  // Tailwind ships inline styles. Hashing those is not practical.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // WEBSEC-006 — KNOWN GAP. Next's hydration payload and the inline theme
  // script in app/layout.tsx are both inline, so this stays permissive until
  // nonces are wired through middleware. Left explicit rather than omitted:
  // dropping the directive would fall back to default-src 'self' and break
  // the app on first load, which reads as "CSP is impossible here" and gets
  // the whole header reverted.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  [
    "connect-src 'self'",
    apiOrigin,
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    ...authEmulatorOrigins,
  ]
    .filter(Boolean)
    .join(" "),
].join("; ");

// WEBSEC-008 — dev origins allowed to load HMR assets, from the environment
// rather than committed. Without any entry, opening the panel from something
// other than localhost (the Android emulator reaches this machine as 10.0.2.2,
// a phone on the LAN uses its IP) leaves the HMR websocket unable to handshake
// and Next full-reloads on a loop, silently wiping whatever was typed into a
// form. Dev-only; no effect on a production build. Set ADMIN_DEV_ORIGINS in
// .env.local, e.g. ADMIN_DEV_ORIGINS=10.0.2.2,192.168.1.20
const devOrigins = (process.env.ADMIN_DEV_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  ...(devOrigins.length ? { allowedDevOrigins: devOrigins } : {}),

  /**
   * Route compatibility for the Phase 0 renames.
   *
   * /washers moved to /providers because the page never only listed washers —
   * `bookingProviders` returns merchant branches too, so the route name was a
   * false statement about its own contents.
   *
   * Permanent (308) rather than temporary: the old path is not coming back,
   * and an agent who bookmarked it or pasted it into a ticket should land on
   * the page rather than a 404. Kept as a redirect rather than a duplicate
   * page so there is exactly one implementation.
   */
  async redirects() {
    return [
      { source: "/washers", destination: "/providers", permanent: true },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // Legacy backstop for frame-ancestors; harmless where CSP is honoured.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
