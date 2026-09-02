"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";

import { RequireCapability, useCan } from "@/components/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api-client";
import {
  cancelAccountDeletion,
  fetchDeletionQueue,
  type DeletionQueueEntry,
  type DeletionQueueStatus,
} from "@/lib/graphql/compliance";
import { ROLE_LABELS } from "@/lib/graphql/directory";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (24 * 3600 * 1000));
}

function QueueTab({ status, canManage }: { status: DeletionQueueStatus; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [cancelTarget, setCancelTarget] = useState<DeletionQueueEntry | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["deletion-queue", status],
    queryFn: () => fetchDeletionQueue(status),
  });

  const cancelMutation = useMutation({
    mutationFn: (uid: string) => cancelAccountDeletion(uid),
    onSuccess: (_, uid) => {
      toast.success("Deletion request cancelled — access restored.");
      setCancelTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["deletion-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["directory-user", uid] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not cancel this request."),
  });

  const columns: ColumnDef<DeletionQueueEntry>[] = [
    {
      id: "account",
      header: "Account",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.displayName}</div>
          <div className="text-sm text-muted-foreground">{row.original.email}</div>
        </div>
      ),
    },
    {
      id: "role",
      header: "Role",
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.original.roleId ? (ROLE_LABELS[row.original.roleId] ?? row.original.roleId) : "—"}
        </Badge>
      ),
    },
    {
      id: "requested",
      header: "Requested",
      cell: ({ row }) => formatDate(row.original.requestedAt),
    },
    status === "pending"
      ? {
          id: "scheduled",
          header: "Erasure scheduled",
          cell: ({ row }) => {
            const days = daysUntil(row.original.scheduledAt);
            return (
              <div>
                <div>{formatDate(row.original.scheduledAt)}</div>
                <div className="text-sm text-muted-foreground">
                  {days > 0 ? `in ${days} day${days === 1 ? "" : "s"}` : "due now"}
                </div>
              </div>
            );
          },
        }
      : status === "cancelled"
        ? {
            id: "cancelled",
            header: "Cancelled",
            cell: ({ row }) => (
              <div>
                <div>{formatDate(row.original.cancelledAt)}</div>
                <div className="text-sm text-muted-foreground">
                  by {row.original.cancelledBy ?? "unknown"}
                </div>
              </div>
            ),
          }
        : {
            id: "completed",
            header: "Erased",
            cell: ({ row }) => formatDate(row.original.completedAt),
          },
  ];

  if (status === "pending" && canManage) {
    columns.push({
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setCancelTarget(row.original)}>
            Cancel deletion
          </Button>
        </div>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        tableId="deletion-requests"
        columns={columns}
        data={data ?? []}
        isLoading={isPending}
        emptyMessage={
          status === "pending"
            ? "No accounts currently in the deletion grace period."
            : status === "cancelled"
              ? "No cancelled deletion requests."
              : "No completed deletions."
        }
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel this deletion request?"
        description={
          cancelTarget
            ? `${cancelTarget.displayName}'s account is restored to active immediately. They will need to sign in again — this does not automatically reopen their previous session.`
            : undefined
        }
        confirmLabel="Cancel deletion, restore access"
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget.uid)}
      />
    </div>
  );
}

function DeletionRequestsPage() {
  const { can } = useCan();
  const canManage = can("compliance:read");

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Deletion Requests</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every account in the 30-day account-deletion grace period, plus
          recent cancellations and completions for audit context. An account
          is locked out for the whole window but can still change its mind —
          cancelling here restores access the same way the account owner
          cancelling it themselves would.
        </p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">
          <QueueTab status="pending" canManage={canManage} />
        </TabsContent>
        <TabsContent value="cancelled">
          <QueueTab status="cancelled" canManage={canManage} />
        </TabsContent>
        <TabsContent value="completed">
          <QueueTab status="completed" canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function DeletionRequestsPageGuard() {
  return (
    <RequireCapability capability="compliance:read">
      <DeletionRequestsPage />
    </RequireCapability>
  );
}
