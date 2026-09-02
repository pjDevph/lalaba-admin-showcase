"use client";

import Link from "next/link";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EyeIcon, LockIcon } from "lucide-react";

import { Can, useCan } from "@/components/can";
import { Button } from "@/components/ui/button";
import { DetailDrawer } from "@/components/ui/detail-drawer";
import { NoteInput } from "@/components/ui/note-input";
import { ReasonCodeDialog } from "@/components/ui/reason-code-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActivityTimeline } from "@/components/ui/activity-timeline";
import { ApiError } from "@/lib/api-client";
import { listAdminUsers } from "@/lib/graphql/admin-users";
import {
  addTicketNote,
  assignTicket,
  fetchTicket,
  resolveTicket,
  setTicketPriority,
  setTicketStatus,
  TICKET_CATEGORY_LABELS,
  TICKET_HANDOFF_REASONS,
  TICKET_PRIORITY_LABELS,
  TICKET_RESOLUTION_REASONS,
  TICKET_IMAGE_ACCEPT,
  TICKET_SOURCE_LABELS,
  TicketImageRejected,
  uploadTicketImage,
  type TicketDetail,
  type TicketNote,
  type TicketPriority,
} from "@/lib/graphql/tickets";
import { TICKET_PRIORITY, TICKET_STATUS } from "@/lib/status";
import { TicketOrderContext } from "@/components/tickets/ticket-order-context";
import { cn } from "@/lib/utils";

const DETAIL_KEY = "support-ticket-detail";

/**
 * One ticket, opened over the inbox rather than as its own route — an agent
 * works through a filtered queue and a full navigation would lose the filters
 * and the scroll position on every single one.
 */
export function TicketDetailDrawer({
  ticketId,
  onClose,
}: {
  ticketId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [escalating, setEscalating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<{
    uid: string;
    name: string;
  } | null>(null);

  const { data: ticket, isPending } = useQuery({
    queryKey: [DETAIL_KEY, ticketId],
    queryFn: () => fetchTicket(ticketId!),
    enabled: ticketId != null,
  });

  // Small, fixed pool (admin + support accounts) — one page is plenty for a
  // picker, unlike the paginated user-management table this same query backs.
  const { data: agents } = useQuery({
    queryKey: ["assignable-agents"],
    // 100, not 200: the backend caps this filter at 100 and rejects anything
    // higher outright, so the old value failed the query on every ticket and
    // left the assignee picker permanently empty.
    queryFn: () => listAdminUsers({ isActive: true, limit: 100, offset: 0 }),
    enabled: ticketId != null,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: [DETAIL_KEY, ticketId] });
    void queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    void queryClient.invalidateQueries({
      queryKey: ["support-ticket-metrics"],
    });
  };

  const onError = (err: unknown, fallback: string) =>
    toast.error(err instanceof ApiError ? err.message : fallback);

  const noteMutation = useMutation({
    mutationFn: async ({
      body,
      visibility,
      file,
    }: {
      body: string;
      visibility: "INTERNAL" | "CUSTOMER";
      file?: File;
    }) => {
      // Upload first, reference next — the backend's own contract. The key is
      // scoped to the ticket before any note exists to point at it, so a
      // failed note leaves an orphaned object rather than a note pointing at
      // nothing.
      const imageKey = file
        ? await uploadTicketImage(ticketId!, file)
        : undefined;
      return addTicketNote(ticketId!, body, visibility, imageKey);
    },
    onSuccess: (_r, { visibility }) => {
      toast.success(
        visibility === "CUSTOMER" ? "Sent to the customer." : "Note added.",
      );
      invalidate();
    },
    onError: (err) =>
      // A rejected image is the agent's own file being wrong, and says so in
      // its own words rather than as "could not add this note".
      err instanceof TicketImageRejected
        ? toast.error(err.message)
        : onError(err, "Could not add this note."),
  });

  const statusMutation = useMutation({
    mutationFn: ({
      status,
      reason,
    }: {
      status: TicketDetail["status"];
      reason?: string | null;
    }) => setTicketStatus(ticketId!, status, reason),
    onSuccess: () => {
      toast.success("Status updated.");
      setEscalating(false);
      invalidate();
    },
    onError: (err) => onError(err, "Could not change the status."),
  });

  const priorityMutation = useMutation({
    mutationFn: (priority: TicketPriority) =>
      setTicketPriority(ticketId!, priority),
    onSuccess: () => {
      toast.success("Priority updated.");
      invalidate();
    },
    onError: (err) => onError(err, "Could not change the priority."),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ code, note }: { code: string; note: string | null }) =>
      resolveTicket(ticketId!, code, note),
    onSuccess: () => {
      toast.success("Resolved.");
      setResolving(false);
      invalidate();
    },
    onError: (err) => onError(err, "Could not resolve this ticket."),
  });

  const assignMutation = useMutation({
    mutationFn: ({
      assigneeUid,
      reason,
    }: {
      assigneeUid: string | null;
      reason?: string | null;
    }) => assignTicket(ticketId!, assigneeUid, reason),
    onSuccess: () => {
      toast.success("Assignment updated.");
      setReassignTarget(null);
      invalidate();
    },
    onError: (err) => onError(err, "Could not update the assignment."),
  });

  const onSelectAssignee = (uid: string | null) => {
    if (!ticket || uid === (ticket.assignedToUid ?? null)) return;
    if (uid === null || !ticket.assignedToUid) {
      // Unassigning, or picking up an unassigned ticket — the backend only
      // requires a reason when taking it FROM another agent.
      assignMutation.mutate({ assigneeUid: uid });
      return;
    }
    const agent = agents?.data.find((a) => a._id === uid);
    setReassignTarget({ uid, name: agent ? nameOf(agent) : "this agent" });
  };

  if (!ticketId) return null;

  return (
    <>
      <DetailDrawer
        open
        onOpenChange={(open) => !open && onClose()}
        entityId={ticket?.ticketNumber ?? ticketId}
        title={ticket?.subject ?? "Loading…"}
        status={ticket?.status}
        statusRegistry={TICKET_STATUS}
        subtitle={
          ticket
            ? `${ticket.requester.displayName} · ${TICKET_CATEGORY_LABELS[ticket.category]} · ${TICKET_SOURCE_LABELS[ticket.source]}`
            : undefined
        }
        actions={
          ticket && (
            <>
              {(() => {
                const isClosed =
                  ticket.status === "RESOLVED" || ticket.status === "CLOSED";
                return (
                  <>
                    <Can capability="ticket:resolve">
                      {!isClosed && (
                        <Button size="sm" onClick={() => setResolving(true)}>
                          Resolve
                        </Button>
                      )}
                      {isClosed && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            statusMutation.mutate({ status: "OPEN" })
                          }
                        >
                          Reopen
                        </Button>
                      )}
                    </Can>
                    <Can capability="ticket:escalate">
                      {!isClosed && ticket.status !== "ESCALATED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEscalating(true)}
                        >
                          Escalate
                        </Button>
                      )}
                    </Can>
                    {!isClosed && ticket.status !== "WAITING_ON_CUSTOMER" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          statusMutation.mutate({
                            status: "WAITING_ON_CUSTOMER",
                          })
                        }
                      >
                        Waiting on customer
                      </Button>
                    )}
                  </>
                );
              })()}
              <Can capability="ticket:assign">
                <AssigneePicker
                  ticket={ticket}
                  agents={agents?.data ?? []}
                  onSelect={onSelectAssignee}
                  disabled={assignMutation.isPending}
                />
              </Can>
              <PriorityPicker
                value={ticket.priority}
                onChange={(p) => priorityMutation.mutate(p)}
              />
            </>
          )
        }
        tabs={
          ticket
            ? [
                {
                  value: "conversation",
                  label: "Conversation",
                  content: (
                    <ConversationTab
                      ticket={ticket}
                      onAddNote={(body, visibility, file) =>
                        noteMutation.mutate({
                          body,
                          visibility:
                            visibility === "customer" ? "CUSTOMER" : "INTERNAL",
                          file,
                        })
                      }
                      notePending={noteMutation.isPending}
                    />
                  ),
                },
                {
                  value: "details",
                  label: "Details",
                  content: <DetailsTab ticket={ticket} />,
                },
                {
                  value: "history",
                  label: "History",
                  content: <HistoryTab ticket={ticket} />,
                },
              ]
            : undefined
        }
      >
        {isPending && <Skeleton className="h-64 w-full" />}
      </DetailDrawer>

      <ReasonCodeDialog
        open={escalating}
        onOpenChange={setEscalating}
        title="Escalate this ticket"
        description="Say what the next person needs to pick up. The backend requires a reason — an escalation with none is how a ticket bounces between two people who each think the other owns it."
        reasons={TICKET_HANDOFF_REASONS}
        confirmLabel="Escalate"
        destructive={false}
        pending={statusMutation.isPending}
        onConfirm={(reason, note) =>
          statusMutation.mutate({
            status: "ESCALATED",
            reason: note ? `${reason}: ${note}` : reason,
          })
        }
      />

      <ReasonCodeDialog
        open={resolving}
        onOpenChange={setResolving}
        title="Resolve this ticket"
        description="The note is sent to the customer, not filed internally — leave it blank if nothing more needs saying."
        reasons={TICKET_RESOLUTION_REASONS}
        confirmLabel="Resolve"
        destructive={false}
        pending={resolveMutation.isPending}
        onConfirm={(code, note) => resolveMutation.mutate({ code, note })}
      />

      <ReasonCodeDialog
        open={reassignTarget != null}
        onOpenChange={(open) => !open && setReassignTarget(null)}
        title={`Reassign to ${reassignTarget?.name ?? "this agent"}`}
        description="Taking a ticket off the agent currently on it needs a reason — say why, so the handoff doesn't lose context."
        reasons={TICKET_HANDOFF_REASONS}
        confirmLabel="Reassign"
        destructive={false}
        pending={assignMutation.isPending}
        onConfirm={(reason, note) =>
          reassignTarget &&
          assignMutation.mutate({
            assigneeUid: reassignTarget.uid,
            reason: note ? `${reason}: ${note}` : reason,
          })
        }
      />
    </>
  );
}

// ── Conversation ────────────────────────────────────────────────────────────

function ConversationTab({
  ticket,
  onAddNote,
  notePending,
}: {
  ticket: TicketDetail;
  onAddNote: (
    body: string,
    visibility: "internal" | "customer",
    file?: File,
  ) => void;
  notePending: boolean;
}) {
  const { can } = useCan();

  return (
    <div className="flex flex-col gap-4">
      {/* The original complaint, in the requester's own words. */}
      <div className="rounded-lg border p-3">
        <div className="mb-1 text-xs text-muted-foreground">
          {ticket.requester.displayName} ·{" "}
          {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : "—"}
        </div>
        <p className="text-sm whitespace-pre-wrap">{ticket.body}</p>
      </div>

      {ticket.notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No replies yet. The customer has not heard anything.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {ticket.notes.map((note) => (
            <li key={note._id}>
              <NoteBubble note={note} />
            </li>
          ))}
        </ul>
      )}

      {can("ticket:reply") && (
        <div className="border-t pt-4">
          <NoteInput
            onSubmit={onAddNote}
            pending={notePending}
            // Tickets are the one composer with somewhere to put a file: a
            // note has always RENDERED an image, and until now nothing in the
            // panel could send one back.
            allowAttachment
            attachmentAccept={TICKET_IMAGE_ACCEPT}
            // NoteInput's own default is "internal" — the right call for
            // most tickets, where staff raised it and there's no live UI on
            // the other end waiting on a reply. A CUSTOMER_APP/PARTNER_APP
            // ticket is different: the requester is looking at a real-time
            // chat thread for it right now (see MySupportTicketsResolver),
            // so an agent who forgets to toggle visibility here would leave
            // them staring at an unanswered thread with no sign a reply was
            // ever typed.
            defaultVisibility={
              ticket.source === "CUSTOMER_APP" || ticket.source === "PARTNER_APP"
                ? "customer"
                : "internal"
            }
          />
        </div>
      )}
    </div>
  );
}

/**
 * Internal notes are visually unmistakable — amber field, a lock icon, and the
 * word "Internal" spelled out.
 *
 * Three signals rather than one because colour alone fails a colour-blind
 * agent, and the failure mode here is an agent misreading which kind of note
 * they are looking at and replying in the wrong register.
 */
function NoteBubble({ note }: { note: TicketNote }) {
  const internal = note.visibility === "INTERNAL";
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        internal
          ? "border-[var(--status-pending)]/40 bg-[var(--status-pending-bg)]"
          : "bg-card",
      )}
    >
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1 font-medium",
            internal ? "text-[var(--status-pending)]" : "text-muted-foreground",
          )}
        >
          {internal ? (
            <LockIcon className="size-3" />
          ) : (
            <EyeIcon className="size-3" />
          )}
          {internal ? "Internal" : "Sent to customer"}
        </span>
        <span className="text-muted-foreground">
          {note.authorName} ·{" "}
          {note.createdAt ? new Date(note.createdAt).toLocaleString() : "—"}
        </span>
      </div>
      {note.imageUrl ? (
        // Not next/image: the host is a short-lived signed storage URL, not
        // a configured remote pattern, and it must never be cached — same
        // reasoning as the KYC document viewer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={note.imageUrl}
          alt="Attachment"
          className="mb-2 max-h-64 rounded-md object-contain"
        />
      ) : null}
      {note.body ? (
        <p className="text-sm whitespace-pre-wrap">{note.body}</p>
      ) : null}
    </div>
  );
}

// ── Details ─────────────────────────────────────────────────────────────────

function DetailsTab({ ticket }: { ticket: TicketDetail }) {
  return (
    <div className="flex flex-col gap-4">
      {/* The order comes FIRST. "My laundry came back missing something" is
          the commonest ticket we get, and it is answered by reading the
          order — not by reading the ticket's own metadata, which is what
          this tab used to show. */}
      {ticket.links.orderId ? (
        <TicketOrderContext orderId={ticket.links.orderId} />
      ) : null}

      <dl className="flex flex-col divide-y text-sm">
      <Row
        label="Requester"
        value={
          // The whole point of a ticket is a person, and until this link the
          // drawer named them without going anywhere — the agent had to search
          // for them again to see their orders or whether they had called
          // before.
          <Link
            href={`/context/person/${encodeURIComponent(ticket.requester.uid)}`}
            className="hover:underline"
          >
            {ticket.requester.displayName}
          </Link>
        }
      />
      <Row label="Role" value={ticket.requester.role} />
      <Row label="Email" value={ticket.requester.email} />
      <Row label="Phone" value={ticket.requester.phone} />
      <Row label="Source" value={TICKET_SOURCE_LABELS[ticket.source]} />
      <Row label="Category" value={TICKET_CATEGORY_LABELS[ticket.category]} />
      <Row
        label="Priority"
        value={
          <StatusBadge status={ticket.priority} registry={TICKET_PRIORITY} />
        }
      />
      <Row label="Assignee" value={ticket.assignedToName ?? "Unassigned"} />
      <Row
        label="Payment ref"
        value={ticket.links.paymentReference}
      />
      <Row
        label="First reply"
        value={
          ticket.firstResponseAt
            ? new Date(ticket.firstResponseAt).toLocaleString()
            : "Not yet sent"
        }
      />
      <Row
        label="Resolved"
        value={
          ticket.resolvedAt
            ? `${new Date(ticket.resolvedAt).toLocaleString()}${
                ticket.resolutionCode ? ` · ${ticket.resolutionCode}` : ""
              }`
            : null
        }
      />
      </dl>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode | null;
}) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value ?? "—"}</dd>
    </div>
  );
}

// ── History ─────────────────────────────────────────────────────────────────

function HistoryTab({ ticket }: { ticket: TicketDetail }) {
  const entries = useMemo(
    () =>
      ticket.events.map((event) => ({
        id: event._id,
        at: event.createdAt,
        title: EVENT_LABELS[event.type] ?? event.type,
        actor: event.actorName,
        detail: [
          event.fromValue && event.toValue
            ? `${event.fromValue} → ${event.toValue}`
            : (event.toValue ?? null),
          event.reason,
        ]
          .filter(Boolean)
          .join(" · "),
        // Structural events, not state the status registry knows about, so
        // the tone is set explicitly rather than derived.
        tone:
          event.type === "ESCALATED"
            ? ("danger" as const)
            : event.type === "RESOLVED"
              ? ("success" as const)
              : ("info" as const),
      })),
    [ticket.events],
  );

  return <ActivityTimeline entries={entries} />;
}

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Ticket raised",
  STATUS_CHANGED: "Status changed",
  ASSIGNED: "Assigned",
  UNASSIGNED: "Unassigned",
  ESCALATED: "Escalated",
  PRIORITY_CHANGED: "Priority changed",
  RESOLVED: "Resolved",
  REOPENED: "Reopened",
};

// ── Priority ────────────────────────────────────────────────────────────────

const PRIORITIES: TicketPriority[] = ["URGENT", "HIGH", "NORMAL", "LOW"];

function PriorityPicker({
  value,
  onChange,
}: {
  value: TicketPriority;
  onChange: (priority: TicketPriority) => void;
}) {
  return (
    <Select
      items={Object.fromEntries(
        PRIORITIES.map((p) => [p, TICKET_PRIORITY_LABELS[p]]),
      )}
      value={value}
      onValueChange={(next) => next && onChange(next as TicketPriority)}
    >
      <SelectTrigger className="h-8 w-[130px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRIORITIES.map((p) => (
          <SelectItem key={p} value={p}>
            {TICKET_PRIORITY_LABELS[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Assignment ──────────────────────────────────────────────────────────────

function nameOf(agent: { firstName: string; lastName: string }) {
  return `${agent.firstName} ${agent.lastName}`.trim();
}

const UNASSIGNED_VALUE = "__unassigned__";

function AssigneePicker({
  ticket,
  agents,
  onSelect,
  disabled,
}: {
  ticket: TicketDetail;
  agents: { _id: string; firstName: string; lastName: string }[];
  onSelect: (uid: string | null) => void;
  disabled: boolean;
}) {
  const value = ticket.assignedToUid ?? UNASSIGNED_VALUE;
  const items: Record<string, string> = {
    [UNASSIGNED_VALUE]: "Unassigned",
    ...Object.fromEntries(agents.map((a) => [a._id, nameOf(a)])),
  };

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) =>
        next && onSelect(next === UNASSIGNED_VALUE ? null : next)
      }
      disabled={disabled}
    >
      <SelectTrigger className="h-8 w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
        {agents.map((a) => (
          <SelectItem key={a._id} value={a._id}>
            {nameOf(a)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
