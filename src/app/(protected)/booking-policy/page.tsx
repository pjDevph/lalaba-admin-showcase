"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HistoryIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CampaignDialog } from "@/components/booking/campaign-dialog";
import { MilestoneDialog } from "@/components/booking/milestone-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RequireCapability } from "@/components/can";
import { useCan } from "@/components/can";
import { ApiError } from "@/lib/api-client";
import { PolicyHistoryDialog } from "@/components/booking/policy-history-dialog";
import { PublishDialog } from "@/components/control-room/publish-dialog";
import { diffConfig } from "@/components/control-room/config-diff";
import {
  ADVANCE_DAY_OPTIONS,
  DAY_LABELS,
  LEAD_TIME_OPTIONS,
  WEEK_ORDER,
  campaignStatus,
  describeModifier,
  describeUniversalDay,
  formatTime12,
  getBookingPolicy,
  listBookingCampaigns,
  listBookingMilestones,
  phToday,
  publishBookingPolicy,
  removeBookingCampaign,
  removeBookingMilestone,
  simulatePolicy,
  upsertBookingCampaign,
  upsertBookingMilestone,
  type BookingCampaign,
  type BookingMilestone,
  type BookingPolicy,
  type DayKey,
  type PolicyDefaults,
  type PolicySafetyLimits,
  type ProviderType,
  type UniversalWeek,
  type UpsertCampaignInput,
  type UpsertMilestoneInput,
} from "@/lib/graphql/booking-policy";

/**
 * BOOKING POLICY — the platform's universal booking rules.
 *
 * There is no provider selector on this page, deliberately. Everything here is
 * ONE record evaluated against every provider:
 *
 *   policy defaults → milestone unlocked → live campaigns → safety ceiling
 *
 * A provider's own schedule ("when am I available?") lives in the partner app,
 * not here. This page answers the different question: "what is a provider
 * allowed to do?"
 */

type Draft = {
  enabled: boolean;
  defaults: PolicyDefaults;
  universalDays: UniversalWeek;
  safetyLimits: PolicySafetyLimits;
};

const draftOf = (p: BookingPolicy): Draft => ({
  enabled: p.enabled,
  defaults: { ...p.defaults },
  universalDays: p.universalDays,
  safetyLimits: { ...p.safetyLimits },
});

/** Strips __typename so the fetched shape can be posted back as an input. */
function clean<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (k, v) => (k === "__typename" ? undefined : v)),
  ) as T;
}

function BookingPolicyPage() {
  const { can } = useCan();
  const isAdmin = can("booking_policy:manage");

  if (!isAdmin) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <h1 className="text-xl font-semibold">Booking Policy</h1>
        <p className="text-sm text-muted-foreground">
          Only administrators can configure the booking policy.
        </p>
      </div>
    );
  }

  return <PolicyEditor />;
}

export default function BookingPolicyPageGuard() {
  return (
    <RequireCapability capability="booking_policy:manage">
      <BookingPolicyPage />
    </RequireCapability>
  );
}

function PolicyEditor() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dayOpen, setDayOpen] = useState<DayKey | null>(null);

  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] =
    useState<BookingMilestone | null>(null);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);

  const [campaignOpen, setCampaignOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] =
    useState<BookingCampaign | null>(null);

  const [removingMilestone, setRemovingMilestone] =
    useState<BookingMilestone | null>(null);
  const [removingCampaign, setRemovingCampaign] =
    useState<BookingCampaign | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);

  const [simTier, setSimTier] = useState<string>("");
  const [simType, setSimType] = useState<ProviderType>("WASHER");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  // Set only by a restore, so the publish dialog can pre-fill a note that says
  // where these numbers came from. Cleared once the publish lands.
  const [restoredFrom, setRestoredFrom] = useState<number | null>(null);

  const { data: policy, isPending } = useQuery({
    queryKey: ["booking-policy"],
    queryFn: getBookingPolicy,
  });
  const { data: milestones } = useQuery({
    queryKey: ["booking-milestones"],
    queryFn: listBookingMilestones,
  });
  const { data: campaigns } = useQuery({
    queryKey: ["booking-campaigns"],
    queryFn: listBookingCampaigns,
  });

  // Seeded from the first policy that arrives, during render. A later refetch
  // must not overwrite it — that would discard edits in progress.
  if (policy && draft === null) setDraft(draftOf(policy));

  const isDirty = useMemo(() => {
    if (!policy || !draft) return false;
    return JSON.stringify(draftOf(policy)) !== JSON.stringify(draft);
  }, [policy, draft]);

  // Field-by-field, so the change note is written beside the evidence rather
  // than from memory — see components/control-room/config-diff.ts.
  const changes = useMemo(
    () => (policy && draft ? diffConfig(draftOf(policy), draft) : []),
    [policy, draft],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["booking-policy"] });
    void queryClient.invalidateQueries({ queryKey: ["policy-simulation"] });
  }

  const publishMutation = useMutation({
    mutationFn: (changeNote: string | undefined) =>
      publishBookingPolicy({
        enabled: draft!.enabled,
        defaults: clean(draft!.defaults),
        universalDays: clean(draft!.universalDays),
        safetyLimits: clean(draft!.safetyLimits),
        changeNote,
      }),
    onSuccess: (saved) => {
      toast.success(`Booking policy published as version ${saved.version}.`);
      setDraft(draftOf(saved));
      setPublishOpen(false);
      setRestoredFrom(null);
      void queryClient.invalidateQueries({
        queryKey: ["booking-policy-history"],
      });
      invalidate();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not save the policy.",
      ),
  });

  const milestoneMutation = useMutation({
    mutationFn: (input: UpsertMilestoneInput) => upsertBookingMilestone(input),
    onSuccess: (saved) => {
      toast.success(`${saved.name} saved.`);
      setMilestoneOpen(false);
      setEditingMilestone(null);
      setMilestoneError(null);
      void queryClient.invalidateQueries({ queryKey: ["booking-milestones"] });
      invalidate();
    },
    onError: (err) =>
      setMilestoneError(
        err instanceof ApiError ? err.message : "Could not save the milestone.",
      ),
  });

  const removeMilestoneMutation = useMutation({
    mutationFn: (key: string) => removeBookingMilestone(key),
    onSuccess: () => {
      toast.success("Milestone removed.");
      setRemovingMilestone(null);
      void queryClient.invalidateQueries({ queryKey: ["booking-milestones"] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not remove it.",
      ),
  });

  const campaignMutation = useMutation({
    mutationFn: (input: UpsertCampaignInput) => upsertBookingCampaign(input),
    onSuccess: (saved) => {
      toast.success(`${saved.name} saved.`);
      setCampaignOpen(false);
      setEditingCampaign(null);
      setCampaignError(null);
      void queryClient.invalidateQueries({ queryKey: ["booking-campaigns"] });
      invalidate();
    },
    onError: (err) =>
      setCampaignError(
        err instanceof ApiError ? err.message : "Could not save the campaign.",
      ),
  });

  const removeCampaignMutation = useMutation({
    mutationFn: (id: string) => removeBookingCampaign(id),
    onSuccess: () => {
      toast.success("Campaign removed.");
      setRemovingCampaign(null);
      void queryClient.invalidateQueries({ queryKey: ["booking-campaigns"] });
      invalidate();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not remove it.",
      ),
  });

  const { data: simulation } = useQuery({
    queryKey: ["policy-simulation", simType, simTier],
    queryFn: () =>
      simulatePolicy({
        providerType: simType,
        milestoneKey: simTier || null,
      }),
  });

  if (isPending || !draft || !policy) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <h1 className="text-xl font-semibold">Booking Policy</h1>
        <p className="text-sm text-muted-foreground">Loading policy…</p>
      </div>
    );
  }

  const setDefaults = (patch: Partial<PolicyDefaults>) =>
    setDraft({ ...draft, defaults: { ...draft.defaults, ...patch } });
  const setSafety = (patch: Partial<PolicySafetyLimits>) =>
    setDraft({ ...draft, safetyLimits: { ...draft.safetyLimits, ...patch } });

  const today = phToday();

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Booking Policy</h1>
        <p className="text-sm text-muted-foreground">
          Universal booking rules, milestones and campaigns. One record, applied
          to every provider — nothing is written per provider.
        </p>
      </div>

      {/* ── STATUS BANNER ────────────────────────────────────────────────── */}
      <div
        className={
          "flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 " +
          (draft.enabled
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-destructive/40 bg-destructive/10")
        }
      >
        <div className="flex items-center gap-3">
          <Switch
            id="pol-enabled"
            checked={draft.enabled}
            onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
          />
          <div>
            <Label htmlFor="pol-enabled" className="text-sm font-medium">
              {draft.enabled
                ? "System live — new bookings accepted"
                : "Bookings paused platform-wide"}
            </Label>
            <p className="text-xs text-muted-foreground">
              Off stops scheduled bookings across the entire platform.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-muted-foreground">
              Unsaved changes
            </span>
          )}
          <Badge variant={draft.enabled ? "default" : "secondary"}>
            {draft.enabled ? "LIVE" : "PAUSED"}
          </Badge>
          <Button variant="outline" onClick={() => setHistoryOpen(true)}>
            <HistoryIcon />
            History
          </Button>
          <Button
            disabled={!isDirty || publishMutation.isPending}
            onClick={() => setPublishOpen(true)}
          >
            {publishMutation.isPending ? "Publishing…" : "Save changes"}
          </Button>
        </div>
      </div>

      <PolicyHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        liveVersion={policy?.version}
        onRestore={(restored) => {
          // Loads the values into the editor and leaves the publish to the
          // admin: versions are monotonic, so putting an old policy back is a
          // new publish like any other, not a revival of an archived row.
          setDraft(draftOf(restored));
          setRestoredFrom(restored.version);
          setHistoryOpen(false);
          toast.info(
            `Loaded version ${restored.version}. Review it, then save to publish it as a new version.`,
          );
        }}
      />
      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publish booking policy"
        description="One record, evaluated against every provider. This takes effect immediately and writes a new version — the current one is archived, not overwritten."
        changes={changes}
        consequence={{
          headline:
            "These rules are evaluated against every provider on the platform, from the moment you publish.",
          effects: [
            {
              text: draft.enabled
                ? "Scheduled bookings continue to be accepted."
                : "Scheduled bookings stop platform-wide.",
              severity: draft.enabled ? "neutral" : "blocking",
            },
          ],
          unaffected: [
            // The half a prose warning always omits, and the one an admin
            // most often assumes wrongly.
            "Bookings already placed keep the rules they were made under.",
            "Each provider's own schedule is hers, and is not changed by this.",
          ],
        }}
        pending={publishMutation.isPending}
        defaultNote={
          restoredFrom != null
            ? `Restored version ${restoredFrom}`
            : undefined
        }
        onConfirm={(changeNote) => publishMutation.mutate(changeNote)}
      />

      {/* ── CAPACITY, WINDOWS & SAME-DAY ─────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Capacity & limits</CardTitle>
            <CardDescription>Orders per day for home washers.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <NumberField
              id="base-capacity"
              label="Base daily capacity"
              hint="Starting tier, before any milestone."
              value={draft.defaults.dailyCapacity}
              max={draft.safetyLimits.dailyCapacity}
              onChange={(v) => setDefaults({ dailyCapacity: v })}
            />
            <NumberField
              id="safe-daily"
              label="Platform safety limit (hard cap)"
              hint="Nothing can exceed this, including ×N campaigns."
              value={draft.safetyLimits.dailyCapacity}
              min={1}
              onChange={(v) => setSafety({ dailyCapacity: v })}
            />
            <NumberField
              id="safe-radius"
              label="Max service radius (km)"
              hint="Farthest a home washer may set her own delivery radius."
              value={draft.safetyLimits.maxServiceRadiusKm}
              min={1}
              onChange={(v) => setSafety({ maxServiceRadiusKm: v })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Booking windows & lead times</CardTitle>
            <CardDescription>Governs laundromats too.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Maximum advance window</Label>
              <Select
                value={String(draft.defaults.advanceBookingDays)}
                onValueChange={(v) =>
                  v && setDefaults({ advanceBookingDays: Number(v) })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADVANCE_DAY_OPTIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} days
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Minimum booking notice</Label>
              <Select
                value={String(draft.defaults.leadTimeMinutes)}
                onValueChange={(v) =>
                  v && setDefaults({ leadTimeMinutes: Number(v) })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_TIME_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <NumberField
              id="safe-advance"
              label="Safety ceiling (days)"
              hint="The absolute max any milestone/campaign may extend to."
              value={draft.safetyLimits.advanceBookingDays}
              min={1}
              onChange={(v) => setSafety({ advanceBookingDays: v })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Same-day booking rule</CardTitle>
            <CardDescription>Cutoff for today&apos;s bookings.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="same-day">Same-day booking</Label>
              <Switch
                id="same-day"
                checked={draft.defaults.sameDayBookingEnabled}
                onCheckedChange={(v) =>
                  setDefaults({ sameDayBookingEnabled: v })
                }
              />
            </div>
            {draft.defaults.sameDayBookingEnabled && (
              <>
                <div className="flex flex-col gap-2">
                  <Label>Cutoff time</Label>
                  <Input
                    type="time"
                    value={draft.defaults.sameDayCutoffTime}
                    onChange={(e) =>
                      setDefaults({ sameDayCutoffTime: e.target.value })
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  No new same-day bookings after{" "}
                  {formatTime12(draft.defaults.sameDayCutoffTime)}.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── UNIVERSAL BOOKING DAYS ──────────────────────────────────────── */}
      {/* Hidden for now — not needed yet. The data/editor sheet underneath is
          untouched, so this is a quick uncomment away from coming back. */}
      {false && (
        <Card>
          <CardHeader>
            <CardTitle>Universal booking days</CardTitle>
            <CardDescription>
              The widest window a provider may open on each day. Providers
              choose their own hours inside this — they can never open outside
              it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Maximum booking window</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {WEEK_ORDER.map((key) => {
                  const day = draft!.universalDays[key];
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium">
                        {DAY_LABELS[key]}
                      </TableCell>
                      <TableCell>
                        {day.isOpen ? (
                          <Badge variant="outline">ON</Badge>
                        ) : (
                          <Badge variant="secondary">Closed</Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {describeUniversalDay(day)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDayOpen(key)}
                        >
                          Configure
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── MILESTONES ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Milestone entitlements</CardTitle>
              <CardDescription>
                Home washers unlock greater capacity automatically as they meet
                these requirements. Tiers are evaluated, never assigned.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setEditingMilestone(null);
                setMilestoneError(null);
                setMilestoneOpen(true);
              }}
            >
              Add milestone
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(milestones ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No milestones yet — every washer gets the global defaults above.
            </p>
          ) : (
            (milestones ?? []).map((m) => (
              <div
                key={m.key}
                className="flex flex-wrap items-center justify-between gap-4 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium uppercase">{m.name}</span>
                    {m.isDefault && <Badge variant="secondary">Default</Badge>}
                    {!m.isActive && <Badge variant="outline">Inactive</Badge>}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {describeEligibility(m)}
                  </div>
                  <div className="mt-1 text-sm">
                    {m.entitlements.dailyCapacity}/day ·{" "}
                    {m.entitlements.advanceBookingDays}-day advance
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${m.name}`}
                    onClick={() => {
                      setEditingMilestone(m);
                      setMilestoneError(null);
                      setMilestoneOpen(true);
                    }}
                  >
                    <PencilIcon className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${m.name}`}
                    disabled={removeMilestoneMutation.isPending}
                    onClick={() => setRemovingMilestone(m)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── CAMPAIGNS ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Booking campaigns</CardTitle>
              <CardDescription>
                Temporarily modify entitlements platform-wide without changing
                permanent milestone rules.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setEditingCampaign(null);
                setCampaignError(null);
                setCampaignOpen(true);
              }}
            >
              Create campaign
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(campaigns ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No campaigns. Entitlements follow the milestones above.
            </p>
          ) : (
            (campaigns ?? []).map((c) => (
              <div
                key={c._id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium uppercase">{c.name}</span>
                    <Badge
                      variant={
                        campaignStatus(c, today) === "Live"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {campaignStatus(c, today)}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {c.startDate} – {c.endDate} · {describeScope(c)}
                  </div>
                  <div className="mt-1 text-sm">
                    Capacity {describeModifier(c.dailyCapacity)} · Advance{" "}
                    {describeModifier(c.advanceBookingDays)}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${c.name}`}
                    onClick={() => {
                      setEditingCampaign(c);
                      setCampaignError(null);
                      setCampaignOpen(true);
                    }}
                  >
                    <PencilIcon className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${c.name}`}
                    disabled={removeCampaignMutation.isPending}
                    onClick={() => setRemovingCampaign(c)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── SIMULATOR ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Policy simulator</CardTitle>
          <CardDescription>
            What a provider actually gets, computed by the same code the booking
            path runs. Reflects the PUBLISHED policy.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <Select
              value={simType}
              onValueChange={(v) => v && setSimType(v as ProviderType)}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WASHER">Home Washer</SelectItem>
                <SelectItem value="MERCHANT">Laundromat</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={simTier || "none"}
              onValueChange={(v) => setSimTier(!v || v === "none" ? "" : v)}
              disabled={simType === "MERCHANT"}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Starting tier</SelectItem>
                {(milestones ?? [])
                  .filter((m) => !m.isDefault)
                  .map((m) => (
                    <SelectItem key={m.key} value={m.key}>
                      {m.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {simulation && (
            <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
              {simulation.entitlement.steps.map((s, i) => (
                <div
                  key={`${s.label}-${i}`}
                  className="flex items-center justify-between"
                >
                  <span className="text-muted-foreground">{s.label}</span>
                  <span>
                    {s.dailyCapacity == null
                      ? "No cap"
                      : `${s.dailyCapacity}/day`}
                  </span>
                </div>
              ))}
              <Separator />
              <div className="flex items-center justify-between font-medium">
                <span>Effective daily capacity</span>
                <span>
                  {simulation.entitlement.dailyCapacity == null
                    ? "No platform cap"
                    : `${simulation.entitlement.dailyCapacity} bookings`}
                </span>
              </div>
              {simulation.entitlement.cappedBySafetyLimit && (
                <p className="text-xs text-amber-600">
                  Trimmed by a platform safety limit.
                </p>
              )}
              {simulation.entitlement.appliedCampaignNames.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Active campaigns:{" "}
                  {simulation.entitlement.appliedCampaignNames.join(", ")}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <UniversalDaySheet
        dayKey={dayOpen}
        week={draft.universalDays}
        onClose={() => setDayOpen(null)}
        onChange={(week) => setDraft({ ...draft, universalDays: week })}
      />

      {milestoneOpen && (
        <MilestoneDialog
          key={editingMilestone?.key ?? "new"}
          open={milestoneOpen}
          onOpenChange={setMilestoneOpen}
          milestone={editingMilestone}
          submitting={milestoneMutation.isPending}
          error={milestoneError}
          onSubmit={(input) => milestoneMutation.mutate(input)}
        />
      )}

      {campaignOpen && (
        <CampaignDialog
          key={editingCampaign?._id ?? "new"}
          open={campaignOpen}
          onOpenChange={setCampaignOpen}
          campaign={editingCampaign}
          milestones={milestones ?? []}
          submitting={campaignMutation.isPending}
          error={campaignError}
          onSubmit={(input) => campaignMutation.mutate(input)}
        />
      )}

      <ConfirmDialog
        open={!!removingMilestone}
        onOpenChange={(open) => !open && setRemovingMilestone(null)}
        title="Remove milestone?"
        description={`This deletes "${removingMilestone?.name}" and its entitlements. Providers who qualified for it fall back to the next milestone they meet.`}
        confirmLabel={
          removeMilestoneMutation.isPending ? "Removing…" : "Remove"
        }
        onConfirm={() => {
          if (removingMilestone) {
            removeMilestoneMutation.mutate(removingMilestone.key);
          }
        }}
      />

      <ConfirmDialog
        open={!!removingCampaign}
        onOpenChange={(open) => !open && setRemovingCampaign(null)}
        title="Remove campaign?"
        description={`This deletes "${removingCampaign?.name}". Entitlements immediately revert to the milestones above for its scope.`}
        confirmLabel={removeCampaignMutation.isPending ? "Removing…" : "Remove"}
        onConfirm={() => {
          if (removingCampaign) {
            removeCampaignMutation.mutate(removingCampaign._id);
          }
        }}
      />
    </div>
  );
}

function NumberField({
  id,
  label,
  hint,
  value,
  min = 0,
  max,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Editor for one universal weekday's maximum window. */
function UniversalDaySheet({
  dayKey,
  week,
  onClose,
  onChange,
}: {
  dayKey: DayKey | null;
  week: UniversalWeek;
  onClose: () => void;
  onChange: (week: UniversalWeek) => void;
}) {
  if (!dayKey) return null;
  const day = week[dayKey];
  const window = day.windows[0] ?? { start: "06:00", end: "22:00" };

  const update = (patch: Partial<typeof day>) =>
    onChange({ ...week, [dayKey]: { ...day, ...patch } });

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-6 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{DAY_LABELS[dayKey]}</SheetTitle>
          <SheetDescription>
            The widest window any provider may open on {DAY_LABELS[dayKey]}s.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="ud-open">Bookings allowed</Label>
            <Switch
              id="ud-open"
              checked={day.isOpen}
              onCheckedChange={(v) =>
                update({ isOpen: v, windows: v ? [window] : [] })
              }
            />
          </div>

          {day.isOpen && (
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={window.start}
                onChange={(e) =>
                  update({ windows: [{ ...window, start: e.target.value }] })
                }
              />
              <span className="text-muted-foreground">—</span>
              <Input
                type="time"
                value={window.end}
                onChange={(e) =>
                  update({ windows: [{ ...window, end: e.target.value }] })
                }
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Changes take effect when you publish the policy.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function describeEligibility(m: BookingMilestone): string {
  const e = m.eligibility;
  const parts: string[] = [];
  if (e.minCompletedOrders != null) {
    parts.push(`${e.minCompletedOrders}+ completed orders`);
  }
  if (e.minRating != null) parts.push(`Rating ≥ ${e.minRating}`);
  if (e.maxCancellationRatePercent != null) {
    parts.push(`Cancellations ≤ ${e.maxCancellationRatePercent}%`);
  }
  if (e.requireVerified) parts.push("Verified");
  if (e.requireGoodStanding) parts.push("Good standing");
  return parts.length > 0 ? parts.join(" · ") : "No requirements";
}

function describeScope(c: BookingCampaign): string {
  if (c.targeting.scope === "EVERYONE") return "Everyone";
  if (c.targeting.scope === "PROVIDER_TYPE") {
    return c.targeting.providerType === "WASHER"
      ? "Home washers"
      : "Laundromats";
  }
  return `Milestones: ${c.targeting.milestoneKeys.join(", ") || "none"}`;
}
