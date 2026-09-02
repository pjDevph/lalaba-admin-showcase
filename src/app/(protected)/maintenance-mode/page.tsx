"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RequireCapability } from "@/components/can";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ConsequenceLine } from "@/components/control-room/consequence";
import { MaintenancePreviewDialog } from "@/components/maintenance/maintenance-preview";
import {
  configProblems,
  saveImpact,
  type ConfigState,
} from "@/lib/maintenance-impact";
import { ApiError } from "@/lib/api-client";
import {
  getMaintenanceConfig,
  updateMaintenanceConfig,
  type MaintenanceAppState,
  type MaintenanceMode,
  type UpdateMaintenanceAppStateInput,
  type UpdateMaintenanceConfigInput,
} from "@/lib/graphql/maintenance";

/**
 * Platform-wide maintenance kill switch. Two independently-targetable apps
 * (Customer, Partner/Washer) plus a Global Emergency override. No draft/
 * publish/version flow here — Save takes effect immediately, same as every
 * other config page in this panel.
 */

type Draft = {
  globalEmergencyActive: boolean;
  globalEmergencyMessage: string;
  customerApp: AppDraft;
  partnerApp: AppDraft;
  supportEmail: string;
  supportPhone: string;
  bypassUidsText: string;
};

type AppDraft = {
  active: boolean;
  mode: MaintenanceMode;
  message: string;
  // Split date/time strings for the native <Input type="date"/"time">
  // pickers — the same composition pattern campaign-dialog.tsx and Booking
  // Policy's same-day cutoff already use, combined to/from ISO on save/load.
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

/**
 * SHORT labels, for the trigger only.
 *
 * The items spell the behaviour out in full — "Emergency — immediate hard
 * block" — which is right where there is room to read it and wrong in a 224px
 * trigger, where it truncated to "Emergency — immediate har". The trigger
 * needs the name; the list explains it.
 */
const MAINTENANCE_MODE_LABELS: Record<string, string> = {
  EMERGENCY: "Emergency",
  SCHEDULED: "Scheduled",
};

function isoToParts(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function partsToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function appStateToDraft(state: MaintenanceAppState): AppDraft {
  const start = isoToParts(state.scheduledStart);
  const end = isoToParts(state.scheduledEnd);
  return {
    active: state.active,
    mode: state.mode,
    message: state.message ?? "",
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
  };
}

function draftToAppStateInput(draft: AppDraft): UpdateMaintenanceAppStateInput {
  return {
    active: draft.active,
    mode: draft.mode,
    message: draft.message.trim() || null,
    scheduledStart: partsToIso(draft.startDate, draft.startTime),
    scheduledEnd: partsToIso(draft.endDate, draft.endTime),
  };
}

function AppStateCard({
  title,
  description,
  draft,
  onChange,
}: {
  title: string;
  description: string;
  draft: AppDraft;
  onChange: (next: AppDraft) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {draft.active && (
              <Badge variant="destructive">
                {draft.mode === "EMERGENCY" ? "Emergency" : "Scheduled"}
              </Badge>
            )}
            <Switch
              checked={draft.active}
              onCheckedChange={(active) => onChange({ ...draft, active })}
              aria-label={`${title} maintenance active`}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Type</Label>
          <Select
            value={draft.mode}
            onValueChange={(mode) => {
              if (mode) onChange({ ...draft, mode });
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue labels={MAINTENANCE_MODE_LABELS} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EMERGENCY">
                Emergency — immediate hard block
              </SelectItem>
              <SelectItem value="SCHEDULED">
                Scheduled — blocks only during the window below
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {draft.mode === "SCHEDULED" && (
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-2">
              <Label>Starts</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) =>
                    onChange({ ...draft, startDate: e.target.value })
                  }
                />
                <Input
                  type="time"
                  value={draft.startTime}
                  onChange={(e) =>
                    onChange({ ...draft, startTime: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Ends</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={draft.endDate}
                  onChange={(e) =>
                    onChange({ ...draft, endDate: e.target.value })
                  }
                />
                <Input
                  type="time"
                  value={draft.endTime}
                  onChange={(e) =>
                    onChange({ ...draft, endTime: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label>Message</Label>
          <Textarea
            value={draft.message}
            onChange={(e) => onChange({ ...draft, message: e.target.value })}
            placeholder="e.g. Lalaba is undergoing scheduled maintenance to improve our service. We expect to be back online at 4:00 PM today."
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function configToDraft(config: ConfigState): Draft {
  return {
    globalEmergencyActive: config.globalEmergencyActive,
    globalEmergencyMessage: config.globalEmergencyMessage ?? "",
    customerApp: appStateToDraft(config.customerApp),
    partnerApp: appStateToDraft(config.partnerApp),
    supportEmail: config.supportEmail ?? "",
    supportPhone: config.supportPhone ?? "",
    bypassUidsText: config.bypassUids.join("\n"),
  };
}

/**
 * The draft, in the same shape the backend stores — so the impact rules and
 * the previews read exactly what will be sent, not a second interpretation of
 * the form. Anything derived from the form for display MUST go through here.
 */
function draftToConfigState(draft: Draft): ConfigState {
  return {
    globalEmergencyActive: draft.globalEmergencyActive,
    globalEmergencyMessage: draft.globalEmergencyMessage.trim() || null,
    customerApp: appDraftToState(draft.customerApp),
    partnerApp: appDraftToState(draft.partnerApp),
    supportEmail: draft.supportEmail.trim() || null,
    supportPhone: draft.supportPhone.trim() || null,
    bypassUids: parseBypassUids(draft.bypassUidsText),
  };
}

/** The input shape has optional fields; the stored shape does not. */
function appDraftToState(draft: AppDraft): MaintenanceAppState {
  const input = draftToAppStateInput(draft);
  return {
    active: input.active,
    mode: input.mode,
    message: input.message ?? null,
    scheduledStart: input.scheduledStart ?? null,
    scheduledEnd: input.scheduledEnd ?? null,
  };
}

/** One per line, commas also accepted — as the field's own hint promises. */
function parseBypassUids(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function MaintenanceModePage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: ["maintenance-config"],
    queryFn: getMaintenanceConfig,
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Derived during render, not in an effect: the escape hatch React's own
  // docs recommend for "seed local edit state from a query result the first
  // time it arrives" — a same-render setState call here is a safe bail-out,
  // not a cascading-render effect.
  if (data && !draft) setDraft(configToDraft(data));

  const isDirty = useMemo(() => {
    if (!data || !draft) return false;
    return JSON.stringify(configToDraft(data)) !== JSON.stringify(draft);
  }, [data, draft]);

  // Recomputed on every keystroke rather than at click time, so the dialog can
  // never describe a draft that has moved on since.
  const impact = useMemo(() => {
    if (!data || !draft) return null;
    return saveImpact(
      { ...data, bypassUids: data.bypassUids },
      draftToConfigState(draft),
    );
  }, [data, draft]);

  const saveMutation = useMutation({
    mutationFn: (input: UpdateMaintenanceConfigInput) =>
      updateMaintenanceConfig(input),
    onSuccess: (saved) => {
      toast.success("Maintenance settings saved.");
      setDraft(configToDraft(saved));
      void queryClient.invalidateQueries({ queryKey: ["maintenance-config"] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not save maintenance settings.",
      ),
  });

  if (isPending || !draft) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <h1 className="text-xl font-semibold">Maintenance Mode</h1>
        <p className="text-sm text-muted-foreground">
          {isError ? "Failed to load maintenance settings." : "Loading…"}
        </p>
      </div>
    );
  }

  /**
   * Nothing here saves on the first click.
   *
   * This page is the only one in the panel that can stop the whole business,
   * and its form does not read as such — three toggles compose into an outcome
   * that is genuinely hard to predict. So a click validates, then states the
   * outcome in words, and only a second, deliberate confirmation writes it.
   */
  function handleSave() {
    if (!draft) return;
    const problems = configProblems(draftToConfigState(draft));
    if (problems.length > 0) {
      // The first one, not all of them: fix, re-click, see the next. A stack
      // of five toasts is read as noise and dismissed as a group.
      toast.error(problems[0].message);
      return;
    }
    setConfirmOpen(true);
  }

  function commitSave() {
    if (!draft) return;
    setConfirmOpen(false);
    saveMutation.mutate({
      globalEmergencyActive: draft.globalEmergencyActive,
      globalEmergencyMessage: draft.globalEmergencyMessage.trim() || null,
      customerApp: draftToAppStateInput(draft.customerApp),
      partnerApp: draftToAppStateInput(draft.partnerApp),
      supportEmail: draft.supportEmail.trim() || null,
      supportPhone: draft.supportPhone.trim() || null,
      bypassUids: parseBypassUids(draft.bypassUidsText),
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Maintenance Mode</h1>
          <p className="text-sm text-muted-foreground">
            Block the Customer app and/or the Partner/Washer app (merchant,
            staff, washer, courier) while work is in progress. Emergency blocks
            the moment you save and stays until you turn it off. Scheduled
            blocks <strong>only between its start and end</strong> — set both,
            or it blocks nobody — and shows a live countdown while it runs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPreviewOpen(true)}>
            Preview
          </Button>
          <Button disabled={!isDirty || saveMutation.isPending} onClick={handleSave}>
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <Card className="border-destructive/50">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-destructive">
                Global Emergency Mode
              </CardTitle>
              <CardDescription>
                Master override — immediately blocks BOTH apps as Emergency
                with this message, regardless of their own settings below.
              </CardDescription>
            </div>
            <Switch
              checked={draft.globalEmergencyActive}
              onCheckedChange={(globalEmergencyActive) =>
                setDraft({ ...draft, globalEmergencyActive })
              }
              aria-label="Global emergency mode active"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={draft.globalEmergencyMessage}
            onChange={(e) =>
              setDraft({ ...draft, globalEmergencyMessage: e.target.value })
            }
            placeholder="e.g. Our system is experiencing a temporary emergency shutdown. For active order emergencies only, contact +1-800-LALABA-HELP."
            rows={3}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <AppStateCard
          title="Customer App"
          description="iOS / Android"
          draft={draft.customerApp}
          onChange={(customerApp) => setDraft({ ...draft, customerApp })}
        />
        <AppStateCard
          title="Partner/Washer App"
          description="iOS / Android — merchant, staff, washer, courier"
          draft={draft.partnerApp}
          onChange={(partnerApp) => setDraft({ ...draft, partnerApp })}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Support contact</CardTitle>
          <CardDescription>
            Shown on the maintenance screen in both apps as a tappable email
            and call button. Set it here rather than typing it into a message —
            a contact buried in a paragraph cannot be tapped, and the message
            is written in a hurry while something is on fire.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="support-email">Email</Label>
            <Input
              id="support-email"
              type="email"
              value={draft.supportEmail}
              onChange={(e) =>
                setDraft({ ...draft, supportEmail: e.target.value })
              }
              placeholder="support@lalaba.ph"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="support-phone">Phone</Label>
            <Input
              id="support-phone"
              type="tel"
              value={draft.supportPhone}
              onChange={(e) =>
                setDraft({ ...draft, supportPhone: e.target.value })
              }
              placeholder="+63 900 000 0000"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bypass accounts</CardTitle>
          <CardDescription>
            Account UIDs (not emails — the backend matches on Firebase uid)
            exempt from every block above, for testing during an active
            window. One per line (commas also accepted).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={draft.bypassUidsText}
            onChange={(e) =>
              setDraft({ ...draft, bypassUidsText: e.target.value })
            }
            placeholder={"Zl4wVLdHVKxebwPhmgY6Roq0FiAK"}
            rows={3}
          />
        </CardContent>
      </Card>

      <MaintenancePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        config={draftToConfigState(draft)}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          impact?.globalEmergencyTurningOn
            ? "Turn on Global Emergency Mode?"
            : impact?.blocksAnyone
              ? "Block people from the apps?"
              : "Apply maintenance changes?"
        }
        description={<MaintenanceImpactSummary impact={impact} />}
        confirmLabel={impact?.blocksAnyone ? "Block now" : "Apply"}
        onConfirm={commitSave}
      />
    </div>
  );
}

/**
 * The 318-line impact calculation, rendered through the shared Consequence
 * component.
 *
 * It used to be bespoke JSX here. The calculation stays exactly where it was —
 * lib/maintenance-impact.ts, a deliberate mirror of the backend's
 * effectiveStateForRole — and only its PRESENTATION moved, so every Control
 * Room action now states its reach in the same shape.
 *
 * The unaffected apps are still stated. "Partner app is not blocked, and will
 * not be" is the line that catches an admin who believed they were pausing
 * everything and had switched one of two.
 */
function MaintenanceImpactSummary({
  impact,
}: {
  impact: ReturnType<typeof saveImpact> | null;
}) {
  if (!impact) return null;

  const headline = impact.globalEmergencyTurningOn
    ? "The master override goes on: both apps are blocked at once, whatever their own settings say."
    : impact.globalEmergencyTurningOff
      ? "The master override goes off. Each app falls back to its own setting."
      : impact.blocksAnyone
        ? "This blocks people from using an app."
        : "This changes maintenance settings without blocking anyone.";

  return (
    <ConsequenceLine
      consequence={{
        headline,
        effects: impact.apps.map((app) => ({
          text: app.sentence,
          severity:
            app.severity === "blocking"
              ? "blocking"
              : app.severity === "pending"
                ? "warning"
                : "neutral",
        })),
        unaffected: [
          impact.bypassCount === 0
            ? "No bypass accounts — nobody, including you, can use the apps while blocked. The admin panel is never blocked."
            : `${impact.bypassCount} bypass ${
                impact.bypassCount === 1 ? "account" : "accounts"
              } can still use the apps.`,
        ],
      }}
    />
  );
}

export default function MaintenanceModePageGuard() {
  return (
    <RequireCapability capability="maintenance:toggle">
      <MaintenanceModePage />
    </RequireCapability>
  );
}
