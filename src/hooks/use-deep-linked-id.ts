"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A drawer's open record, kept in the URL — where the URL, not React, is the
 * source of truth.
 *
 * Both the accounts directory and the ticket inbox held their open record in
 * local state, so `/accounts` and `/tickets` were the only addresses either
 * could ever have. Fine until something links INTO them — the omnibox does —
 * at which point "one search" becomes "one search, then find it again in the
 * list", which is the entire saving undone.
 *
 * It also makes the two things an operator does constantly work: refreshing
 * without losing your place, and pasting a record to a colleague. The order
 * detail already had this by being its own route; these now match it.
 *
 * Implemented with useSyncExternalStore rather than useState + useEffect. The
 * URL genuinely is an external store, and mirroring it into state means two
 * copies that can disagree — plus a mount-time read that either causes a
 * hydration mismatch (lazy initializer, since the server cannot see
 * window.location) or a setState inside an effect. getServerSnapshot returns
 * null, so the server renders a closed drawer and the client opens it.
 *
 * `replaceState` rather than push, so opening and closing five records does
 * not bury the page you arrived from under five history entries — and because
 * replaceState fires no popstate, the setter notifies subscribers itself.
 */

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // popstate covers the back button; the custom notify covers our own writes.
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

export function useDeepLinkedId(
  param: string,
): [string | null, (next: string | null) => void] {
  const id = useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(param),
    // The server has no URL query to read, so it always renders closed.
    () => null,
  );

  const update = useCallback(
    (next: string | null) => {
      const url = new URL(window.location.href);
      if (next) url.searchParams.set(param, next);
      else url.searchParams.delete(param);
      window.history.replaceState(null, "", url.toString());
      notify();
    },
    [param],
  );

  return [id, update];
}
