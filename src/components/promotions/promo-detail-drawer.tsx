"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Can } from "@/components/can";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DetailDrawer } from "@/components/ui/detail-drawer";
import { ReasonCodeDialog, PROMO_REDEMPTION_REASONS } from "@/components/ui/reason-code-dialog";
import { PROMO_STATUS } from "@/lib/status";
import {
  PROMO_AUDIENCES,
  fetchPromoUsageSummary,
  type PromoCode,
} from "@/lib/graphql/promotions";

function peso(centavos: number) {
  return `₱${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type PromoDetailDrawerProps = {
  promo: PromoCode | null;
  status: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (promo: PromoCode) => void;
  onToggleActive: (promo: PromoCode) => void;
  toggling: boolean;
  onRedeem: (
    promo: PromoCode,
    args: { customerUid: string; orderTotalCentavos: number; reason: string },
  ) => void;
  redeeming: boolean;
};

export function PromoDetailDrawer({
  promo,
  status,
  onOpenChange,
  onEdit,
  onToggleActive,
  toggling,
  onRedeem,
  redeeming,
}: PromoDetailDrawerProps) {
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [customerUid, setCustomerUid] = useState("");
  const [orderTotal, setOrderTotal] = useState("");

  const { data: summary, isPending } = useQuery({
    queryKey: ["promo-usage-summary", promo?._id],
    queryFn: () => fetchPromoUsageSummary(promo!._id),
    enabled: !!promo,
  });

  if (!promo) {
    return (
      <DetailDrawer
        open={false}
        onOpenChange={onOpenChange}
        title=""
      />
    );
  }

  const audienceLabels = promo.targetRoleIds
    .map((id) => PROMO_AUDIENCES.find((a) => a.id === id)?.label ?? id)
    .join(", ");

  return (
    <>
      <DetailDrawer
        open={!!promo}
        onOpenChange={onOpenChange}
        entityId={promo._id}
        title={promo.code}
        subtitle={promo.description}
        status={status ?? undefined}
        statusRegistry={PROMO_STATUS}
        actions={
          <Can capability="promo:manage">
            <Button variant="outline" size="sm" onClick={() => onEdit(promo)}>
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={toggling}
              onClick={() => setConfirmToggle(true)}
            >
              {promo.isActive ? "Disable" : "Enable"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRedeemOpen(true)}>
              Record redemption
            </Button>
          </Can>
        }
      >
        <div className="flex flex-col gap-6 p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Discount</div>
              <div className="font-medium">
                {promo.discountType === "FLAT"
                  ? peso(promo.discountValue * 100)
                  : `${promo.discountValue}%${
                      promo.maxDiscountCentavos
                        ? ` (max ${peso(promo.maxDiscountCentavos)})`
                        : ""
                    }`}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Minimum order</div>
              <div className="font-medium">
                {promo.minOrderValueCentavos ? peso(promo.minOrderValueCentavos) : "None"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Audience</div>
              <div className="font-medium">{audienceLabels || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">First order only</div>
              <div className="font-medium">{promo.firstOrderOnly ? "Yes" : "No"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Uses per customer</div>
              <div className="font-medium">{promo.usageCapPerCustomer}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total cap</div>
              <div className="font-medium">
                {promo.usageCapTotal
                  ? `${promo.redemptionCount} / ${promo.usageCapTotal}`
                  : `${promo.redemptionCount} (no cap)`}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Starts</div>
              <div className="font-medium">{formatDate(promo.startsAt)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Expires</div>
              <div className="font-medium">{formatDate(promo.expiresAt)}</div>
            </div>
            <div className="col-span-2">
              <div className="text-muted-foreground">Created by</div>
              <div className="font-medium">
                {promo.createdByName} · {formatDate(promo.createdAt)}
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="mb-2 text-sm font-medium">Usage</h3>
            {isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : summary ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Redemptions</div>
                    <div className="text-lg font-semibold tabular-nums">
                      {summary.totalRedemptions}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Unique customers</div>
                    <div className="text-lg font-semibold tabular-nums">
                      {summary.uniqueCustomers}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total discounted</div>
                    <div className="text-lg font-semibold tabular-nums">
                      {peso(summary.totalDiscountCentavos)}
                    </div>
                  </div>
                </div>

                {/* Should always render empty — see the field's own doc
                    comment on the backend. A row here means the increment
                    guard was bypassed somewhere, not that a customer cheated. */}
                {summary.overCapCustomers.length > 0 && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
                    <div className="font-medium text-destructive">
                      Integrity check failed
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {summary.overCapCustomers.length} customer(s) have more
                      redemptions on record than the per-customer cap allows.
                      This should never happen through normal use — investigate
                      before trusting this code&apos;s numbers.
                    </p>
                  </div>
                )}

                {summary.recentRedemptions.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <div className="text-sm text-muted-foreground">
                      Recent redemptions
                    </div>
                    <div className="flex flex-col divide-y rounded-md border">
                      {summary.recentRedemptions.map((r) => (
                        <div
                          key={r._id}
                          className="flex items-center justify-between p-2 text-sm"
                        >
                          <div>
                            <div className="font-medium">{r.customerName}</div>
                            <div className="text-muted-foreground">
                              {formatDate(r.createdAt)}
                            </div>
                          </div>
                          <div className="tabular-nums">
                            {peso(r.discountAppliedCentavos)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No redemptions yet.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </DetailDrawer>

      <ConfirmDialog
        open={confirmToggle}
        onOpenChange={setConfirmToggle}
        title={promo.isActive ? "Disable this code?" : "Enable this code?"}
        description={
          promo.isActive
            ? `"${promo.code}" stops working immediately. Redemptions already recorded are not affected.`
            : `"${promo.code}" starts working again for eligible customers.`
        }
        confirmLabel={promo.isActive ? "Disable" : "Enable"}
        onConfirm={() => {
          onToggleActive(promo);
          setConfirmToggle(false);
        }}
      />

      <ReasonCodeDialog
        open={redeemOpen}
        onOpenChange={(open) => {
          setRedeemOpen(open);
          if (!open) {
            setCustomerUid("");
            setOrderTotal("");
          }
        }}
        title="Record a manual redemption"
        description="There is no live checkout flow yet — this applies the discount by hand and re-runs every eligibility check as if the customer had entered the code themselves."
        reasons={PROMO_REDEMPTION_REASONS}
        confirmLabel="Record redemption"
        destructive={false}
        pending={redeeming}
        notice={
          <div className="flex flex-col gap-2">
            <input
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              placeholder="Customer UID"
              value={customerUid}
              onChange={(e) => setCustomerUid(e.target.value)}
            />
            <input
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              placeholder="Order total (₱)"
              type="number"
              min={0}
              value={orderTotal}
              onChange={(e) => setOrderTotal(e.target.value)}
            />
          </div>
        }
        onConfirm={(reasonCode, note) => {
          if (!customerUid.trim() || !orderTotal.trim()) return;
          onRedeem(promo, {
            customerUid: customerUid.trim(),
            orderTotalCentavos: Math.round(Number(orderTotal) * 100),
            reason: note ? `${reasonCode}: ${note}` : reasonCode,
          });
          setRedeemOpen(false);
        }}
      />
    </>
  );
}
