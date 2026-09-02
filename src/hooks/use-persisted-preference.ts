"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * An operator's own preference, remembered between sessions.
 *
 * Density and column choices are personal: someone triaging a queue wants
 * forty rows on screen, someone reviewing one record wants room to read, and
 * neither should have to re-choose every morning. They are also worth exactly
 * nothing to the server — storing them on the account would mean a migration
 * and a mutation to remember that one person likes compact tables.
 *
 * useSyncExternalStore rather than useState + useEffect, for the same reason
 * the deep-link hook uses it: localStorage really is an external store, and
 * mirroring it into React state gives two copies that can disagree, plus a
 * mount-time read that either mismatches hydration or writes state from inside
 * an effect. getServerSnapshot returns the fallback, so the server renders the
 * default and the client corrects it on hydration.
 */

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // `storage` fires for OTHER tabs, which is what we want: two panel tabs open
  // should not disagree about density. Our own writes call notify directly.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * Parsed values are cached by their raw string.
 *
 * useSyncExternalStore compares snapshots by reference and re-renders when
 * they differ, so returning a freshly-parsed object on every call would loop
 * forever. The cache makes the snapshot stable for as long as the underlying
 * string is.
 */
const cache = new Map<string, { raw: string; value: unknown }>();

function read<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // Safari in private mode throws on access. A preference is not worth
    // failing a page over.
    return fallback;
  }
  if (raw === null) return fallback;

  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;

  try {
    const value = JSON.parse(raw) as T;
    cache.set(key, { raw, value });
    return value;
  } catch {
    // Corrupt or hand-edited. Fall back rather than crash, and let the next
    // write replace it.
    return fallback;
  }
}

export function usePersistedPreference<T>(
  key: string,
  fallback: T,
): [T, (next: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );

  const set = useCallback(
    (next: T) => {
      try {
        const raw = JSON.stringify(next);
        window.localStorage.setItem(key, raw);
        cache.set(key, { raw, value: next });
      } catch {
        // Storage full or unavailable — the preference just does not persist.
      }
      notify();
    },
    [key],
  );

  return [value, set];
}
