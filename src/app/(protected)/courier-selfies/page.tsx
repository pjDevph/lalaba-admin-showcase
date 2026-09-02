"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  DataTableToolbar,
  PAGE_SIZE_OPTIONS,
} from "@/components/ui/data-table-toolbar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  COURIER_PHOTO_REVOKE_REASONS,
  ReasonCodeDialog,
  draftMessage,
} from "@/components/ui/reason-code-dialog";
import { RequireCapability, useCan } from "@/components/can";
import { ApiError } from "@/lib/api-client";
import {
  listCourierSelfieQueue,
  revokeCourierSelfie,
  LIVENESS_CHALLENGE_LABELS,
  type CourierSelfie,
} from "@/lib/graphql/courier-selfies";

const QUERY_KEY = "courier-selfie-queue";

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

/**
 * The liveness numbers the courier's device reported.
 *
 * Worth stating plainly: these are CLIENT ASSERTIONS. The server cannot
 * re-derive any of them, and a modified build can send whatever it likes. They
 * are context for a human looking at the photo — never a reason on their own to
 * leave a bad photo up.
 */
function LivenessSummary({ selfie }: { selfie: CourierSelfie }) {
  const m = selfie.livenessMetadata;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <dt className="text-muted-foreground">Challenge</dt>
      <dd>{LIVENESS_CHALLENGE_LABELS[selfie.livenessChallenge]}</dd>
      <dt className="text-muted-foreground">Time to pass</dt>
      <dd>{(m.durationMs / 1000).toFixed(1)}s</dd>
      <dt className="text-muted-foreground">Attempts</dt>
      <dd>{m.attemptCount}</dd>
      <dt className="text-muted-foreground">Eyes open</dt>
      <dd>{(m.eyesOpenScore * 100).toFixed(0)}%</dd>
      <dt className="text-muted-foreground">Head angle</dt>
      <dd>
        yaw {m.yawDegrees.toFixed(1)}°, pitch {m.pitchDegrees.toFixed(1)}°
      </dd>
    </dl>
  );
}

function SelfieViewer({
  selfie,
  onClose,
  onRevoke,
}: {
  selfie: CourierSelfie | null;
  onClose: () => void;
  onRevoke: (selfie: CourierSelfie) => void;
}) {
  return (
    <Dialog open={!!selfie} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Courier photo</DialogTitle>
          <DialogDescription>
            This is live right now and is what customers see. Revoking removes
            it and stops the courier working until they retake it.
          </DialogDescription>
        </DialogHeader>
        {selfie && (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* unoptimized: the image lives in our own storage bucket, whose
                host is not in next.config's remotePatterns, and it is deleted
                outright on revoke — running it through the optimizer would only
                add a cache that outlives the object. */}
            <Image
              src={selfie.publicUrl}
              alt="Courier selfie"
              width={400}
              height={400}
              unoptimized
              className="h-auto w-full rounded-md border object-cover"
            />
            <LivenessSummary selfie={selfie} />
          </div>
        )}
        <DialogFooter>
          {selfie && (
            <Button variant="destructive" onClick={() => onRevoke(selfie)}>
              Revoke
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function columns(
  onView: (selfie: CourierSelfie) => void,
  onRevoke: (selfie: CourierSelfie) => void,
  workingId: string | null,
): ColumnDef<CourierSelfie>[] {
  return [
    {
      id: "photo",
      header: "Photo",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onView(row.original)}
          className="block h-12 w-12 overflow-hidden rounded-full border"
        >
          <Image
            src={row.original.publicUrl}
            alt=""
            width={48}
            height={48}
            unoptimized
            className="h-12 w-12 object-cover"
          />
        </button>
      ),
    },
    {
      accessorKey: "courierUid",
      header: "Courier",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.courierUid}</span>
      ),
    },
    {
      id: "challenge",
      header: "Challenge",
      cell: ({ row }) => (
        <Badge variant="secondary">
          {LIVENESS_CHALLENGE_LABELS[row.original.livenessChallenge]}
        </Badge>
      ),
    },
    {
      id: "attempts",
      header: "Attempts",
      // Surfaced on the row rather than buried in the viewer: a courier who
      // needed many tries is the most useful signal for picking what to look
      // at first, whether that means a struggling rider or a spoof attempt.
      cell: ({ row }) => row.original.livenessMetadata.attemptCount,
    },
    {
      accessorKey: "submittedAt",
      header: "Submitted",
      cell: ({ row }) => formatDateTime(row.original.submittedAt),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onView(row.original)}
          >
            View
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={workingId === row.original._id}
            onClick={() => onRevoke(row.original)}
          >
            {workingId === row.original._id ? "Revoking…" : "Revoke"}
          </Button>
        </div>
      ),
    },
  ];
}

export default function CourierSelfiesPage() {
  // Matches the sidebar entry's own capability: without this the nav link is
  // hidden for a role that lacks it, but the URL still renders the queue.
  return (
    <RequireCapability capability="courier:revoke_selfie">
      <CourierSelfiesWorkspace />
    </RequireCapability>
  );
}

function CourierSelfiesWorkspace() {
  const { can } = useCan();
  const canReview = can("courier:revoke_selfie");
  const queryClient = useQueryClient();

  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [pageIndex, setPageIndex] = useState(0);
  const [viewing, setViewing] = useState<CourierSelfie | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<CourierSelfie | null>(null);

  const filter = useMemo(
    () => ({ limit: pageSize, offset: pageIndex * pageSize }),
    [pageSize, pageIndex],
  );

  const { data, isPending, isError } = useQuery({
    queryKey: [QUERY_KEY, filter],
    queryFn: () => listCourierSelfieQueue(filter),
    enabled: canReview,
    placeholderData: keepPreviousData,
  });
  const rows = data ?? [];

  // The queue returns a page, not a total — so paging is "is this page full?"
  // rather than a computed page count. Showing a wrong total would be worse
  // than showing none.
  const hasNextPage = rows.length === pageSize;

  const revokeMutation = useMutation({
    mutationFn: ({ selfie, why }: { selfie: CourierSelfie; why: string }) =>
      revokeCourierSelfie(selfie._id, why),
    onSuccess: () => {
      toast.success("Revoked. The courier must retake before working again.");
      setRevokeTarget(null);
      setViewing(null);
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not revoke this photo.",
      ),
  });

  const workingId = revokeMutation.isPending
    ? (revokeMutation.variables?.selfie._id ?? null)
    : null;

  function requestRevoke(selfie: CourierSelfie) {
    setRevokeTarget(selfie);
  }

  function confirmRevoke(code: string, note: string | null) {
    if (!revokeTarget) return;
    // The courier is shown this string verbatim on their lockout screen, so
    // send the drafted sentence, never the bare code. The code prefix keeps
    // it countable: `revokeCourierSelfie(reason: String!)` has no structured
    // field yet, so the prefix is how "why do we revoke most photos" stays
    // answerable until it does.
    const why = `[${code}] ${draftMessage(COURIER_PHOTO_REVOKE_REASONS, code, note)}`;
    revokeMutation.mutate({ selfie: revokeTarget, why });
  }

  if (!canReview) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <h1 className="text-xl font-semibold">Courier photos</h1>
        <p className="text-sm text-muted-foreground">
          You do not have access to courier photo review.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Courier photos</h1>
        <p className="text-sm text-muted-foreground">
          Liveness selfies couriers took to unlock order handling, newest first.
          These are already live — there is nothing to approve. Revoke anything
          that is not a clear photo of the rider&apos;s face.
        </p>
      </div>

      <DataTableToolbar
        search=""
        onSearchChange={() => undefined}
        hideSearch
        limit={pageSize}
        onLimitChange={(limit) => {
          setPageSize(limit);
          setPageIndex(0);
        }}
        page={pageIndex + 1}
        totalPages={hasNextPage ? pageIndex + 2 : pageIndex + 1}
        onPageChange={(page) => setPageIndex(page - 1)}
      />

      <DataTable
        tableId="courier-id-checks"
        columns={columns(setViewing, requestRevoke, workingId)}
        data={rows}
        isLoading={isPending}
        isError={isError}
        errorMessage="Failed to load courier photos. Please try again."
        emptyMessage="No courier photos yet."
      />

      <SelfieViewer
        selfie={viewing}
        onClose={() => setViewing(null)}
        onRevoke={requestRevoke}
      />

      <ReasonCodeDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="Revoke this photo?"
        description="The courier is locked out of order handling until they take a new one, and sees the reason you pick. The image is deleted from storage — this cannot be undone."
        reasons={COURIER_PHOTO_REVOKE_REASONS}
        confirmLabel="Revoke"
        pending={revokeMutation.isPending}
        onConfirm={confirmRevoke}
      />
    </div>
  );
}
