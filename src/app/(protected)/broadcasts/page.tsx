"use client";

// Push broadcast console.
//
// A notification on someone's lock screen cannot be recalled, edited or
// deleted. That single fact shapes this whole screen: the reach numbers update
// live as the audience changes, the phone preview shows the actual wording,
// and sending requires typing the recipient count into a confirmation box.
//
// The friction here is deliberate and is NOT the "are you sure?" reflex — it
// is the one place in the panel where an irreversible action reaches thousands
// of people outside the company at once.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SendIcon } from "lucide-react";

import { RequireCapability } from "@/components/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ConsequenceLine } from "@/components/control-room/consequence";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import {
  BODY_MAX,
  BROADCAST_AUDIENCES,
  fetchBroadcastHistory,
  fetchBroadcastPreview,
  sendBroadcast,
  TITLE_MAX,
  type Broadcast,
} from "@/lib/graphql/broadcasts";
import { BROADCAST_STATUS } from "@/lib/status";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export default function BroadcastsPage() {
  return (
    <RequireCapability capability="broadcast:send">
      <BroadcastConsole />
    </RequireCapability>
  );
}

function BroadcastConsole() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Broadcasts</h1>
        <p className="text-sm text-muted-foreground">
          Send a push notification to everyone in a role. There is no undo — a
          notification that has arrived cannot be recalled.
        </p>
      </div>

      <Tabs defaultValue="compose" className="flex flex-1 flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="compose">
          <Composer />
        </TabsContent>
        <TabsContent value="history">
          <History />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Composer() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<string[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Debounced so toggling three audiences on does not fire three counts.
  const debouncedAudience = useDebouncedValue(audience.join(","), 300);

  const preview = useQuery({
    queryKey: ["broadcast-preview", debouncedAudience, includeInactive],
    queryFn: () =>
      fetchBroadcastPreview(debouncedAudience.split(",").filter(Boolean), includeInactive),
    enabled: debouncedAudience.length > 0,
  });

  const mutation = useMutation({
    mutationFn: () =>
      sendBroadcast({
        title: title.trim(),
        body: body.trim(),
        audienceRoleIds: audience,
        includeInactive,
      }),
    onSuccess: (broadcast) => {
      setConfirming(false);
      if (broadcast.status === "NO_RECIPIENTS") {
        // Not a success toast: nobody got it, and saying "sent" here is how
        // the same message gets fired four more times.
        toast.warning(
          "Nobody in that audience has ever opened the app — nothing was delivered.",
        );
      } else if (broadcast.status === "FAILED") {
        toast.error(broadcast.failureReason ?? "The broadcast failed to send.");
      } else {
        toast.success(`Sent to ${broadcast.tokenCount} devices.`);
        setTitle("");
        setBody("");
        setAudience([]);
      }
      void queryClient.invalidateQueries({ queryKey: ["broadcast-history"] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not send this broadcast.",
      ),
  });

  const reachable = preview.data?.reachableCount ?? 0;
  const canSend =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    audience.length > 0 &&
    title.length <= TITLE_MAX &&
    body.length <= BODY_MAX &&
    reachable > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message</CardTitle>
          <CardDescription>
            Keep it short. Both fields are truncated on the device before they
            are truncated here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="broadcast-title">Title</Label>
              <CharCount value={title.length} max={TITLE_MAX} />
            </div>
            <Input
              id="broadcast-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Scheduled maintenance tonight"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="broadcast-body">Message</Label>
              <CharCount value={body.length} max={BODY_MAX} />
            </div>
            <Textarea
              id="broadcast-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Lalaba will be unavailable from 11pm to 1am while we update the app."
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Audience</Label>
            <div className="flex flex-wrap gap-1.5">
              {BROADCAST_AUDIENCES.map((option) => {
                const on = audience.includes(option.id);
                return (
                  <Button
                    key={option.id}
                    size="sm"
                    variant={on ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    aria-pressed={on}
                    onClick={() =>
                      setAudience((prev) =>
                        on
                          ? prev.filter((r) => r !== option.id)
                          : [...prev, option.id],
                      )
                    }
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
            {/* No "everyone" button. Selecting every role is a deliberate
                sequence of clicks rather than one, because the difference
                between "customers" and "everyone" is thousands of people. */}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <Label htmlFor="include-inactive">
                Include deactivated accounts
              </Label>
              <p className="text-xs text-muted-foreground">
                Off by default — a deactivated account should not be marketed
                to.
              </p>
            </div>
            <Switch
              id="include-inactive"
              checked={includeInactive}
              onCheckedChange={setIncludeInactive}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reach</CardTitle>
            <CardDescription>
              Who this actually lands on, right now.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {audience.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Pick an audience to see how many people it reaches.
              </p>
            ) : preview.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <Metric
                    label="In audience"
                    value={preview.data?.audienceCount ?? 0}
                  />
                  <Metric label="Reachable" value={reachable} emphasis />
                  <Metric
                    label="Devices"
                    value={preview.data?.tokenCount ?? 0}
                  />
                </div>
                {/* The gap between these two is the thing worth saying out
                    loud — "we told all our customers" is usually false. */}
                <p className="text-xs text-muted-foreground">
                  {(preview.data?.audienceCount ?? 0) - reachable} of{" "}
                  {preview.data?.audienceCount ?? 0} have never opened the app
                  and cannot receive a push.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Shown the way it arrives, so wording is judged in context
                rather than in a form field. */}
            <div className="rounded-xl border bg-muted/40 p-3 shadow-sm">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Lalaba · now
              </div>
              <div className="text-sm font-semibold">
                {title.trim() || "Title"}
              </div>
              <div className="text-sm text-muted-foreground">
                {body.trim() || "Your message will appear here."}
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          size="lg"
          disabled={!canSend || mutation.isPending}
          onClick={() => setConfirming(true)}
        >
          <SendIcon />
          {mutation.isPending
            ? "Sending…"
            : `Send to ${reachable} ${reachable === 1 ? "person" : "people"}`}
        </Button>
      </div>

      {/* Typed confirmation — the one genuinely irreversible, outward-facing
          action in the panel, and the only place this component is used. The
          number is the phrase because it is the fact most worth re-reading. */}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Send this broadcast?"
        description={
          // Every number here is the server's — broadcastPreview counts the
          // audience, who among them has ever opened the app, and how many
          // devices are registered. A count derived in the browser from a page
          // of results would be a guess presented as a fact, which is the one
          // thing this panel's highest-blast-radius action cannot afford.
          <ConsequenceLine
            consequence={{
              headline: `This sends a push notification to ${reachable} ${
                reachable === 1 ? "person" : "people"
              }, immediately.`,
              facts: [
                {
                  label: "In audience",
                  value: String(preview.data?.audienceCount ?? 0),
                },
                { label: "Have ever opened the app", value: String(reachable) },
                {
                  label: "Registered devices",
                  value: String(preview.data?.tokenCount ?? 0),
                },
              ],
              unaffected: [
                "People in these roles who have never opened the app receive nothing.",
              ],
              irreversible: true,
            }}
          />
        }
        confirmPhrase={String(reachable)}
        confirmPhraseHint={
          <>
            Type <span className="font-mono font-semibold">{reachable}</span> to
            confirm the number of people this reaches
          </>
        }
        confirmLabel="Send now"
        onConfirm={() => mutation.mutate()}
      />
    </div>
  );
}

function CharCount({ value, max }: { value: number; max: number }) {
  const over = value > max;
  return (
    <span
      className={
        over
          ? "text-xs font-medium text-[var(--status-danger)]"
          : "text-xs text-muted-foreground"
      }
    >
      {value}/{max}
    </span>
  );
}

function Metric({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-lg border p-2">
      <div
        className={
          emphasis
            ? "text-2xl font-semibold tabular-nums"
            : "text-2xl font-semibold tabular-nums text-muted-foreground"
        }
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function History() {
  const { data, isPending } = useQuery({
    queryKey: ["broadcast-history"],
    queryFn: () => fetchBroadcastHistory(25, 0),
  });

  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (!data?.data.length) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-lg border text-sm text-muted-foreground">
        Nothing has been broadcast yet.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {data.data.map((broadcast) => (
        <li key={broadcast._id}>
          <HistoryCard broadcast={broadcast} />
        </li>
      ))}
    </ul>
  );
}

function HistoryCard({ broadcast }: { broadcast: Broadcast }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="font-medium">{broadcast.title}</div>
        <StatusBadge status={broadcast.status} registry={BROADCAST_STATUS} />
      </div>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
        {broadcast.body}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {broadcast.audienceRoleIds.map((role) => (
          <Badge key={role} variant="outline">
            {BROADCAST_AUDIENCES.find((a) => a.id === role)?.label ?? role}
          </Badge>
        ))}
        {broadcast.includedInactive && (
          <Badge variant="secondary">incl. deactivated</Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {broadcast.tokenCount} device{broadcast.tokenCount === 1 ? "" : "s"} ·{" "}
        {broadcast.audienceCount} account
        {broadcast.audienceCount === 1 ? "" : "s"} · sent by{" "}
        {broadcast.sentByName} ·{" "}
        {broadcast.createdAt
          ? new Date(broadcast.createdAt).toLocaleString("en-PH")
          : "—"}
        {broadcast.deadTokenCount > 0 &&
          ` · ${broadcast.deadTokenCount} dead token${
            broadcast.deadTokenCount === 1 ? "" : "s"
          } pruned`}
      </div>
      {broadcast.failureReason && (
        <p className="text-xs text-[var(--status-danger)]">
          {broadcast.failureReason}
        </p>
      )}
    </div>
  );
}
