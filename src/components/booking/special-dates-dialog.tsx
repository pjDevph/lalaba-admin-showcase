"use client";

/**
 * One provider's special dates — the holidays, absences and one-off closures
 * that do not follow her weekly schedule.
 *
 * The backend has carried `bookingSpecialDates`, `createBookingBlackout`,
 * `upsertBookingDateOverride` and their removals since the module shipped, all
 * admin-guarded, and none of them had a screen. Closing the platform's
 * providers for a public holiday meant calling the API by hand.
 *
 * Two record types, deliberately kept distinct rather than merged behind one
 * "close this" button, because they undo differently:
 *
 *   blackout — a DATE RANGE, closed outright. "She is away all of Holy Week."
 *   override — ONE date on different terms: closed, or open on different
 *              hours, or open with a different daily limit.
 *
 * The weekly schedule underneath is shown read-only. It belongs to the
 * provider and is edited in the partner app; what an admin needs here is to
 * see what she normally does before overriding a day of it.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarOffIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  WEEKDAYS,
  createBookingBlackout,
  getBookingAvailability,
  getBookingSpecialDates,
  removeBookingBlackout,
  removeBookingDateOverride,
  upsertBookingDateOverride,
  type UpcomingSpecialDate,
} from "@/lib/graphql/booking-availability";

const SPECIAL_DATES_KEY = "booking-special-dates";
const AVAILABILITY_KEY = "booking-availability";

/** 'YYYY-MM-DD' in PH time — the format every date field on this module uses. */
function todayInManila(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDate(value: string): string {
  // Parsed as UTC midnight deliberately: these are calendar dates, not
  // instants, and letting the browser apply a local offset to a bare
  // 'YYYY-MM-DD' is how a holiday renders as the day before.
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SpecialDatesDialog({
  branchId,
  providerName,
  open,
  onOpenChange,
  canEdit,
}: {
  branchId: string | null;
  providerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Support opens this read-only: the mutations behind it are admin-only. */
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<UpcomingSpecialDate | null>(null);

  const enabled = open && !!branchId;

  const specialDates = useQuery({
    queryKey: [SPECIAL_DATES_KEY, branchId],
    queryFn: () => getBookingSpecialDates(branchId as string),
    enabled,
  });

  const config = useQuery({
    queryKey: [AVAILABILITY_KEY, branchId],
    queryFn: () => getBookingAvailability(branchId as string),
    enabled,
  });

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: [SPECIAL_DATES_KEY, branchId],
    });
  }

  const removeMutation = useMutation({
    mutationFn: (row: UpcomingSpecialDate) =>
      // `source` is the backend's own word for which collection the row came
      // from, so the remove path is read off the record rather than guessed
      // from what it looks like.
      row.source === "blackout"
        ? removeBookingBlackout(branchId as string, row.recordId as string)
        : removeBookingDateOverride(branchId as string, row.date),
    onSuccess: () => {
      toast.success("Special date removed.");
      setRemoving(null);
      invalidate();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not remove it.",
      ),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Special dates — {providerName}</DialogTitle>
            <DialogDescription>
              Holidays, absences and one-off closures for this provider. The
              weekly schedule below belongs to the provider and is edited in
              her own app.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[32rem] flex-col gap-5 overflow-auto">
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Upcoming</h3>
              {specialDates.isPending ? (
                <Skeleton className="h-20 w-full" />
              ) : specialDates.isError ? (
                <p className="text-sm text-[var(--status-danger)]">
                  Could not load this provider&apos;s special dates.
                </p>
              ) : specialDates.data.length === 0 ? (
                <p className="rounded-md border p-3 text-sm text-muted-foreground">
                  Nothing scheduled — every upcoming day follows the weekly
                  schedule.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {specialDates.data.map((row) => (
                    <li
                      key={`${row.source}:${row.recordId ?? row.date}`}
                      className="flex items-start justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {formatDate(row.date)}
                          </span>
                          <Badge
                            variant={row.isClosed ? "destructive" : "secondary"}
                          >
                            {row.kind}
                          </Badge>
                          <Badge variant="outline">{row.source}</Badge>
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {row.label ? `${row.label} — ` : ""}
                          {row.detail}
                        </p>
                      </div>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRemoving(row)}
                        >
                          <Trash2Icon />
                          <span className="sr-only">Remove</span>
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {canEdit && branchId && (
              <>
                <OverrideForm branchId={branchId} onSaved={invalidate} />
                <BlackoutForm branchId={branchId} onSaved={invalidate} />
              </>
            )}

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Weekly schedule</h3>
              <p className="text-xs text-muted-foreground">
                Read-only here — this is the provider&apos;s own, set in her
                app. Shown so a special date can be judged against what she
                normally does.
              </p>
              {config.isPending ? (
                <Skeleton className="h-28 w-full" />
              ) : config.isError ? (
                <p className="text-sm text-muted-foreground">
                  Could not load the weekly schedule.
                </p>
              ) : (
                <ul className="rounded-md border text-sm">
                  {WEEKDAYS.map((day) => {
                    const value = config.data.weekly?.[day];
                    return (
                      <li
                        key={day}
                        className="flex items-center justify-between border-b px-3 py-1.5 last:border-b-0"
                      >
                        <span className="capitalize">{day}</span>
                        <span className="text-muted-foreground">
                          {!value || !value.isAcceptingBookings
                            ? "Closed"
                            : value.windows.length === 0
                              ? "Open, no hours set"
                              : value.windows
                                  .map((w) => `${w.start}–${w.end}`)
                                  .join(", ")}
                          {value?.dailyBookingLimit != null &&
                            ` · max ${value.dailyBookingLimit}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removing != null}
        onOpenChange={(next) => !next && setRemoving(null)}
        title="Remove this special date?"
        description={
          removing
            ? `${formatDate(removing.date)} goes back to following the weekly schedule.`
            : undefined
        }
        confirmLabel="Remove"
        onConfirm={() => removing && removeMutation.mutate(removing)}
      />
    </>
  );
}

/** One date on different terms — closed, or open on different hours. */
function OverrideForm({
  branchId,
  onSaved,
}: {
  branchId: string;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(todayInManila());
  const [label, setLabel] = useState("");
  const [isClosed, setIsClosed] = useState(true);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("20:00");
  const [limit, setLimit] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      upsertBookingDateOverride(branchId, {
        date,
        label: label.trim() || null,
        isClosed,
        // A closed day has no hours and no limit to send; including them would
        // write numbers that can never apply.
        windows: isClosed ? undefined : [{ start, end }],
        dailyBookingLimit:
          isClosed || limit.trim() === "" ? null : Number(limit),
      }),
    onSuccess: () => {
      toast.success(`${formatDate(date)} saved.`);
      setLabel("");
      onSaved();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not save that date.",
      ),
  });

  const invalidLimit =
    !isClosed && limit.trim() !== "" && !(Number(limit) > 0);

  return (
    <section className="flex flex-col gap-3 rounded-md border p-3">
      <h3 className="text-sm font-medium">Add a single date</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="override-date">Date</Label>
          <Input
            id="override-date"
            type="date"
            value={date}
            min={todayInManila()}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="override-label">Label (customers see this)</Label>
          <Input
            id="override-label"
            value={label}
            placeholder="e.g. Holy Thursday"
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="override-closed"
          checked={isClosed}
          onCheckedChange={setIsClosed}
        />
        <Label htmlFor="override-closed" className="text-sm font-normal">
          {isClosed ? "Closed all day" : "Open on different hours"}
        </Label>
      </div>

      {!isClosed && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="override-start">Opens</Label>
            <Input
              id="override-start"
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="override-end">Closes</Label>
            <Input
              id="override-end"
              type="time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="override-limit">Daily limit</Label>
            <Input
              id="override-limit"
              inputMode="numeric"
              value={limit}
              placeholder="No change"
              onChange={(event) => setLimit(event.target.value)}
            />
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!date || mutation.isPending || invalidLimit}
          onClick={() => mutation.mutate()}
        >
          <PlusIcon />
          {mutation.isPending ? "Saving…" : "Save date"}
        </Button>
      </div>
      {invalidLimit && (
        <p className="text-xs text-[var(--status-danger)]">
          A daily limit must be a whole number above zero. Leave it blank to
          keep the usual limit.
        </p>
      )}
    </section>
  );
}

/** A closed date RANGE. */
function BlackoutForm({
  branchId,
  onSaved,
}: {
  branchId: string;
  onSaved: () => void;
}) {
  const [startDate, setStartDate] = useState(todayInManila());
  const [endDate, setEndDate] = useState(todayInManila());
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createBookingBlackout(branchId, {
        startDate,
        endDate,
        reason: reason.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Blackout added.");
      setReason("");
      onSaved();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not add the blackout.",
      ),
  });

  // Checked here as well as server-side so the mistake is caught before the
  // round trip, which is the only place it reads as a typo rather than an
  // error.
  const backwards = endDate < startDate;

  return (
    <section className="flex flex-col gap-3 rounded-md border p-3">
      <h3 className="text-sm font-medium">Close a range of dates</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="blackout-start">From</Label>
          <Input
            id="blackout-start"
            type="date"
            value={startDate}
            min={todayInManila()}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="blackout-end">To</Label>
          <Input
            id="blackout-end"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="blackout-reason">Reason</Label>
          <Input
            id="blackout-reason"
            value={reason}
            placeholder="e.g. Away for the week"
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </div>
      {backwards && (
        <p className="text-xs text-[var(--status-danger)]">
          The end date is before the start date.
        </p>
      )}
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          disabled={backwards || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          <CalendarOffIcon />
          {mutation.isPending ? "Saving…" : "Add blackout"}
        </Button>
      </div>
    </section>
  );
}
