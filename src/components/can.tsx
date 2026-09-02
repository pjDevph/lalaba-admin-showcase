"use client";

import { ShieldAlertIcon } from "lucide-react";
import { useMemo } from "react";

import { useAuth } from "@/context/auth-context";
import {
  capabilitiesFor,
  type Capability,
} from "@/lib/capabilities";

/**
 * The capability equivalent of `useAuth`. Prefer this over reading
 * `profile.role.roleId` anywhere — a page should say what it needs
 * ("can I suspend providers?"), never who it thinks is asking.
 */
export function useCan() {
  const { profile } = useAuth();
  const granted = useMemo(
    () => capabilitiesFor(profile?.role.roleId),
    [profile?.role.roleId],
  );

  return useMemo(
    () => ({
      can: (capability: Capability) => granted.has(capability),
      canAny: (...capabilities: Capability[]) =>
        capabilities.some((c) => granted.has(c)),
      capabilities: granted,
    }),
    [granted],
  );
}

/**
 * Renders children only if the account holds the capability.
 *
 * Default is to render NOTHING — the spec's point is that a support agent
 * should never see a wallet-adjust button at all, not see it greyed out and
 * wonder. Pass `fallback` only where the absence would be confusing (an empty
 * table column header, say).
 */
export function Can({
  capability,
  children,
  fallback = null,
}: {
  capability: Capability;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { can } = useCan();
  return <>{can(capability) ? children : fallback}</>;
}

/**
 * Whole-page gate. Replaces the old `RequireRole`, which took a role name and
 * so re-encoded the role→page mapping at every call site.
 *
 * `(protected)/layout.tsx` guarantees `profile` is loaded before children
 * render, so there is no loading state to handle here.
 */
export function RequireCapability({
  capability,
  children,
}: {
  capability: Capability;
  children: React.ReactNode;
}) {
  const { can } = useCan();

  if (!can(capability)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <ShieldAlertIcon className="size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">
          You don&apos;t have access to this page
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your account doesn&apos;t have the{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            {capability}
          </code>{" "}
          permission. Contact an admin if you believe you should have access.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
