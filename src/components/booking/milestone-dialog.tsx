"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type {
  BookingMilestone,
  UpsertMilestoneInput,
} from "@/lib/graphql/booking-policy";

/**
 * Milestone editor.
 *
 * A milestone is a RULE, not a badge: nothing here is written to any provider.
 * Changing a threshold re-evaluates every provider's tier on their next read,
 * which is why there is no "apply to existing providers" step and no backfill.
 */

/** Empty means "not part of this milestone's eligibility" — not zero. */
function numOrNull(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const text = (value: number | null | undefined) =>
  value == null ? "" : String(value);

export function MilestoneDialog({
  open,
  onOpenChange,
  milestone,
  submitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null creates a new tier. */
  milestone: BookingMilestone | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: UpsertMilestoneInput) => void;
}) {
  const [key, setKey] = useState(milestone?.key ?? "");
  const [name, setName] = useState(milestone?.name ?? "");
  const [rank, setRank] = useState(String(milestone?.rank ?? 10));
  const [isActive, setIsActive] = useState(milestone?.isActive ?? true);
  const [isDefault, setIsDefault] = useState(milestone?.isDefault ?? false);

  const [minOrders, setMinOrders] = useState(
    text(milestone?.eligibility.minCompletedOrders),
  );
  const [minRating, setMinRating] = useState(
    text(milestone?.eligibility.minRating),
  );
  const [maxCancel, setMaxCancel] = useState(
    text(milestone?.eligibility.maxCancellationRatePercent),
  );
  const [requireVerified, setRequireVerified] = useState(
    milestone?.eligibility.requireVerified ?? false,
  );
  const [requireGoodStanding, setRequireGoodStanding] = useState(
    milestone?.eligibility.requireGoodStanding ?? false,
  );

  const [dailyCapacity, setDailyCapacity] = useState(
    String(milestone?.entitlements.dailyCapacity ?? 10),
  );
  const [advance, setAdvance] = useState(
    String(milestone?.entitlements.advanceBookingDays ?? 14),
  );
  // Not exposed as a control (see the comment further below) — this only
  // round-trips whatever value an existing milestone already has.
  const priority = milestone?.entitlements.priorityBooking ?? false;

  const [localError, setLocalError] = useState<string | null>(null);

  function submit() {
    const slug = key.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setLocalError(
        "The key must be lowercase letters, numbers and dashes — campaigns target it, so it has to be stable.",
      );
      return;
    }
    if (!name.trim()) {
      setLocalError("Give the milestone a name.");
      return;
    }
    setLocalError(null);

    onSubmit({
      key: slug,
      name: name.trim(),
      description: null,
      rank: Number(rank) || 0,
      isDefault,
      isActive,
      eligibility: {
        minCompletedOrders: numOrNull(minOrders),
        minRating: numOrNull(minRating),
        maxCancellationRatePercent: numOrNull(maxCancel),
        requireVerified,
        requireGoodStanding,
      },
      entitlements: {
        dailyCapacity: Number(dailyCapacity) || 0,
        advanceBookingDays: Number(advance) || 0,
        priorityBooking: priority,
      },
    });
  }

  const shown = localError ?? error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {milestone ? `Edit ${milestone.name}` : "Add milestone"}
          </DialogTitle>
          <DialogDescription>
            Providers unlock this automatically when they meet every
            requirement. Nothing is written to their records.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ms-name">Milestone name</Label>
              <Input
                id="ms-name"
                value={name}
                placeholder="Growth"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ms-key">Key</Label>
              <Input
                id="ms-key"
                value={key}
                placeholder="growth"
                disabled={!!milestone}
                onChange={(e) => setKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {milestone
                  ? "Fixed — campaigns target it."
                  : "Lowercase, no spaces."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ms-rank">Rank</Label>
              <Input
                id="ms-rank"
                type="number"
                min={0}
                value={rank}
                onChange={(e) => setRank(e.target.value)}
              />
              {/* Eligibility is multi-signal, so "higher tier" can't be derived
                  from thresholds alone — it's an explicit decision. */}
              <p className="text-xs text-muted-foreground">
                Higher wins when a provider qualifies for several.
              </p>
            </div>
            <div className="flex flex-col justify-end gap-3 pb-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="ms-active">Active</Label>
                <Switch
                  id="ms-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="ms-default">Starting tier</Label>
                <Switch
                  id="ms-default"
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <Label>Eligibility</Label>
            <p className="text-xs text-muted-foreground">
              Leave a field blank to exclude it. Blank is different from zero.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="ms-orders" className="text-xs font-normal">
                  Completed orders ≥
                </Label>
                <Input
                  id="ms-orders"
                  type="number"
                  min={0}
                  value={minOrders}
                  placeholder="—"
                  onChange={(e) => setMinOrders(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ms-rating" className="text-xs font-normal">
                  Rating ≥
                </Label>
                <Input
                  id="ms-rating"
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={minRating}
                  placeholder="—"
                  onChange={(e) => setMinRating(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ms-cancel" className="text-xs font-normal">
                  Cancellations ≤ %
                </Label>
                <Input
                  id="ms-cancel"
                  type="number"
                  min={0}
                  max={100}
                  value={maxCancel}
                  placeholder="—"
                  onChange={(e) => setMaxCancel(e.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-3 text-sm font-normal">
              <Checkbox
                checked={requireVerified}
                onCheckedChange={(v) => setRequireVerified(v === true)}
              />
              Provider must be verified
            </label>
            <label className="flex items-center gap-3 text-sm font-normal">
              <Checkbox
                checked={requireGoodStanding}
                onCheckedChange={(v) => setRequireGoodStanding(v === true)}
              />
              Account must be in good standing
            </label>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <Label>Booking entitlements</Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="ms-daily" className="text-xs font-normal">
                  Daily capacity
                </Label>
                <Input
                  id="ms-daily"
                  type="number"
                  min={0}
                  value={dailyCapacity}
                  onChange={(e) => setDailyCapacity(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ms-advance" className="text-xs font-normal">
                  Advance days
                </Label>
                <Input
                  id="ms-advance"
                  type="number"
                  min={0}
                  value={advance}
                  onChange={(e) => setAdvance(e.target.value)}
                />
              </div>
            </div>

            {/* "Priority booking" is hidden here rather than shown as a live
                toggle: it's stored on entitlements but nothing downstream
                consumes it yet, so surfacing it would let an admin believe it
                does something. `priority` still round-trips whatever value
                an existing milestone already has. */}
          </div>

          {shown && <p className="text-sm text-destructive">{shown}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={submitting} onClick={submit}>
            {submitting ? "Saving…" : "Save milestone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
