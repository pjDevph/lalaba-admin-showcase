"use client";

import Link from "next/link";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { StatusBadge, ToneBadge } from "@/components/ui/status-badge";
import { ActivityTimeline } from "@/components/ui/activity-timeline";
import {
  ATTEMPT_RESPONSIBILITY,
  lookupStatus,
  ORDER_STATUS,
  PAYMENT_STATUS,
} from "@/lib/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can } from "@/components/can";
import { ApiError } from "@/lib/api-client";
import {
  fetchOrder,
  fetchOrderStatusOptions,
  fetchOrderTimeline,
  overrideOrderStatus,
  peso,
  type AttemptEvidence,
  type HandoverProof,
  type LegAssignment,
  type OrderDetail,
} from "@/lib/graphql/orders";
import { StaffName } from "@/components/orders/staff-name";
import {
  ORDER_OVERRIDE_REASONS,
  ReasonCodeDialog,
} from "@/components/ui/reason-code-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// The full read-only view of one order, split out of the Orders page so it can
// back a real /orders/[id] route. It was previously inline state on the list,
// which meant an agent could never send a colleague the order they were
// looking at.
//
// Still deliberately near-read-only: this view cannot accept, advance or
// cancel an order. The single exception is a manual status override, which
// goes through the backend's own transition table and requires a reason code.
//
// See LALABA_BE_DEV's OnlineOrdersService.order() for the authorization it
// relies on — admin/support may view ANY order, not just their own.

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Section({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">{children}</CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
}: Readonly<{ label: string; value: React.ReactNode }>) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

/**
 * Failed pickup/delivery attempts.
 *
 * The backend has recorded these all along and nothing rendered them, so
 * "why wasn't it picked up?" — the question support is actually asked — could
 * not be answered from the panel at all.
 *
 * Responsibility leads each row because it is the part with consequences:
 * customer-caused attempts may carry a fee, provider- and system-caused ones
 * never do.
 */
function AttemptList({
  attempts,
}: Readonly<{ attempts: AttemptEvidence[] }>) {
  if (!attempts.length) return null;

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <span className="text-muted-foreground">
        Failed attempts ({attempts.length})
      </span>
      {attempts.map((attempt) => (
        <div
          key={`${attempt.attemptNumber}-${attempt.timestamp}`}
          className="flex flex-col gap-1 rounded-md border p-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Attempt {attempt.attemptNumber}</span>
            <StatusBadge
              status={attempt.responsibility}
              registry={ATTEMPT_RESPONSIBILITY}
            />
          </div>
          <Row label="When" value={formatDate(attempt.timestamp)} />
          <Row label="By" value={<StaffName uid={attempt.actorUid} />} />
          <Row label="Reason" value={attempt.reason} />
          {attempt.gpsLat != null && attempt.gpsLng != null ? (
            <Row
              label="GPS"
              value={`${attempt.gpsLat.toFixed(5)}, ${attempt.gpsLng.toFixed(5)}`}
            />
          ) : null}
          <Row
            label="Photos"
            value={attempt.photoUrls?.length ? `${attempt.photoUrls.length} captured` : null}
          />
        </div>
      ))}
    </div>
  );
}

function LegSection({
  title,
  leg,
  attempts,
  proof,
}: Readonly<{
  title: string;
  leg: LegAssignment | null;
  attempts: AttemptEvidence[];
  proof: HandoverProof | null;
}>) {
  // A leg with failed attempts but no assignment right now still has to
  // render — that combination is exactly the case support is chasing.
  if (!leg && !attempts.length && !proof) return null;

  return (
    <Section title={title}>
      {leg ? (
        <>
          <Row label="Assigned to" value={<StaffName uid={leg.assignedStaffUid} />} />
          <Row label="Assigned at" value={formatDate(leg.assignedAt)} />
          <Row label="En route at" value={formatDate(leg.enRouteAt)} />
          <Row label="Arrived at" value={formatDate(leg.arrivedAt)} />
          <Row label="Completed at" value={formatDate(leg.completedAt)} />
          {leg.locationLat != null && leg.locationLng != null ? (
            <Row
              label="Last GPS fix"
              value={`${leg.locationLat.toFixed(5)}, ${leg.locationLng.toFixed(5)} (${formatDate(leg.locationAt)})`}
            />
          ) : null}
        </>
      ) : (
        <Row label="Assigned to" value="Nobody assigned" />
      )}

      {proof ? (
        <>
          <Row label="Handover captured" value={formatDate(proof.capturedAt)} />
          <Row label="Captured by" value={<StaffName uid={proof.capturedByUid} />} />
        </>
      ) : null}

      <AttemptList attempts={attempts} />
    </Section>
  );
}

export function OrderDetailView({ orderId }: Readonly<{ orderId: string }>) {
  const {
    data: order,
    isPending: orderPending,
    error: orderError,
  } = useQuery<OrderDetail>({
    queryKey: ["order-detail", orderId],
    queryFn: () => fetchOrder(orderId),
    retry: false,
  });

  const { data: timeline, isPending: timelinePending } = useQuery({
    queryKey: ["order-timeline", orderId],
    queryFn: () => fetchOrderTimeline(orderId),
    enabled: !!order,
  });

  if (orderError) {
    return (
      <p className="text-sm text-destructive">
        {orderError instanceof ApiError
          ? orderError.message
          : "Could not load this order."}
      </p>
    );
  }

  if (orderPending || !order) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title="Status">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} registry={ORDER_STATUS} />
          <StatusBadge status={order.paymentStatus} registry={PAYMENT_STATUS} />
          {order.amountDueCentavos > 0 ? (
            <ToneBadge tone="danger">{peso(order.amountDueCentavos)} due</ToneBadge>
          ) : null}
          <Can capability="order:override">
            <StatusOverride orderId={order._id} currentStatus={order.status} />
          </Can>
        </div>
        {order.orderNumber ? (
          <Row
            label="Order number"
            value={
              <span className="font-mono text-xs font-semibold">
                {order.orderNumber}
              </span>
            }
          />
        ) : null}
        <Row
          label="Order id"
          value={<span className="font-mono text-xs">{order._id}</span>}
        />
        <Row label="Version" value={order.version} />
        <Row label="Created" value={formatDate(order.createdAt)} />
        <Row label="Updated" value={formatDate(order.updatedAt)} />
        <Row label="Completed" value={formatDate(order.completedAt)} />
        <Row label="Cancellation reason" value={order.cancellationReason} />
        <Row label="Rejection reason" value={order.rejectionReason} />
        <Row
          label="Abandonment deadline"
          value={formatDate(order.abandonmentDeadlineAt)}
        />
      </Section>

      <Section title="Customer">
        <Row
          label="Name"
          value={
            // Reachable, not just displayed. An agent reading an order almost
            // always needs the person next — their other orders, their
            // tickets, whether they have called before — and until this link
            // existed the only way there was to copy the name into a
            // different page's search box.
            <Link
              href={`/context/person/${encodeURIComponent(order.customer.uid)}`}
              className="hover:underline"
            >
              {order.customer.displayName}
            </Link>
          }
        />
        <Row
          label="Phone"
          value={order.customer.maskedPhone ?? "hidden (outside active leg window)"}
        />
        <Row
          label="Contact phone"
          value={order.contactPhone ?? "hidden (outside active leg window)"}
        />
        <Row label="Area" value={order.customer.areaLabel} />
        <Row
          label="Address"
          value={
            order.customer.address
              ? [
                  order.customer.address.streetAddress,
                  order.customer.address.barangayName,
                  order.customer.address.cityMunicipalityName,
                  order.customer.address.provinceName,
                ]
                  .filter(Boolean)
                  .join(", ")
              : null
          }
        />
      </Section>

      <Section title="Provider">
        <Row
          label="Name"
          value={
            // A branch, not the owner: "is this shop live, what else is going
            // through it" is the provider-side question, and the branch is
            // what the marketplace actually books.
            <Link
              href={`/context/branch/${encodeURIComponent(order.provider.branchId)}`}
              className="hover:underline"
            >
              {order.provider.providerName}
            </Link>
          }
        />
        <Row label="Type" value={order.provider.providerType} />
        <Row label="Verified" value={order.providerVerified ? "Yes" : "No"} />
        <Row
          label="Branch id"
          value={<span className="font-mono text-xs">{order.provider.branchId}</span>}
        />
        <Row
          label="Pay-at-handover"
          value={
            order.provider.allowsPayAtHandover == null
              ? null
              : order.provider.allowsPayAtHandover
                ? "Allowed"
                : "Not allowed"
          }
        />
      </Section>

      <Section title="Fulfillment">
        <Row label="Pickup mode" value={order.fulfillment.pickupMode} />
        <Row label="Pickup sub-mode" value={order.fulfillment.pickupSubMode} />
        <Row label="Return mode" value={order.fulfillment.returnMode} />
        <Row label="Delivery sub-mode" value={order.fulfillment.deliverySubMode} />
        <Row label="Scheduled pickup" value={order.fulfillment.scheduledPickup?.label} />
        <Row label="Turnaround tier" value={order.turnaround.tierCode} />
        <Row label="Turnaround fee" value={peso(order.turnaround.feeCentavos)} />
        <Row
          label="Promised completion"
          value={formatDate(order.turnaround.promisedCompletionAt)}
        />
        <Row label="Payment timing" value={order.paymentTiming} />
      </Section>

      <Section title="Pricing">
        <Row label="Estimated total" value={peso(order.pricing.estimatedTotalCentavos)} />
        <Row label="Customer total" value={peso(order.pricing.customerTotalCentavos)} />
        <Row label="Service subtotal" value={peso(order.pricing.serviceSubtotalCentavos)} />
        <Row label="Pickup fee" value={peso(order.pricing.pickupFeeCentavos)} />
        <Row label="Return fee" value={peso(order.pricing.returnFeeCentavos)} />
        <Row label="Turnaround fee" value={peso(order.pricing.turnaroundFeeCentavos)} />
        <Row
          label="Platform fee"
          value={
            order.pricing.platformFeeCentavos != null
              ? `${peso(order.pricing.platformFeeCentavos)} (${order.pricing.platformFeePercent ?? "—"}%)`
              : null
          }
        />
        <Row
          label="Platform fee consumed"
          value={peso(order.pricing.platformFeeConsumedCentavos)}
        />
        <Row
          label="Actual weight"
          value={
            order.pricing.actualWeightKg != null
              ? `${order.pricing.actualWeightKg} kg`
              : null
          }
        />
        <Row label="Actual piece count" value={order.pricing.actualPieceCount} />
      </Section>

      <Section title="Payment">
        <Row label="Method" value={order.paymentSummary.method} />
        <Row label="Reference" value={order.paymentSummary.referenceId} />
        <Row
          label="Amount collected"
          value={peso(order.paymentSummary.amountCollectedCentavos)}
        />
        <Row
          label="Collected by"
          value={<StaffName uid={order.paymentSummary.collectedByUid} />}
        />
        <Row label="Collected at" value={formatDate(order.paymentSummary.collectedAt)} />
        <Row label="Tendered" value={peso(order.paymentSummary.tenderedCentavos)} />
        <Row label="Change" value={peso(order.paymentSummary.changeCentavos)} />
      </Section>

      <LegSection
        title="Pickup leg"
        leg={order.pickupAssignment}
        attempts={order.pickupAttempts ?? []}
        proof={order.pickupProof}
      />
      <LegSection
        title="Return leg"
        leg={order.returnAssignment}
        attempts={order.deliveryAttempts ?? []}
        proof={order.returnProof}
      />

      {order.activeQualityHold ? (
        <Section title="Quality hold">
          <Row label="Reason" value={order.activeQualityHold.reason} />
          <Row label="Category" value={order.activeQualityHold.category} />
          <Row
            label="Blocks order"
            value={order.activeQualityHold.blocksOrder ? "Yes" : "No"}
          />
          <Row
            label="Additional charge"
            value={peso(order.activeQualityHold.additionalChargeCentavos)}
          />
          <Row label="Customer response" value={order.activeQualityHold.customerResponse} />
          <Row label="Raised at" value={formatDate(order.activeQualityHold.raisedAt)} />
          <Row label="Respond by" value={formatDate(order.activeQualityHold.respondTimeoutAt)} />
          <Row label="Resolved at" value={formatDate(order.activeQualityHold.resolvedAt)} />
        </Section>
      ) : null}

      <Section title="Instructions">
        <Row label="Pickup" value={order.instructions.pickupInstructions} />
        <Row label="Access" value={order.instructions.accessInstructions} />
        <Row label="Laundry care" value={order.instructions.laundryCareInstructions} />
        <Row label="Return" value={order.instructions.returnInstructions} />
        <Row label="Customer notes" value={order.instructions.customerGeneralNotes} />
        <Row label="Provider notes" value={order.instructions.providerNotes} />
      </Section>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Service lines</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Pricing type</TableHead>
                <TableHead className="text-right">Estimated</TableHead>
                <TableHead className="text-right">Actual</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.serviceLines.map((line) => (
                <TableRow key={line.serviceRefId}>
                  <TableCell>{line.serviceName}</TableCell>
                  <TableCell>{line.pricingType}</TableCell>
                  <TableCell className="text-right">
                    {peso(line.estimatedLineTotalCentavos)}
                  </TableCell>
                  <TableCell className="text-right">
                    {line.actualLineTotalCentavos != null
                      ? peso(line.actualLineTotalCentavos)
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {timelinePending ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <ActivityTimeline
              emptyMessage="No events recorded."
              entries={(timeline ?? []).map((event) => ({
                id: event._id,
                at: event.createdAt,
                // The label is the destination state; the transition arrow
                // moves into the detail line. An admin scanning a 30-row
                // lifecycle reads the right-hand side of every arrow anyway.
                title: lookupStatus(event.toStatus, ORDER_STATUS).label,
                status: event.toStatus,
                statusRegistry: ORDER_STATUS,
                actor: event.actorRole,
                detail:
                  event.note ??
                  (event.fromStatus
                    ? `from ${lookupStatus(event.fromStatus, ORDER_STATUS).label}`
                    : null),
              }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Manual status override ──────────────────────────────────────────────────

/**
 * Move an order by hand.
 *
 * The options come from the BACKEND, never from a local copy of the transition
 * table — a second copy would drift the first time a transition changed, and
 * the failure would be an admin offered a move the server then rejects.
 *
 * A terminal order renders nothing at all rather than a disabled control: an
 * order that cannot be moved is a fact about the order, not a permission
 * problem, and a greyed-out button invites people to go looking for the
 * permission they think they are missing.
 */
function StatusOverride({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: string;
}) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<string | null>(null);

  const { data: options } = useQuery({
    queryKey: ["order-status-options", orderId, currentStatus],
    queryFn: () => fetchOrderStatusOptions(orderId),
  });

  const mutation = useMutation({
    mutationFn: ({ reason, note }: { reason: string; note: string }) =>
      overrideOrderStatus(orderId, target!, reason, note),
    onSuccess: () => {
      toast.success("Order moved.");
      setTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["order-detail", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["order-timeline", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not move this order.",
      ),
  });

  if (!options?.length) return null;

  return (
    <>
      <Select
        items={Object.fromEntries(
          options.map((s) => [s, lookupStatus(s, ORDER_STATUS).label]),
        )}
        value=""
        onValueChange={(value) => value && setTarget(String(value))}
      >
        <SelectTrigger className="h-6 w-[150px] text-xs">
          <SelectValue placeholder="Move to…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((status) => (
            <SelectItem key={status} value={status}>
              {lookupStatus(status, ORDER_STATUS).label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ReasonCodeDialog
        open={target != null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={`Move to ${target ? lookupStatus(target, ORDER_STATUS).label : ""}?`}
        description="Manual moves are for when the app did not do what it should have. This is written to the order's timeline and to the platform audit trail, with your name on it."
        reasons={ORDER_OVERRIDE_REASONS}
        confirmLabel="Move order"
        destructive={false}
        pending={mutation.isPending}
        onConfirm={(reason, note) =>
          // The backend requires a note on an override, so an empty one is
          // sent as the reason's own label rather than failing the call.
          mutation.mutate({
            reason,
            note:
              note ??
              (ORDER_OVERRIDE_REASONS.find((r) => r.code === reason)?.label ??
                reason),
          })
        }
      />
    </>
  );
}
