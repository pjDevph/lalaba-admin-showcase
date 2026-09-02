import { auth } from "@/lib/firebase";
import { resolveApiUrl } from "@/lib/api-url";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /**
     * The GraphQL `extensions.code`, when the backend sent one. Kept so
     * callers can branch on the KIND of failure rather than string-matching
     * the message — MFA_REQUIRED and MAINTENANCE_MODE both need different
     * handling from a generic error.
     */
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── GraphQL ────────────────────────────────────────────────────────────────
// The backend (LALABA_BE_DEV) is GraphQL-only — no REST layer exists beyond a
// health-check route. Every real request goes through graphqlFetch() below.

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    extensions?: { code?: string };
  }>;
}

function opNameOf(query: string): string {
  const m = /\b(query|mutation)\s+(\w+)/.exec(query);
  return m?.[2] ?? "anonymous";
}

/**
 * How long to wait before giving up on the backend. A cold Railway container
 * can take a few seconds to answer, so this is generous — it exists to stop a
 * hung request pinning a tab open forever, not to enforce a latency budget.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/** Server messages are useful in dev and noise (or a leak) in production. */
const isDev = process.env.NODE_ENV !== "production";

export async function graphqlFetch<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const opName = opNameOf(query);
  const token = await auth?.currentUser?.getIdToken();
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${resolveApiUrl()}/graphql`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } catch (err) {
    if (isDev) {
      console.error(`[GQL] ${opName} -> network error (hasToken=${!!token})`, err);
    }
    // An abort is our own timeout firing, not something the caller did.
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(
        504,
        "The server took too long to respond. Check your connection and try again.",
        "TIMEOUT",
      );
    }
    throw new ApiError(
      0,
      "Could not reach the server. Check your connection and try again.",
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timeout);
  }

  // Anything in front of the API — a proxy 502, a Railway cold-start page, an
  // auth redirect — answers with HTML. Parsing that as JSON throws a raw
  // SyntaxError, and every page's error UI then shows "Unexpected token '<'"
  // instead of saying the API is unreachable. GraphQL itself answers 200 even
  // for errors, so a non-2xx here is always transport-level.
  let json: GraphQLResponse<T>;
  try {
    json = (await response.json()) as GraphQLResponse<T>;
  } catch {
    if (isDev) {
      console.error(`[GQL] ${opName} -> non-JSON response (HTTP ${response.status})`);
    }
    throw new ApiError(
      response.status,
      response.status >= 500 || response.status === 0
        ? "The server is unavailable right now. Try again in a moment."
        : `The server returned an unexpected response (HTTP ${response.status}).`,
      "BAD_RESPONSE",
    );
  }

  if (json.errors?.length) {
    const first = json.errors[0];
    if (isDev) {
      console.error(`[GQL] ${opName} -> ${first.extensions?.code ?? "error"}: ${first.message}`);
    }
    // An admin ended this session while the panel was open. Sign out here
    // rather than leaving a page that looks alive but fails every request —
    // a force-logout that the operator can keep clicking through is not one.
    if (first.extensions?.code === "SESSION_REVOKED") {
      void auth?.signOut();
    }
    throw new ApiError(
      response.status === 200 ? 400 : response.status,
      first.message,
      first.extensions?.code,
    );
  }

  return json.data as T;
}
