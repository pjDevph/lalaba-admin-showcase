"use client";

/**
 * RAISE A TICKET — the thing a support agent does on a phone call.
 *
 * `createSupportTicket` has been ('admin', 'support') on the backend since the
 * module shipped and had no caller anywhere in the panel. So the inbox could
 * show, assign, reply to, escalate and resolve a ticket, and there was no way
 * to START one — which meant the commonest support interaction there is,
 * someone phoning in a complaint, had nowhere to go.
 *
 * The requester is picked from the account directory rather than typed,
 * because a ticket that is not attached to a real account cannot be found
 * again from that person's context, which is where the next agent will look
 * for it.
 */

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { listDirectoryUsers } from "@/lib/graphql/directory";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_SOURCE_LABELS,
  createTicket,
  type TicketCategory,
  type TicketPriority,
  type TicketSource,
} from "@/lib/graphql/tickets";

export function NewTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        {/* Mounted only while open, so every ticket starts from a blank form
            rather than the previous caller's details. */}
        {open && (
          <NewTicketForm
            onCancel={() => onOpenChange(false)}
            onCreated={() => {
              onOpenChange(false);
              onCreated();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewTicketForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [search, setSearch] = useState("");
  const [requesterUid, setRequesterUid] = useState<string | null>(null);
  const [requesterLabel, setRequesterLabel] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<TicketCategory>("ORDER_LATE");
  // PHONE is the default because that is how a ticket comes to be raised HERE
  // rather than in an app — an agent is on a call. ADMIN is for the cases an
  // agent opens on their own initiative.
  const [source, setSource] = useState<TicketSource>("PHONE");
  const [priority, setPriority] = useState<TicketPriority>("NORMAL");
  const [orderId, setOrderId] = useState("");

  const debounced = useDebouncedValue(search, 250);

  const people = useQuery({
    queryKey: ["new-ticket-requester", debounced.trim()],
    queryFn: () =>
      listDirectoryUsers({ search: debounced.trim(), limit: 6, offset: 0 }),
    enabled: debounced.trim().length >= 3,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createTicket({
        requesterUid: requesterUid as string,
        subject: subject.trim(),
        body: body.trim(),
        category,
        source,
        priority,
        orderId: orderId.trim() || undefined,
      }),
    onSuccess: (result) => {
      toast.success(
        `Ticket ${result.createSupportTicket.ticketNumber} raised.`,
      );
      onCreated();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Could not raise the ticket.",
      ),
  });

  const ready = requesterUid && subject.trim() && body.trim();

  return (
    <>
      <DialogHeader>
        <DialogTitle>Raise a ticket</DialogTitle>
        <DialogDescription>
          For a complaint that arrived by phone or in person. Anything raised
          in an app already appears in the inbox on its own.
        </DialogDescription>
      </DialogHeader>

      <div className="flex max-h-[26rem] flex-col gap-4 overflow-auto">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ticket-requester">Who is this about?</Label>
          {requesterUid ? (
            <div className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
              <span>{requesterLabel}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRequesterUid(null);
                  setRequesterLabel(null);
                }}
              >
                Change
              </Button>
            </div>
          ) : (
            <>
              <Input
                id="ticket-requester"
                value={search}
                placeholder="Name, email or phone number…"
                onChange={(event) => setSearch(event.target.value)}
              />
              {/* Picked from the directory, never typed free-hand: a ticket
                  attached to no real account cannot be found again from that
                  person's context, which is where the next agent will look. */}
              {debounced.trim().length >= 3 && (
                <div className="flex flex-col gap-1 rounded-md border p-1">
                  {people.isPending ? (
                    <p className="p-2 text-sm text-muted-foreground">
                      Searching…
                    </p>
                  ) : people.data?.data.length ? (
                    people.data.data.map((person) => (
                      <button
                        key={person.uid}
                        type="button"
                        className="rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setRequesterUid(person.uid);
                          setRequesterLabel(
                            `${person.displayName} · ${person.phoneNumber ?? person.email ?? person.uid}`,
                          );
                        }}
                      >
                        <span className="block">{person.displayName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[person.phoneNumber, person.email]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="p-2 text-sm text-muted-foreground">
                      Nobody matches that.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ticket-subject">Subject</Label>
          <Input
            id="ticket-subject"
            value={subject}
            placeholder="One line — what they are calling about"
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ticket-body">What they said</Label>
          <Textarea
            id="ticket-body"
            value={body}
            rows={4}
            placeholder="In their words, as far as possible."
            onChange={(event) => setBody(event.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as TicketCategory)}
            >
              <SelectTrigger>
                <SelectValue labels={TICKET_CATEGORY_LABELS} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TICKET_CATEGORY_LABELS).map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Came in by</Label>
            <Select
              value={source}
              onValueChange={(v) => setSource(v as TicketSource)}
            >
              <SelectTrigger>
                <SelectValue labels={TICKET_SOURCE_LABELS} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TICKET_SOURCE_LABELS).map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Priority</Label>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as TicketPriority)}
            >
              <SelectTrigger>
                <SelectValue labels={TICKET_PRIORITY_LABELS} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TICKET_PRIORITY_LABELS).map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ticket-order">Order id (optional)</Label>
          <Input
            id="ticket-order"
            value={orderId}
            placeholder="Paste one if the call is about a specific order"
            onChange={(event) => setOrderId(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Attaching it puts the order&apos;s own details on the ticket, so
            whoever picks this up does not have to look it up again.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={!ready || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Raising…" : "Raise ticket"}
        </Button>
      </DialogFooter>
    </>
  );
}
