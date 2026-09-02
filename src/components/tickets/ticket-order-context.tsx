"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { StatusBadge, ToneBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { StaffName } from "@/components/orders/staff-name";
import { ApiError } from "@/lib/api-client";
import {
  ATTEMPT_RESPONSIBILITY,
  ORDER_STATUS,
  PAYMENT_STATUS,
} from "@/lib/status";
import {
  fetchOrder,
  peso,
  type AttemptEvidence,
  type OrderDetail,
} from "@/lib/graphql/orders";

// The order a ticket is ABOUT, inside the ticket.
//
// The Details tab used to show the ticket's own metadata and a bare 24-char
// order id, which meant the commonest ticket we get — "my laundry came back
// missing something" — could not be investigated without leaving the drawer,
// looking the order up by hand, and losing the conversation.
//
// Everything here is already on the order query. The one thing deliberately
// NOT here is the handover photographs: `handoverProofUrls` returns an empty
// array to anyone who is not the customer, the provider, or the courier who
// captured them, because those frames show a private address. Support sees
// that a proof was captured, by whom and when — not the image. Widening that
// is a privacy decision for the business, not a missing feature.

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Row({
  label,
  value,
}: Readonly<{ label: string; value: React.ReactNode }>) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function Block({
  title,
  hint,
  children,
}: Readonly<{ title: string; hint?: string; children: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-1 border-t py-3 first:border-t-0">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </span>
        {hint ? (
          <span className="text-xs text-muted-foreground">— {hint}</span>
        ) : null}
      </div>
      <div className="flex flex-col text-sm">{children}</div>
    </div>
  );
}

function AttemptRows({
  title,
  attempts,
}: Readonly<{ title: string; attempts: AttemptEvidence[] }>) {
  if (!attempts.length) return null;
  return (
    <>
      {attempts.map((attempt) => (
        <div
          key={`${title}-${attempt.attemptNumber}-${attempt.timestamp}`}
          className="mt-1 flex flex-col gap-1 rounded-md border p-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">
              {title} attempt {attempt.attemptNumber}
            </span>
            <StatusBadge
              status={attempt.responsibility}
              registry={ATTEMPT_RESPONSIBILITY}
            />
          </div>
          <Row label="When" value={formatDate(attempt.timestamp)} />
          <Row label="By" value={<StaffName uid={attempt.actorUid} />} />
          <Row label="Reason" value={attempt.reason} />
          <Row
            label="Photos"
            value={
              attempt.photoUrls?.length
                ? `${attempt.photoUrls.length} captured`
                : null
            }
          />
        </div>
      ))}
    </>
  );
}

export function TicketOrderContext({
  orderId,
}: Readonly<{ orderId: string }>) {
  const {
    data: order,
    isPending,
    error,
  } = useQuery<OrderDetail>({
    queryKey: ["order-detail", orderId],
    queryFn: () => fetchOrder(orderId),
    retry: false,
  });

  if (isPending) return <Skeleton className="h-40 w-full" />;

  if (error || !order) {
    return (
      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        {error instanceof ApiError
          ? error.message
          : "Could not load the linked order."}
        <div className="mt-1 font-mono text-xs">{orderId}</div>
      </div>
    );
  }

  const hold = order.activeQualityHold;
  const pickupAttempts = order.pickupAttempts ?? [];
  const deliveryAttempts = order.deliveryAttempts ?? [];
  const noEvidence =
    !order.pickupProof &&
    !order.returnProof &&
    !hold &&
    !pickupAttempts.length &&
    !deliveryAttempts.length;

  return (
    <div className="flex flex-col rounded-lg border p-3">
      <Block title="Order">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold">
            {order.orderNumber ?? order._id}
          </span>
          <StatusBadge status={order.status} registry={ORDER_STATUS} />
          <StatusBadge status={order.paymentStatus} registry={PAYMENT_STATUS} />
          {order.amountDueCentavos > 0 ? (
            <ToneBadge tone="danger">
              {peso(order.amountDueCentavos)} due
            </ToneBadge>
          ) : null}
        </div>
        <Row label="Placed" value={formatDate(order.createdAt)} />
        <Row label="Completed" value={formatDate(order.completedAt)} />
        <Row
          label="Promised by"
          value={formatDate(order.turnaround.promisedCompletionAt)}
        />
        <Link
          href={`/orders/${order._id}`}
          className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-2 self-start`}
        >
          Open full order
        </Link>
      </Block>

      <Block title="Parties">
        <Row label="Customer" value={order.customer.displayName} />
        <Row
          label="Phone"
          value={
            order.customer.maskedPhone ?? "hidden (outside active leg window)"
          }
        />
        <Row
          label="Provider"
          value={
            <>
              {order.provider.providerName}{" "}
              <span className="text-muted-foreground">
                ({order.provider.providerType === "WASHER"
                  ? "Home washer"
                  : "Laundromat"})
              </span>
            </>
          }
        />
        <Row
          label="Courier · pickup"
          value={
            order.pickupAssignment?.assignedStaffUid ? (
              <StaffName uid={order.pickupAssignment.assignedStaffUid} />
            ) : (
              "Nobody assigned"
            )
          }
        />
        <Row
          label="Courier · return"
          value={
            order.returnAssignment?.assignedStaffUid ? (
              <StaffName uid={order.returnAssignment.assignedStaffUid} />
            ) : (
              "Nobody assigned"
            )
          }
        />
      </Block>

      <Block title="Weight & count" hint="billing variance, not loss detection">
        <Row
          label="Estimated at booking"
          value={
            order.pricing.estimatedWeightKg != null
              ? `${order.pricing.estimatedWeightKg} kg`
              : null
          }
        />
        <Row
          label="Actual weigh-in"
          value={
            order.pricing.actualWeightKg != null
              ? `${order.pricing.actualWeightKg} kg`
              : "Not weighed yet"
          }
        />
        <Row label="Actual piece count" value={order.pricing.actualPieceCount} />
      </Block>

      <Block
        title="Evidence"
        hint="handover photos are withheld from support by design"
      >
        {noEvidence ? (
          <span className="text-muted-foreground">
            Nothing captured on this order.
          </span>
        ) : null}

        {order.pickupProof ? (
          <>
            <Row
              label="Pickup handover"
              value={formatDate(order.pickupProof.capturedAt)}
            />
            <Row
              label="Captured by"
              value={<StaffName uid={order.pickupProof.capturedByUid} />}
            />
          </>
        ) : null}

        {order.returnProof ? (
          <>
            <Row
              label="Return handover"
              value={formatDate(order.returnProof.capturedAt)}
            />
            <Row
              label="Captured by"
              value={<StaffName uid={order.returnProof.capturedByUid} />}
            />
          </>
        ) : null}

        {hold ? (
          <div className="mt-1 flex flex-col gap-1 rounded-md border p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">Quality hold</span>
              {hold.blocksOrder ? (
                <ToneBadge tone="danger">Blocks order</ToneBadge>
              ) : (
                <ToneBadge tone="neutral">Documentary</ToneBadge>
              )}
            </div>
            <Row label="Reason" value={hold.reason} />
            <Row label="Category" value={hold.category} />
            <Row
              label="Extra charge"
              value={
                hold.additionalChargeCentavos != null
                  ? peso(hold.additionalChargeCentavos)
                  : null
              }
            />
            <Row label="Customer response" value={hold.customerResponse} />
            <Row label="Raised" value={formatDate(hold.raisedAt)} />
            <Row label="Respond by" value={formatDate(hold.respondTimeoutAt)} />
            <Row
              label="Photos"
              value={
                hold.photoUrls?.length
                  ? `${hold.photoUrls.length} captured`
                  : null
              }
            />
          </div>
        ) : null}

        <AttemptRows title="Pickup" attempts={pickupAttempts} />
        <AttemptRows title="Delivery" attempts={deliveryAttempts} />
      </Block>

      <Block title="Money">
        <Row
          label="Estimated total"
          value={peso(order.pricing.estimatedTotalCentavos)}
        />
        <Row
          label="Customer total"
          value={peso(order.pricing.customerTotalCentavos)}
        />
        <Row
          label="Platform fee"
          value={
            order.pricing.platformFeeCentavos != null
              ? `${peso(order.pricing.platformFeeCentavos)} (${order.pricing.platformFeePercent ?? "—"}%)`
              : null
          }
        />
        <Row label="Method" value={order.paymentSummary.method} />
        <Row
          label="Collected"
          value={peso(order.paymentSummary.amountCollectedCentavos)}
        />
        <Row
          label="Collected by"
          value={<StaffName uid={order.paymentSummary.collectedByUid} />}
        />
      </Block>
    </div>
  );
}
