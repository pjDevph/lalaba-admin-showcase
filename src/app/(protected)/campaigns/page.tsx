"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";

import { MoreHorizontalIcon } from "lucide-react";

import { RequireCapability } from "@/components/can";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { CampaignFormSheet } from "@/components/campaigns/campaign-form-sheet";
import { CampaignPreviewDialog } from "@/components/campaigns/campaign-preview";
import { ApiError } from "@/lib/api-client";
import {
  CAMPAIGN_ACTION_LABELS,
  CAMPAIGN_AUDIENCES,
  CAMPAIGN_FREQUENCIES,
  CAMPAIGN_STATUS_LABELS,
  createCampaign,
  listCampaigns,
  updateCampaign,
  type Campaign,
  type CampaignInput,
  type CampaignStatus,
} from "@/lib/graphql/campaigns";

/** Roles → the preset label an admin picked, so the table reads back the way
 *  the form was filled in rather than as a raw role list. */
function audienceLabel(roleIds: string[]): string {
  const sorted = [...roleIds].sort().join(",");
  const preset = CAMPAIGN_AUDIENCES.find(
    (a) => [...a.roleIds].sort().join(",") === sorted,
  );
  return preset?.label ?? roleIds.join(", ");
}

function frequencyLabel(id: Campaign["frequency"]): string {
  return CAMPAIGN_FREQUENCIES.find((f) => f.id === id)?.label ?? id;
}

function dateLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Status is stored, not derived — an admin publishes and pauses deliberately.
 * The window is shown separately so a campaign that is ACTIVE but not yet
 * started does not read as "live right now".
 */
function statusTone(status: CampaignStatus): "default" | "secondary" | "outline" {
  if (status === "ACTIVE") return "default";
  if (status === "ARCHIVED") return "outline";
  return "secondary";
}

function CampaignsPage() {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  // A live campaign is reviewed by looking at it, not by reading its row.
  const [previewing, setPreviewing] = useState<Campaign | null>(null);
  // Archiving stops delivery, so it asks first — but it is reversible, so it
  // asks with a plain confirm rather than making anyone type the name.
  const [archiving, setArchiving] = useState<Campaign | null>(null);

  const { data, isPending, isError } = useQuery({
    queryKey: ["campaigns"],
    queryFn: listCampaigns,
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["campaigns"] });

  const saveMutation = useMutation({
    mutationFn: (input: CampaignInput) =>
      editing ? updateCampaign(editing._id, input) : createCampaign(input),
    onSuccess: (saved) => {
      toast.success(editing ? `${saved.name} updated.` : `${saved.name} created as a draft.`);
      setSheetOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not save the campaign.",
      ),
  });

  const statusMutation = useMutation({
    mutationFn: ({ campaign, status }: { campaign: Campaign; status: CampaignStatus }) =>
      updateCampaign(campaign._id, { status }),
    onSuccess: (saved) => {
      toast.success(`${saved.name} is now ${CAMPAIGN_STATUS_LABELS[saved.status].toLowerCase()}.`);
      invalidate();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not change the campaign.",
      ),
  });

  const columns = useMemo<ColumnDef<Campaign>[]>(
    () => [
      {
        id: "name",
        header: "Campaign",
        cell: ({ row }) => (
          <button
            type="button"
            className="text-left font-medium underline-offset-4 hover:underline"
            onClick={() => {
              setEditing(row.original);
              setSheetOpen(true);
            }}
          >
            {row.original.name}
          </button>
        ),
      },
      {
        id: "audience",
        header: "Audience",
        cell: ({ row }) => (
          <span className="text-sm">{audienceLabel(row.original.targetRoleIds)}</span>
        ),
      },
      {
        id: "frequency",
        header: "Shows",
        cell: ({ row }) => (
          <span className="text-sm">{frequencyLabel(row.original.frequency)}</span>
        ),
      },
      {
        id: "window",
        header: "Runs",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm whitespace-nowrap">
            {dateLabel(row.original.startsAt)} — {dateLabel(row.original.endsAt)}
          </span>
        ),
      },
      {
        id: "action",
        header: "On tap",
        cell: ({ row }) => (
          <span className="text-sm">
            {CAMPAIGN_ACTION_LABELS[row.original.actionType]}
          </span>
        ),
      },
      {
        id: "priority",
        header: "Priority",
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.priority}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={statusTone(row.original.status)}>
            {CAMPAIGN_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const c = row.original;
          // Publish/pause is the only inline action. Everything else is an
          // edit, because changing what people see deserves the full form and
          // the note about already-shown impressions.
          const next: CampaignStatus = c.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
          const archived = c.status === "ARCHIVED";
          return (
            <div className="flex justify-end gap-2">
              {/* Preview stays available on archived campaigns: "what did that
                  one look like" is a question people ask about the ones that
                  already ran. */}
              <Button size="sm" variant="ghost" onClick={() => setPreviewing(c)}>
                Preview
              </Button>
              {archived ? (
                // Restore lands in DRAFT, never straight back to ACTIVE.
                // Un-archiving is a decision to reconsider a campaign, not a
                // decision to put it back in front of people this second.
                <Button
                  size="sm"
                  variant="outline"
                  disabled={statusMutation.isPending}
                  onClick={() =>
                    statusMutation.mutate({ campaign: c, status: "DRAFT" })
                  }
                >
                  Restore
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ campaign: c, status: next })}
                  >
                    {c.status === "ACTIVE" ? "Pause" : "Publish"}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button size="icon-sm" variant="ghost" />}
                    >
                      <MoreHorizontalIcon />
                      <span className="sr-only">More actions</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setArchiving(c)}>
                        Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          );
        },
      },
    ],
    [statusMutation],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Popup Campaigns</h1>
          <p className="text-muted-foreground text-sm">
            A full-screen image shown after sign-in. Campaigns advertise; promo
            codes are what actually discount an order.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
        >
          New campaign
        </Button>
      </div>

      {isError ? (
        <p className="text-destructive text-sm">Couldn&apos;t load campaigns.</p>
      ) : (
        <DataTable
          columns={columns}
          data={data ?? []}
          isLoading={isPending}
          emptyMessage="No campaigns yet."
        />
      )}

      <CampaignFormSheet
        open={sheetOpen}
        editing={editing}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setEditing(null);
        }}
        onSubmit={async (input) => {
          await saveMutation.mutateAsync(input);
        }}
        saving={saveMutation.isPending}
      />

      <CampaignPreviewDialog
        open={previewing !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewing(null);
        }}
        name={previewing?.name ?? ""}
        imageUrl={previewing?.imageUrl ?? ""}
        altText={previewing?.altText ?? ""}
        actionType={previewing?.actionType ?? "NONE"}
      />

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => {
          if (!open) setArchiving(null);
        }}
        title="Archive this campaign?"
        description={
          <>
            {archiving?.name} stops being shown to anyone. It stays in this
            list and can be restored as a draft later. People who already saw
            it still count as having seen it, so restoring does not show it to
            them again.
          </>
        }
        confirmLabel="Archive"
        onConfirm={() => {
          if (archiving) {
            statusMutation.mutate({ campaign: archiving, status: "ARCHIVED" });
          }
          setArchiving(null);
        }}
      />
    </div>
  );
}

export default function CampaignsPageGuard() {
  return (
    <RequireCapability capability="promo:manage">
      <CampaignsPage />
    </RequireCapability>
  );
}
