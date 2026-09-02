"use client";

/**
 * THE PUBLISH PATTERN — one flow for every configuration surface.
 *
 *   dirty → review the diff → say why → see the consequence → publish
 *
 * Five Control Room pages change rules that apply to everyone, and each had
 * invented its own ending. Booking Policy asked for a change note and showed
 * no diff. Platform Fees versioned everything and asked for nothing. Website
 * Content, Washer Services and Maintenance Mode saved on a click. The rule
 * they should share is the Control Room's only rule: THE LARGER THE BLAST
 * RADIUS, THE MORE DELIBERATE THE INTERFACE.
 *
 * The diff is what makes the change note honest. An admin who has been editing
 * for ten minutes cannot reliably recall which of thirty numbers they moved,
 * so a note written from memory describes what they MEANT to change. Written
 * beside the diff, it describes what they did.
 *
 * The note stays optional where the backend treats it as optional. A required
 * field here would produce "update" a hundred times, which is worse than an
 * empty one: it looks like a record and is not.
 */

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConsequenceLine, type Consequence } from "./consequence";
import type { FieldChange } from "./config-diff";

export function PublishDialog({
  open,
  onOpenChange,
  title,
  description,
  changes,
  consequence,
  pending,
  confirmLabel = "Publish",
  defaultNote,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** What actually changed. An empty list disables publishing. */
  changes: FieldChange[];
  /** What publishing will do. Omitted where the reach is self-evident. */
  consequence?: Consequence;
  pending: boolean;
  confirmLabel?: string;
  /** Pre-filled when the draft came from a restore. */
  defaultNote?: string;
  onConfirm: (changeNote: string | undefined) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        {/* Keyed and mounted only while open, so the note field is seeded from
            defaultNote on every open rather than synced by an effect. */}
        {open && (
          <PublishForm
            key={defaultNote ?? ""}
            title={title}
            description={description}
            changes={changes}
            consequence={consequence}
            pending={pending}
            confirmLabel={confirmLabel}
            defaultNote={defaultNote}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PublishForm({
  title,
  description,
  changes,
  consequence,
  pending,
  confirmLabel,
  defaultNote,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  changes: FieldChange[];
  consequence?: Consequence;
  pending: boolean;
  confirmLabel: string;
  defaultNote?: string;
  onCancel: () => void;
  onConfirm: (changeNote: string | undefined) => void;
}) {
  const [note, setNote] = useState(defaultNote ?? "");

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="flex max-h-[26rem] flex-col gap-4 overflow-auto">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            {changes.length === 0
              ? "No changes"
              : `${changes.length} change${changes.length === 1 ? "" : "s"}`}
          </h3>
          {changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing differs from what is published.
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border text-sm">
              {changes.map((change) => (
                <li
                  key={change.path}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2"
                >
                  <span className="text-muted-foreground">{change.label}</span>
                  <span className="flex items-baseline gap-2 tabular-nums">
                    {/* Struck-through before, plain after — the direction of
                        the change readable without reading the labels. */}
                    <span className="text-muted-foreground line-through">
                      {change.before}
                    </span>
                    <span aria-hidden>→</span>
                    <span className="font-medium">{change.after}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {consequence && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">What this does</h3>
            <ConsequenceLine consequence={consequence} />
          </section>
        )}

        <section className="flex flex-col gap-2">
          <Label htmlFor="publish-change-note">Change note</Label>
          <Textarea
            id="publish-change-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why this version exists"
            rows={2}
          />
          <p className="text-xs text-muted-foreground">
            Optional, but it is the only thing that explains this version to
            whoever reads the history later.
          </p>
        </section>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          // Publishing nothing writes a version that says nothing, which makes
          // the history harder to read rather than more complete.
          disabled={pending || changes.length === 0}
          onClick={() => onConfirm(note.trim() || undefined)}
        >
          {pending ? "Publishing…" : confirmLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
