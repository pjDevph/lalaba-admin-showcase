"use client";

import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Generic yes/no confirmation, action-agnostic so any page can reuse it
// instead of hand-rolling its own AlertDialog (deactivate/reactivate today).
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  confirmPhrase,
  confirmPhraseHint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => void;
  /**
   * When set, the admin must type this exact string before Confirm enables —
   * usually the entity's id or name.
   *
   * For irreversible actions only. A muscle-memory "OK" is exactly how the
   * wrong washer gets suspended at 2am, and typing the name forces the admin
   * to re-read which record they are actually on. Do NOT set it on reversible
   * actions: friction everywhere trains people to ignore it, and then it
   * stops working where it matters.
   */
  confirmPhrase?: string;
  /** Overrides the default "Type <phrase> to confirm" label. */
  confirmPhraseHint?: ReactNode;
}) {
  const [typed, setTyped] = useState("");

  // Clear the typed phrase each time the dialog opens, so a cancelled
  // confirmation can't leave a valid phrase sitting in the box for whichever
  // record is opened next. Adjusting state during render (rather than in an
  // effect) is React's documented way to reset on a prop change.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTyped("");
  }

  // Case- and whitespace-insensitive: the point is deliberate re-reading, not
  // a typing test, and an id pasted with a trailing space should still pass.
  const matches =
    confirmPhrase == null ||
    typed.trim().toLowerCase() === confirmPhrase.trim().toLowerCase();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {confirmPhrase != null && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-phrase">
              {confirmPhraseHint ?? (
                <>
                  Type{" "}
                  <span className="font-mono font-semibold">{confirmPhrase}</span>{" "}
                  to confirm
                </>
              )}
            </Label>
            <Input
              id="confirm-phrase"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={!matches} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
