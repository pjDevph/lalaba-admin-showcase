"use client";

/**
 * THE OPERATIONAL CONTEXT — one subject, everything about them, one address.
 *
 * This is the page the omnibox exists to reach. Before it, the same person was
 * four separate lookups: the account directory, the order search, the ticket
 * inbox and the chat list, none of them linked. An agent on a call spent the
 * first minute of it assembling by hand what this assembles in one query.
 *
 * TWO GATES, ON PURPOSE.
 *
 * The backend decides what it will SERVE — every module is authorized on its
 * own there, and `modules` reports what it actually assembled. This page
 * additionally gates on the panel's own capability map, which is what governs
 * what it OFFERS. They agree today and are maintained separately by design:
 * the capability layer is an affordance layer and the backend is the boundary,
 * so the page must not render a section whose data the server would refuse,
 * and must not offer an action the capability map says this operator lacks.
 *
 * A module absent from `modules` is NOT rendered as empty. "You may not see a
 * wallet" and "this subject has no wallet" are the same shape in the payload
 * and opposite in meaning; showing ₱0.00 to a support agent who is simply not
 * allowed to look would be a lie the page told on its own initiative.
 */

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { RequireCapability, useCan } from "@/components/can";
import { ORDER_STATUS, TICKET_STATUS } from "@/lib/status";
import { peso } from "@/lib/graphql/wallets";
import {
  ROLE_LABELS,
  fetchOperationalContext,
  type ContextModuleKey,
  type ContextSubjectType,
  type OperationalContext,
} from "@/lib/graphql/operational-context";
import type { Capability } from "@/lib/capabilities";

/**
 * Backend module → the capability this panel requires to render it.
 *
 * Mirrors lib/modules.ts, which is what capability-coverage.test.ts checks
 * against the backend's own guards.
 */
const MODULE_CAPABILITY: Record<ContextModuleKey, Capability | null> = {
  IDENTITY: null,
  ORDERS: "order:read",
  TICKETS: "ticket:read",
  WALLET: "wallet:read",
  KYC: "kyc:review",
  BRANCHES: "provider:read",
  STAFF: "account:read",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-PH", { dateStyle: "medium" });
}

export default function ContextPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = use(params);
  const subjectType = type.toUpperCase();

  // Only two subject types exist. Anything else is a hand-edited URL, and a
  // 404 is a truer answer than an empty page.
  if (subjectType !== "PERSON" && subjectType !== "BRANCH") notFound();

  return (
    // account:read is the floor: this page is a directory lookup before it is
    // anything else, and every module inside gates again on its own.
    <RequireCapability capability="account:read">
      <ContextWorkspace subjectType={subjectType} id={id} />
    </RequireCapability>
  );
}

function ContextWorkspace({
  subjectType,
  id,
}: {
  subjectType: ContextSubjectType;
  id: string;
}) {
  const { can } = useCan();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["operational-context", subjectType, id],
    queryFn: () => fetchOperationalContext(subjectType, id),
  });

  if (isPending) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-1 flex-col gap-2 p-4 md:p-6">
        <h1 className="text-xl font-semibold">Could not open this record</h1>
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Please try again."}
        </p>
      </div>
    );
  }

  // Both gates, ANDed. See the note at the top of this file.
  const shows = (module: ContextModuleKey) => {
    if (!data.modules.includes(module)) return false;
    const capability = MODULE_CAPABILITY[module];
    return capability === null || can(capability);
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <IdentityHeader context={data} />

      <div className="grid gap-4 @4xl/main:grid-cols-2">
        {shows("ORDERS") && data.orders && <OrdersCard orders={data.orders} />}
        {shows("TICKETS") && data.tickets && (
          <TicketsCard tickets={data.tickets} />
        )}
        {shows("WALLET") && data.wallet && <WalletCard wallet={data.wallet} />}
        {shows("KYC") && data.kyc && <KycCard kyc={data.kyc} />}
        {shows("BRANCHES") && data.branches && (
          <BranchesCard branches={data.branches} />
        )}
        {shows("STAFF") && data.staff && <StaffCard staff={data.staff} />}
      </div>
    </div>
  );
}

function IdentityHeader({ context }: { context: OperationalContext }) {
  const { identity } = context;
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{identity.displayName}</h1>
          <Badge variant={identity.isActive ? "default" : "destructive"}>
            {identity.isActive ? "Active" : "Inactive"}
          </Badge>
          {identity.roleId && (
            <Badge variant="outline">
              {ROLE_LABELS[identity.roleId] ?? identity.roleId}
            </Badge>
          )}
          {context.subjectType === "BRANCH" && (
            <Badge variant="outline">Branch</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {[identity.phone, identity.email].filter(Boolean).join(" · ") || "—"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {/* The id stays on screen: it is the thing an agent escalates with,
              and the thing that makes this URL shareable. */}
          <code>{identity.id}</code>
          {identity.joinedAt && ` · joined ${formatDate(identity.joinedAt)}`}
        </p>
      </div>
    </div>
  );
}

function OrdersCard({
  orders,
}: {
  orders: NonNullable<OperationalContext["orders"]>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Orders</CardTitle>
        <CardDescription>
          {orders.total} total · {orders.open} still in flight
          {orders.outstandingCentavos > 0 && (
            // Unpaid money is the reason support opens most records, so it is
            // stated here rather than left to be worked out per row.
            <span className="mt-1 block text-[var(--status-danger)]">
              {peso(orders.outstandingCentavos)} outstanding
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {orders.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          orders.recent.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm hover:bg-accent"
            >
              <div className="min-w-0">
                <div className="font-medium">
                  {order.orderNumber ?? order.id.slice(-6)}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {order.counterpartyName} · {formatDate(order.createdAt)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums">{peso(order.totalCentavos)}</span>
                <StatusBadge status={order.status} registry={ORDER_STATUS} />
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function TicketsCard({
  tickets,
}: {
  tickets: NonNullable<OperationalContext["tickets"]>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Support tickets</CardTitle>
        <CardDescription>
          {tickets.total} total · {tickets.open} open
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {tickets.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            They have never raised one.
          </p>
        ) : (
          tickets.recent.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/tickets?ticket=${encodeURIComponent(ticket.id)}`}
              className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm hover:bg-accent"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{ticket.subject}</div>
                <div className="text-xs text-muted-foreground">
                  {ticket.ticketNumber ?? "—"} · {formatDate(ticket.createdAt)}
                </div>
              </div>
              <StatusBadge status={ticket.status} registry={TICKET_STATUS} />
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function WalletCard({
  wallet,
}: {
  wallet: NonNullable<OperationalContext["wallet"]>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Wallet</CardTitle>
        <CardDescription>
          Prepaid balance. There is no withdrawal path — the wallet is
          consumable by design.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="text-2xl font-semibold tabular-nums">
          {peso(wallet.balanceCentavos)}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Badge variant={wallet.activated ? "default" : "secondary"}>
            {wallet.activated ? "Activated" : "Not activated"}
          </Badge>
          <Link href="/wallets" className="text-xs hover:underline">
            Open in Wallets
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function KycCard({ kyc }: { kyc: NonNullable<OperationalContext["kyc"]> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verification</CardTitle>
        <CardDescription>
          {kyc.approved} approved · {kyc.submitted} awaiting review ·{" "}
          {kyc.rejected} rejected
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {kyc.documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"
          >
            <span>{doc.documentType.replaceAll("_", " ").toLowerCase()}</span>
            <Badge variant="outline">{doc.status.toLowerCase()}</Badge>
          </div>
        ))}
        <Link href="/verifications" className="text-xs hover:underline">
          Open the review queue
        </Link>
      </CardContent>
    </Card>
  );
}

function BranchesCard({
  branches,
}: {
  branches: NonNullable<OperationalContext["branches"]>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Branches</CardTitle>
        <CardDescription>
          {/* A home washer has exactly one, and it is an anchor rather than a
              location — so this never offers to add another. */}
          {branches.length === 1
            ? "One bookable branch."
            : `${branches.length} bookable branches.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {branches.map((branch) => (
          <Link
            key={branch.id}
            href={`/context/branch/${branch.id}`}
            className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm hover:bg-accent"
          >
            <span>{branch.branchName}</span>
            <Badge variant={branch.isActive ? "default" : "secondary"}>
              {branch.isActive ? "Active" : "Inactive"}
            </Badge>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function StaffCard({
  staff,
}: {
  staff: NonNullable<OperationalContext["staff"]>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff</CardTitle>
        <CardDescription>
          {staff.length} account{staff.length === 1 ? "" : "s"}. Permissions are
          granted per branch, in the merchant app.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {staff.map((member) => (
          <Link
            key={member.id}
            href={`/context/person/${member.id}`}
            className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm hover:bg-accent"
          >
            <div className="min-w-0">
              <div className="truncate">{member.displayName}</div>
              {member.email && (
                <div className="truncate text-xs text-muted-foreground">
                  {member.email}
                </div>
              )}
            </div>
            <Badge variant={member.isActive ? "default" : "secondary"}>
              {member.isActive ? "Active" : "Inactive"}
            </Badge>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
