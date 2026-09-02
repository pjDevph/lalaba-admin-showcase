"use client";

import Link from "next/link";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  CopyIcon,
  ExternalLinkIcon,
  LogInIcon,
  LogOutIcon,
  UserCheckIcon,
  UserXIcon,
} from "lucide-react";

import { Can } from "@/components/can";
import { revokeUserSessions } from "@/lib/graphql/admin-users";
import { deactivateUser, reactivateUser } from "@/lib/graphql/merchants";
import { fetchUserConsents } from "@/lib/graphql/compliance";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DetailDrawer } from "@/components/ui/detail-drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ACCOUNT_DEACTIVATION_REASONS,
  IMPERSONATION_REASONS,
  ReasonCodeDialog,
  SESSION_REVOKE_REASONS,
} from "@/components/ui/reason-code-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, ToneBadge } from "@/components/ui/status-badge";
import { ApiError } from "@/lib/api-client";
import {
  fetchDirectoryUser,
  impersonateUser,
  ROLE_LABELS,
  type DirectoryUserDetail,
  type ImpersonationToken,
} from "@/lib/graphql/directory";
import { peso } from "@/lib/graphql/wallets";
import { ACCOUNT_STATUS } from "@/lib/status";

const BACK_OFFICE_ROLES = new Set(["admin", "support"]);

/**
 * One account, everything the platform knows about them.
 *
 * Suspend stays OFF this drawer — the Washers page already owns that
 * decision with its own reason code and audit entry, and it means something
 * specific to a provider's booking eligibility that this drawer has no
 * context for.
 *
 * Deactivate/reactivate, Login as and Force logout are all here, restricted
 * to non-back-office roles: admin/support already have their own dedicated
 * flow on the Users page, and offering a second one would put the same
 * decision behind two sets of rules. For every OTHER role, this drawer is
 * the only place any of the three exist — deactivate/reactivate previously
 * worked for customers on the backend but had no UI at all, and force logout
 * had the same gap (the Users page lists back-office accounts ONLY, even
 * though the mutation accepts any uid).
 */
export function AccountDetailDrawer({
  uid,
  onClose,
}: {
  uid: string | null;
  onClose: () => void;
}) {
  const [impersonating, setImpersonating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [token, setToken] = useState<ImpersonationToken | null>(null);
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["directory-user", uid],
    queryFn: () => fetchDirectoryUser(uid!),
    enabled: uid != null,
  });

  const impersonateMutation = useMutation({
    mutationFn: ({ reason, note }: { reason: string; note: string | null }) =>
      impersonateUser(uid!, reason, note),
    onSuccess: ({ impersonateUser: result }) => {
      setImpersonating(false);
      setToken(result);
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not start impersonation.",
      ),
  });

  const revokeMutation = useMutation({
    mutationFn: ({ reason, note }: { reason: string; note: string | null }) =>
      revokeUserSessions(uid!, reason, note),
    onSuccess: () => {
      toast.success("Signed out of every device.");
      setRevoking(false);
      void queryClient.invalidateQueries({ queryKey: ["directory-user", uid] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Could not end this account's sessions.",
      ),
  });

  const deactivateMutation = useMutation({
    mutationFn: ({ reason, note }: { reason: string; note: string | null }) =>
      deactivateUser(uid!, reason, note),
    onSuccess: () => {
      toast.success("Account deactivated.");
      setDeactivating(false);
      void queryClient.invalidateQueries({ queryKey: ["directory-user", uid] });
      void queryClient.invalidateQueries({ queryKey: ["directory-users"] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not deactivate this account.",
      ),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => reactivateUser(uid!),
    onSuccess: () => {
      toast.success("Account reactivated.");
      setReactivating(false);
      void queryClient.invalidateQueries({ queryKey: ["directory-user", uid] });
      void queryClient.invalidateQueries({ queryKey: ["directory-users"] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not reactivate this account.",
      ),
  });

  if (!uid) return null;

  // Deactivate/reactivate stay off admin/support here — those already have
  // their own dedicated flow on the Users page, and offering a second one
  // would be the same decision reachable two ways.
  // Deactivated is excluded too: the backend refuses to mint a token for one
  // (it would fail on the account's very first request, since GqlAuthGuard
  // checks isActive before anything else), so the button never offers a
  // request that is guaranteed to fail.
  const canImpersonate =
    data && !BACK_OFFICE_ROLES.has(data.user.roleId) && data.user.isActive;
  const canToggleActive = data && !BACK_OFFICE_ROLES.has(data.user.roleId);

  return (
    <>
      <DetailDrawer
        open
        onOpenChange={(open) => !open && onClose()}
        entityId={uid}
        title={data?.user.displayName ?? "Loading…"}
        status={data ? (data.user.isActive ? "ACTIVE" : "SUSPENDED") : undefined}
        statusRegistry={ACCOUNT_STATUS}
        subtitle={
          data
            ? `${ROLE_LABELS[data.user.roleId] ?? data.user.roleName} · joined ${
                data.user.createdAt
                  ? new Date(data.user.createdAt).toLocaleDateString("en-PH")
                  : "—"
              }`
            : undefined
        }
        actions={
          data && (
            <>
              {/* The drawer answers "who is this"; the context page answers
                  "what is going on with them" — their orders, tickets, wallet
                  and verification in one place. Without this link they were
                  two unconnected representations of the same person, which is
                  the exact problem the context page was built to end. */}
              <Link
                href={`/context/person/${encodeURIComponent(uid)}`}
                // buttonVariants rather than <Button asChild>: this Button is
                // a Base UI component with a `render` prop, not a Radix one,
                // and a styled link is the simpler answer for a plain
                // navigation.
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ExternalLinkIcon />
                Open full context
              </Link>
              {canImpersonate && (
                // Rendered only for non-back-office roles — same rule the
                // backend enforces, so this button is never offered a
                // request it knows will be refused.
                <Can capability="account:impersonate">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setImpersonating(true)}
                  >
                    <LogInIcon />
                    Login as
                  </Button>
                </Can>
              )}
              {/* Ending a session someone cannot currently start is a no-op
                  the backend already handles, but offering it anyway invites
                  a click that does nothing. */}
              {data.user.isActive && (
                <Can capability="account:force_logout">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRevoking(true)}
                  >
                    <LogOutIcon />
                    Force logout
                  </Button>
                </Can>
              )}
              {canToggleActive && (
                <Can capability="account:deactivate">
                  {data.user.isActive ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeactivating(true)}
                    >
                      <UserXIcon />
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setReactivating(true)}
                    >
                      <UserCheckIcon />
                      Reactivate
                    </Button>
                  )}
                </Can>
              )}
            </>
          )
        }
        tabs={
          data
            ? [
                {
                  value: "overview",
                  label: "Overview",
                  content: <OverviewTab detail={data} />,
                },
                {
                  value: "linked",
                  label: `Linked (${data.linkedAccounts.length})`,
                  content: <LinkedTab detail={data} />,
                },
                {
                  value: "devices",
                  label: `Devices (${data.devices.length})`,
                  content: <DevicesTab detail={data} />,
                },
                {
                  value: "consents",
                  label: "Consents",
                  content: <ConsentsTab uid={data.user.uid} />,
                },
              ]
            : undefined
        }
      >
        {isPending && <Skeleton className="h-64 w-full" />}
      </DetailDrawer>

      <ReasonCodeDialog
        open={impersonating}
        onOpenChange={setImpersonating}
        title={`Sign in as ${data?.user.displayName ?? "this account"}?`}
        description="This grants live access to their account for about an hour. It is logged with your name against theirs — pick the reason that actually applies."
        reasons={IMPERSONATION_REASONS}
        confirmLabel="Start"
        pending={impersonateMutation.isPending}
        onConfirm={(reason, note) =>
          impersonateMutation.mutate({ reason, note })
        }
      />

      <ReasonCodeDialog
        open={revoking}
        onOpenChange={setRevoking}
        title="Sign this account out everywhere?"
        description={
          data
            ? `${data.user.displayName} will be signed out of every device immediately and will need to log in again. Their account stays active.`
            : undefined
        }
        reasons={SESSION_REVOKE_REASONS}
        confirmLabel="Sign out everywhere"
        pending={revokeMutation.isPending}
        onConfirm={(reason, note) => revokeMutation.mutate({ reason, note })}
      />

      <ReasonCodeDialog
        open={deactivating}
        onOpenChange={setDeactivating}
        title="Deactivate this account?"
        description={
          data
            ? `${data.user.displayName} will lose access immediately. This can be reversed later with "Reactivate".`
            : undefined
        }
        reasons={ACCOUNT_DEACTIVATION_REASONS}
        confirmLabel="Deactivate"
        pending={deactivateMutation.isPending}
        onConfirm={(reason, note) =>
          deactivateMutation.mutate({ reason, note })
        }
      />

      <ConfirmDialog
        open={reactivating}
        onOpenChange={setReactivating}
        title="Reactivate this account?"
        description={
          data
            ? `${data.user.displayName} will regain access immediately.`
            : undefined
        }
        confirmLabel="Reactivate"
        onConfirm={() => reactivateMutation.mutate()}
      />

      <ImpersonationResultDialog token={token} onClose={() => setToken(null)} />
    </>
  );
}

/**
 * The token, once minted. Not a "you're now signed in" screen — nothing in
 * this panel can open the customer or merchant app for you, so this shows
 * what exists today: a copyable credential and how it is actually consumed.
 */
function ImpersonationResultDialog({
  token,
  onClose,
}: {
  token: ImpersonationToken | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={token != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sign-in token for {token?.targetName}</DialogTitle>
          <DialogDescription>
            Valid for about an hour, and only once. There is no in-panel way
            to open the {token ? ROLE_LABELS[token.targetRoleId] : ""} app
            signed in as them yet — hand this to whoever is reproducing the
            issue.
          </DialogDescription>
        </DialogHeader>

        {token && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
            <code className="flex-1 truncate font-mono text-xs">
              {token.customToken}
            </code>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0"
              aria-label="Copy token"
              onClick={() => {
                void navigator.clipboard.writeText(token.customToken);
                toast.success("Token copied.");
              }}
            >
              <CopyIcon className="size-3.5" />
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          To end this session before it expires on its own, close this and use{" "}
          <span className="font-medium text-foreground">Force logout</span> on
          this same account.
        </p>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OverviewTab({ detail }: { detail: DirectoryUserDetail }) {
  const { user } = detail;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Orders placed" value={detail.ordersAsCustomer} />
        <Stat label="Orders fulfilled" value={detail.ordersAsProvider} />
        <Stat label="Tickets raised" value={detail.ticketsRaised} />
        <Stat
          label="Wallet"
          // Null means no wallet at all, which is not the same as ₱0.00 — a
          // customer has no wallet; a provider with ₱0.00 has run dry.
          value={
            detail.walletBalanceCentavos == null
              ? "—"
              : peso(detail.walletBalanceCentavos)
          }
        />
      </div>

      <dl className="flex flex-col divide-y text-sm">
        <Row label="Email" value={user.email} />
        <Row label="Phone" value={user.phoneNumber} />
        <Row
          label="Account id"
          value={<code className="font-mono text-xs">{user.uid}</code>}
        />
        <Row
          label="Last order"
          value={
            detail.lastOrderAt
              ? new Date(detail.lastOrderAt).toLocaleString("en-PH")
              : "Never"
          }
        />
        <Row
          label="Sessions"
          value={
            detail.sessionsValidAfter
              ? `Force-ended ${new Date(detail.sessionsValidAfter).toLocaleString("en-PH")}`
              : "Never force-ended"
          }
        />
        {user.washerStatus && (
          <Row
            label="Provider status"
            value={
              <StatusBadge
                status={user.washerStatus}
                registry={ACCOUNT_STATUS}
              />
            }
          />
        )}
        {user.selfieStatus && (
          <Row label="Courier photo" value={user.selfieStatus} />
        )}
        {user.accountStatus && user.accountStatus !== "ACTIVE" && (
          <Row label="Account state" value={user.accountStatus} />
        )}
      </dl>
    </div>
  );
}

function LinkedTab({ detail }: { detail: DirectoryUserDetail }) {
  if (detail.linkedAccounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No other account shares this phone number.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Stated up front, because a linked-accounts list with no framing reads
          as an accusation. Shared numbers are common and usually innocent. */}
      <div className="flex gap-2 rounded-md bg-[var(--status-pending-bg)] px-3 py-2 text-sm text-[var(--status-pending)]">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          These accounts share a phone number. That is often legitimate —
          families share numbers, and a provider may also order as a customer.
          Treat it as something to look at, not as evidence.
        </p>
      </div>

      <ul className="flex flex-col divide-y">
        {detail.linkedAccounts.map((account) => (
          <li
            key={account.uid}
            className="flex items-center justify-between gap-3 py-2"
          >
            <div>
              <div className="text-sm font-medium">{account.displayName}</div>
              <code className="font-mono text-xs text-muted-foreground">
                {account.uid}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {ROLE_LABELS[account.roleId] ?? account.roleId}
              </Badge>
              {!account.isActive && <ToneBadge tone="neutral">Inactive</ToneBadge>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const POLICY_TYPE_LABELS: Record<string, string> = {
  terms_of_service: "Terms of service",
  privacy_policy: "Privacy policy",
  merchant_agreement: "Merchant/washer agreement",
};

/**
 * DSAR/compliance lookup: what this person agreed to and when. Reads
 * userConsents(uid) — the admin-facing twin of the self-service myConsents
 * this account's own app already calls at registration.
 */
function ConsentsTab({ uid }: { uid: string }) {
  const { data, isPending } = useQuery({
    queryKey: ["user-consents", uid],
    queryFn: () => fetchUserConsents(uid),
  });

  if (isPending) return <Skeleton className="h-32 w-full" />;
  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No recorded consents for this account.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y">
      {data.map((consent) => (
        <li key={consent._id} className="flex items-center justify-between gap-3 py-2">
          <div>
            <div className="text-sm font-medium">
              {POLICY_TYPE_LABELS[consent.policyType] ?? consent.policyType}
            </div>
            <div className="text-sm text-muted-foreground">
              v{consent.version} · via {consent.source}
              {consent.locale ? ` · ${consent.locale}` : ""}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {consent.createdAt
              ? new Date(consent.createdAt).toLocaleDateString("en-PH", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "—"}
          </div>
        </li>
      ))}
    </ul>
  );
}

function DevicesTab({ detail }: { detail: DirectoryUserDetail }) {
  if (detail.devices.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No registered devices. Only merchant and staff accounts register
        devices — a customer or courier having none is normal, not a gap.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y">
      {detail.devices.map((device) => (
        <li key={device.deviceId} className="flex flex-col gap-0.5 py-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{device.deviceName}</span>
            <Badge variant="outline">{device.status}</Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            {device.operatingSystem}
            {device.deviceModel ? ` · ${device.deviceModel}` : ""}
            {device.staffName ? ` · ${device.staffName}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode | null;
}) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value ?? "—"}</dd>
    </div>
  );
}
