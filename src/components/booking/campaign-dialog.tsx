"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCampaignImpact,
  phToday,
  type BookingCampaign,
  type BookingMilestone,
  type CampaignModifier,
  type CampaignModifierMode,
  type CampaignScope,
  type ProviderType,
  type UpsertCampaignInput,
} from "@/lib/graphql/booking-policy";

/**
 * Campaign editor — the promo path.
 *
 * A campaign is ONE record that changes what every targeted provider is
 * entitled to for a date range. Modifiers are relative (×2, +7) rather than
 * absolute so a single campaign scales the whole milestone ladder instead of
 * flattening Starter and Pro onto the same number.
 */

type ModifierDraft = {
  enabled: boolean;
  mode: CampaignModifierMode;
  value: string;
};

const draftOf = (m: CampaignModifier | null): ModifierDraft => ({
  enabled: m != null,
  mode: m?.mode ?? "MULTIPLY",
  value: m ? String(m.value) : "2",
});

const toModifier = (d: ModifierDraft): CampaignModifier | null => {
  if (!d.enabled) return null;
  const value = Number(d.value);
  if (!Number.isFinite(value) || value < 0) return null;
  return { mode: d.mode, value };
};

export function CampaignDialog({
  open,
  onOpenChange,
  campaign,
  milestones,
  submitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: BookingCampaign | null;
  milestones: BookingMilestone[];
  submitting: boolean;
  error: string | null;
  onSubmit: (input: UpsertCampaignInput) => void;
}) {
  const [name, setName] = useState(campaign?.name ?? "");
  const [startDate, setStartDate] = useState(campaign?.startDate ?? phToday());
  const [endDate, setEndDate] = useState(campaign?.endDate ?? phToday());
  const [isEnabled, setIsEnabled] = useState(campaign?.isEnabled ?? true);

  const [scope, setScope] = useState<CampaignScope>(
    campaign?.targeting.scope ?? "EVERYONE",
  );
  const [providerType, setProviderType] = useState<ProviderType>(
    campaign?.targeting.providerType ?? "WASHER",
  );
  const [milestoneKeys, setMilestoneKeys] = useState<string[]>(
    campaign?.targeting.milestoneKeys ?? [],
  );

  const [daily, setDaily] = useState(draftOf(campaign?.dailyCapacity ?? null));
  const [advance, setAdvance] = useState(
    draftOf(campaign?.advanceBookingDays ?? null),
  );

  const [localError, setLocalError] = useState<string | null>(null);

  // The "affected providers" figure on the review step. A COUNT — the campaign
  // never touches the records it counts.
  const { data: impact } = useQuery({
    queryKey: ["campaign-impact", scope, providerType, milestoneKeys],
    queryFn: () =>
      getCampaignImpact(
        scope,
        scope === "PROVIDER_TYPE" ? providerType : null,
        scope === "MILESTONE" ? milestoneKeys : undefined,
      ),
    enabled: open,
  });

  function submit() {
    if (!name.trim()) {
      setLocalError("Give the campaign a name.");
      return;
    }
    if (endDate < startDate) {
      setLocalError("The campaign cannot end before it starts.");
      return;
    }
    if (scope === "MILESTONE" && milestoneKeys.length === 0) {
      setLocalError("Pick at least one milestone to target.");
      return;
    }
    setLocalError(null);

    onSubmit({
      id: campaign?._id,
      name: name.trim(),
      description: null,
      startDate,
      endDate,
      isEnabled,
      targeting: {
        scope,
        providerType: scope === "PROVIDER_TYPE" ? providerType : null,
        milestoneKeys: scope === "MILESTONE" ? milestoneKeys : [],
      },
      dailyCapacity: toModifier(daily),
      advanceBookingDays: toModifier(advance),
    });
  }

  const shown = localError ?? error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {campaign ? `Edit ${campaign.name}` : "Create campaign"}
          </DialogTitle>
          <DialogDescription>
            Temporarily change booking entitlements across the platform without
            touching milestone rules or provider records.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cp-name">Campaign name</Label>
            <Input
              id="cp-name"
              value={name}
              placeholder="Laundry Week"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="cp-start">Starts</Label>
              <Input
                id="cp-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <span className="pb-2 text-muted-foreground">→</span>
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="cp-end">Ends</Label>
              <Input
                id="cp-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <Label htmlFor="cp-enabled">Enabled</Label>
              {/* Separate from the dates so a campaign can be built and
                  reviewed days ahead, or killed mid-run without losing it. */}
              <p className="text-xs text-muted-foreground">
                Turn off to hold or stop it without changing the dates.
              </p>
            </div>
            <Switch
              id="cp-enabled"
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
            />
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <Label>Applies to</Label>
            <RadioGroup
              value={scope}
              onValueChange={(v) => v && setScope(v as CampaignScope)}
              className="flex flex-col gap-2"
            >
              <label className="flex items-center gap-3 text-sm font-normal">
                <RadioGroupItem value="EVERYONE" /> Everyone
              </label>
              <label className="flex items-center gap-3 text-sm font-normal">
                <RadioGroupItem value="PROVIDER_TYPE" /> One provider type
              </label>
              <label className="flex items-center gap-3 text-sm font-normal">
                <RadioGroupItem value="MILESTONE" /> Selected milestones
              </label>
            </RadioGroup>

            {scope === "PROVIDER_TYPE" && (
              <Select
                value={providerType}
                onValueChange={(v) => v && setProviderType(v as ProviderType)}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WASHER">Home Washers</SelectItem>
                  <SelectItem value="MERCHANT">Laundromats</SelectItem>
                </SelectContent>
              </Select>
            )}

            {scope === "MILESTONE" && (
              <div className="flex flex-col gap-2">
                {milestones.map((m) => (
                  <label
                    key={m.key}
                    className="flex items-center gap-3 text-sm font-normal"
                  >
                    <Checkbox
                      checked={milestoneKeys.includes(m.key)}
                      onCheckedChange={(v) =>
                        setMilestoneKeys(
                          v === true
                            ? [...milestoneKeys, m.key]
                            : milestoneKeys.filter((k) => k !== m.key),
                        )
                      }
                    />
                    {m.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <Separator />

          <div className="flex flex-col gap-4">
            <Label>Entitlement changes</Label>
            <ModifierRow
              label="Booking capacity"
              draft={daily}
              onChange={setDaily}
              // Capacity is a home-washer concept, so say so rather than let an
              // admin believe a laundromat is being throttled.
              hint="Home washers only — laundromats have no platform cap."
            />
            <ModifierRow
              label="Advance booking window"
              draft={advance}
              onChange={setAdvance}
              hint="Applies to both provider types."
            />
          </div>

          {impact && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="font-medium">
                Affects {impact.total.toLocaleString()} provider
                {impact.total === 1 ? "" : "s"}
                {impact.isEstimate ? " (estimated)" : ""}
              </div>
              <div className="mt-1 text-muted-foreground">
                {impact.washers.toLocaleString()} home washers ·{" "}
                {impact.merchants.toLocaleString()} laundromats
              </div>
              {/* The claim that makes this design legible at a million rows. */}
              <div className="mt-2 text-xs text-muted-foreground">
                No provider records are modified. This campaign is evaluated
                from the platform booking policy.
              </div>
            </div>
          )}

          {shown && <p className="text-sm text-destructive">{shown}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={submitting} onClick={submit}>
            {submitting ? "Saving…" : "Save campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModifierRow({
  label,
  draft,
  onChange,
  hint,
}: {
  label: string;
  draft: ModifierDraft;
  onChange: (next: ModifierDraft) => void;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <Label>{label}</Label>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Switch
          checked={draft.enabled}
          onCheckedChange={(v) => onChange({ ...draft, enabled: v })}
        />
      </div>

      {draft.enabled && (
        <div className="flex items-center gap-2">
          <Select
            value={draft.mode}
            onValueChange={(v) =>
              v && onChange({ ...draft, mode: v as CampaignModifierMode })
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MULTIPLY">Multiply</SelectItem>
              <SelectItem value="INCREASE_BY">Increase by</SelectItem>
              <SelectItem value="REPLACE">Replace</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            step={draft.mode === "MULTIPLY" ? 0.1 : 1}
            value={draft.value}
            onChange={(e) => onChange({ ...draft, value: e.target.value })}
            className="w-28"
          />
          <span className="text-sm text-muted-foreground">
            {draft.mode === "MULTIPLY" ? "×" : draft.mode === "INCREASE_BY" ? "more" : "exactly"}
          </span>
        </div>
      )}
    </div>
  );
}
