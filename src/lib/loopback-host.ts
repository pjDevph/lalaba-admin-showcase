/**
 * `localhost` is only correct when the page is opened ON the machine running
 * the services. Viewed from anywhere else — the Android emulator's browser
 * (which reaches this host as 10.0.2.2), a phone on the LAN, a colleague's
 * laptop — `localhost` resolves to THAT device, so every API call and every
 * auth request silently goes nowhere.
 *
 * These helpers keep the configured port/scheme but swap a loopback hostname
 * for the host the page itself was served from. On a desktop that is already
 * `localhost`, so this is a no-op there.
 */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function pageHost(): string | null {
  if (typeof window === "undefined") return null; // SSR: nothing to compare to
  const host = window.location.hostname;
  // The page itself is on loopback (normal desktop dev) — leave config alone.
  return LOOPBACK.has(host) ? null : host;
}

/** Rewrite the hostname of a full URL (e.g. `http://localhost:3001`). */
export function rewriteLoopbackUrl(url: string): string {
  const host = pageHost();
  if (!host) return url;
  try {
    const parsed = new URL(url);
    if (!LOOPBACK.has(parsed.hostname)) return url;
    parsed.hostname = host;
    // href appends a trailing slash to a bare origin; keep the original shape
    // so callers that concatenate paths don't produce `//graphql`.
    return parsed.origin + parsed.pathname.replace(/\/$/, "") + parsed.search;
  } catch {
    return url;
  }
}

/** Rewrite a bare `host:port` pair (e.g. `localhost:9099`). */
export function rewriteLoopbackHostPort(hostPort: string): string {
  const host = pageHost();
  if (!host) return hostPort;
  const idx = hostPort.lastIndexOf(":");
  if (idx === -1) return LOOPBACK.has(hostPort) ? host : hostPort;
  const configured = hostPort.slice(0, idx);
  const port = hostPort.slice(idx + 1);
  return LOOPBACK.has(configured) ? `${host}:${port}` : hostPort;
}
