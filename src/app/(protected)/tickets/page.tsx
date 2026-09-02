"use client";

// Unified support inbox.
//
// One list across every source, because a customer who complains in the app,
// then in chat, then by phone is one problem and not three — the source is a
// tag on the row, never a separate queue.
//
// Everything on this page is staff-facing. Internal notes are visible here and
// only here; the customer-facing view, when it exists, has to use its own
// queries rather than these with a filter applied.

import { useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { AlertTriangleIcon, PlusIcon, UserPlusIcon } from "lucide-react";

import { RequireCapability, useCan } from "@/components/can";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import {
  DataTableToolbar,
  PAGE_SIZE_OPTIONS,
} from "@/components/ui/data-table-toolbar";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, ToneBadge } from "@/components/ui/status-badge";
import { StatusFilterChips } from "@/components/ui/status-filter-chips";
import { useAuth } from "@/context/auth-context";
import { ApiError } from "@/lib/api-client";
import {
  assignTicket,
  listTickets,
  fetchTicketMetrics,
  minutesUntilDue,
  TICKET_CATEGORY_LABELS,
  TICKET_SOURCE_LABELS,
  type Ticket,
  type TicketStatus,
} from "@/lib/graphql/tickets";
import { TICKET_PRIORITY, TICKET_STATUS } from "@/lib/status";
import { TicketDetailDrawer } from "@/components/tickets/ticket-detail-drawer";
import { useDeepLinkedId } from "@/hooks/use-deep-linked-id";
import { NewTicketDialog } from "@/components/tickets/new-ticket-dialog";

export const TICKETS_QUERY_KEY = "support-tickets";

export default function TicketsPage() {
  return (
    <RequireCapability capability="ticket:read">
      <TicketsInbox />
    </RequireCapability>
  );
}

const STATUS_CHIPS: { value: TicketStatus }[] = [
  { value: "OPEN" },
  { value: "IN_PROGRESS" },
  { value: "ESCALATED" },
  { value: "WAITING_ON_CUSTOMER" },
  { value: "RESOLVED" },
];

function TicketsInbox() {
  const { profile } = useAuth();
  const { can } = useCan();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [mineOnly, setMineOnly] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [limit, setLimit] = useState<number>(PAGE_SIZE_OPTIONS[1]);
  const [page, setPage] = useState(1);
  // In the URL — same reason as the accounts directory: the omnibox links
  // straight to a ticket, and a refresh must not lose it.
  const [openTicketId, setOpenTicketId] = useDeepLinkedId("ticket");
  const [newTicketOpen, setNewTicketOpen] = useState(false);

  const filter = useMemo(
    () => ({
      search: search.trim() || undefined,
      statuses: statuses.length ? (statuses as TicketStatus[]) : undefined,
      // With no explicit status picked, default to the work that is actually
      // ours to move — a queue that opens showing months of resolved tickets
      // is a queue nobody trusts.
      activeOnly: statuses.length === 0 || undefined,
      assignedToUid: mineOnly ? profile?._id : undefined,
      unassignedOnly: unassignedOnly || undefined,
      limit,
      offset: (page - 1) * limit,
    }),
    [search, statuses, mineOnly, unassignedOnly, profile?._id, limit, page],
  );

  const { data, isPending, isError, dataUpdatedAt } = useQuery({
    queryKey: [TICKETS_QUERY_KEY, filter],
    queryFn: () => listTickets(filter),
    placeholderData: keepPreviousData,
  });

  const metrics = useQuery({
    queryKey: ["support-ticket-metrics"],
    queryFn: fetchTicketMetrics,
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  const claim = useMutation({
    mutationFn: (ticket: Ticket) => assignTicket(ticket._id, profile!._id),
    onSuccess: () => {
      toast.success("Assigned to you.");
      void queryClient.invalidateQueries({ queryKey: [TICKETS_QUERY_KEY] });
      void queryClient.invalidateQueries({
        queryKey: ["support-ticket-metrics"],
      });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not assign this ticket.",
      ),
  });

  const columns = useMemo<ColumnDef<Ticket>[]>(
    () => [
      {
        id: "ticket",
        header: "Ticket",
        meta: { label: "Ticket" },
        accessorFn: (row) => row.ticketNumber,
        cell: ({ row }) => (
          <div className="max-w-72">
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs text-muted-foreground">
                {row.original.ticketNumber}
              </code>
              <StatusBadge
                status={row.original.priority}
                registry={TICKET_PRIORITY}
              />
            </div>
            <div className="truncate font-medium">{row.original.subject}</div>
            <div className="truncate text-xs text-muted-foreground">
              {TICKET_CATEGORY_LABELS[row.original.category]} ·{" "}
              {TICKET_SOURCE_LABELS[row.original.source]}
            </div>
          </div>
        ),
      },
      {
        id: "requester",
        header: "From",
        meta: { label: "From" },
        accessorFn: (row) => row.requester.displayName,
        cell: ({ row }) => (
          <div>
            <div className="text-sm">{row.original.requester.displayName}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.requester.role}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        meta: { label: "Status" },
        accessorFn: (row) => row.status,
        cell: ({ row }) => (
          <StatusBadge status={row.original.status} registry={TICKET_STATUS} />
        ),
      },
      {
        id: "sla",
        header: "First reply",
        meta: { label: "First reply" },
        accessorFn: (row) => row.firstResponseDueAt ?? "",
        cell: ({ row }) => <SlaCell ticket={row.original} />,
      },
      {
        id: "assignee",
        header: "Assignee",
        meta: { label: "Assignee" },
        accessorFn: (row) => row.assignedToName ?? "",
        cell: ({ row }) =>
          row.original.assignedToName ? (
            <span className="text-sm">{row.original.assignedToName}</span>
          ) : (
            <span className="text-xs text-muted-foreground">Unassigned</span>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {/* Claiming is the one action worth having in the list: an agent
                picking up work should not have to open each ticket first. */}
            {can("ticket:assign") && !row.original.assignedToUid && (
              <Button
                size="sm"
                variant="outline"
                disabled={claim.isPending}
                onClick={() => claim.mutate(row.original)}
              >
                <UserPlusIcon />
                Claim
              </Button>
            )}
            <Button size="sm" onClick={() => setOpenTicketId(row.original._id)}>
              Open
            </Button>
          </div>
        ),
      },
    ],
    [can, claim],
  );

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Support</h1>
          <p className="text-sm text-muted-foreground">
            Every complaint from every channel, in one queue. Urgent first, then
            whoever has been waiting longest.
          </p>
        </div>
        {/* The inbox could show, assign, reply to, escalate and resolve a
            ticket, and had no way to START one — so a complaint arriving by
            phone, the commonest kind there is, had nowhere to go. */}
        {can("ticket:reply") && (
          <Button onClick={() => setNewTicketOpen(true)}>
            <PlusIcon />
            Raise a ticket
          </Button>
        )}
      </div>

      <NewTicketDialog
        open={newTicketOpen}
        onOpenChange={setNewTicketOpen}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: [TICKETS_QUERY_KEY] });
          void queryClient.invalidateQueries({
            queryKey: ["support-ticket-metrics"],
          });
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Open"
          value={metrics.data?.open}
          description="Nobody has started on these yet."
        />
        <MetricCard
          title="Unassigned"
          value={metrics.data?.unassigned}
          description="Active tickets nobody owns."
          alarming={Boolean(metrics.data?.unassigned)}
        />
        <MetricCard
          title="Escalated"
          value={metrics.data?.escalated}
          description="First line could not resolve these."
          alarming={Boolean(metrics.data?.escalated)}
        />
        <MetricCard
          title="Past first reply"
          value={metrics.data?.breachedFirstResponse}
          description="Waiting longer than we aim for. Excludes anything waiting on the customer."
          alarming={Boolean(metrics.data?.breachedFirstResponse)}
        />
      </div>

      <DataTableToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Ticket number, subject, or name…"
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <StatusFilterChips
              chips={STATUS_CHIPS}
              selected={statuses}
              onChange={(next) => {
                setStatuses(next);
                setPage(1);
              }}
              registry={TICKET_STATUS}
            />
            <Button
              size="sm"
              variant={mineOnly ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              aria-pressed={mineOnly}
              onClick={() => {
                setMineOnly((on) => !on);
                // Mutually exclusive with unassigned — a ticket cannot be
                // both mine and nobody's, and offering both selected would
                // always return zero rows.
                setUnassignedOnly(false);
                setPage(1);
              }}
            >
              Mine
            </Button>
            <Button
              size="sm"
              variant={unassignedOnly ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              aria-pressed={unassignedOnly}
              onClick={() => {
                setUnassignedOnly((on) => !on);
                setMineOnly(false);
                setPage(1);
              }}
            >
              Unassigned
            </Button>
          </div>
        }
        limit={limit}
        onLimitChange={(next) => {
          setLimit(next);
          setPage(1);
        }}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />

      <DataTable
        tableId="tickets"
        dataUpdatedAt={dataUpdatedAt}
        columns={columns}
        data={rows}
        isLoading={isPending}
        isError={isError}
        emptyMessage={
          search.trim() || statuses.length || mineOnly || unassignedOnly
            ? "No tickets match these filters."
            : "Nothing waiting. The queue is clear."
        }
        onRowClick={(row) => setOpenTicketId(row._id)}
        enableColumnVisibility
        csvFileName="lalaba-support-tickets"
      />

      <TicketDetailDrawer
        ticketId={openTicketId}
        onClose={() => setOpenTicketId(null)}
      />
    </div>
  );
}

/**
 * The first-response clock.
 *
 * Shows time REMAINING rather than ticket age, because age alone says nothing
 * about whether we are late — an hour-old urgent ticket is overdue while a
 * day-old low one is fine.
 */
function SlaCell({ ticket }: { ticket: Ticket }) {
  if (ticket.firstResponseAt) {
    return <span className="text-xs text-muted-foreground">Replied</span>;
  }
  const minutes = minutesUntilDue(ticket.firstResponseDueAt);
  if (minutes == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (minutes < 0) {
    return (
      <ToneBadge tone="danger">
        <AlertTriangleIcon className="size-3" />
        {formatDuration(-minutes)} over
      </ToneBadge>
    );
  }
  // Under an hour left is worth flagging before it becomes a breach.
  return minutes < 60 ? (
    <ToneBadge tone="pending">{formatDuration(minutes)} left</ToneBadge>
  ) : (
    <span className="text-xs text-muted-foreground">
      {formatDuration(minutes)} left
    </span>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function MetricCard({
  title,
  value,
  description,
  alarming = false,
}: {
  title: string;
  value?: number;
  description: string;
  alarming?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle
          className={
            alarming && value
              ? "text-2xl tabular-nums text-[var(--status-danger)]"
              : "text-2xl tabular-nums"
          }
        >
          {value ?? <Skeleton className="h-7 w-10" />}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
    </Card>
  );
}
