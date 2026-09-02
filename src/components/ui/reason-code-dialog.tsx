"use client";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type ReasonCode = {
  code: string;
  /** What the admin picking it reads. Internal wording. */
  label: string;
  /**
   * Auto-drafted copy for the person on the receiving end, where the reason
   * is shown to them (a revoked courier, a rejected applicant). Written in
   * the second person and always actionable — the recipient is locked out of
   * something and needs to know what to fix, not why we are annoyed.
   *
   * Compose it with `draftMessage()`, never send the bare code: "SPOOFED" is
   * an analytics value, not something to show a rider.
   */
  message?: string;
  /** Forces the note field even when the dialog wouldn't otherwise. */
  requiresNote?: boolean;
};

/**
 * The recipient-facing sentence for a decision: the code's standard copy with
 * the admin's note appended. Falls back to the note alone if the code carries
 * no standard copy, and to the label as a last resort — never returns "".
 */
export function draftMessage(
  reasons: readonly ReasonCode[],
  code: string,
  note: string | null,
): string {
  const reason = reasons.find((r) => r.code === code);
  const base = reason?.message ?? reason?.label ?? code;
  return note ? `${base} ${note}` : base;
}

type ReasonCodeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  reasons: readonly ReasonCode[];
  confirmLabel: string;
  /** Styles the confirm button as destructive. Default true — this dialog exists for destructive actions. */
  destructive?: boolean;
  pending?: boolean;
  onConfirm: (reason: string, note: string | null) => void;
  /** Rendered above the reason picker — e.g. "this will take the doc off another reviewer". */
  notice?: React.ReactNode;
};

/**
 * The required stop before anything destructive or overriding: reject a
 * document, suspend a provider, revoke a photo, override an order.
 *
 * Two rules it exists to enforce:
 *
 *  1. A reason is mandatory. Confirm stays disabled until one is picked, and
 *     the dialog cannot be dismissed by clicking outside or pressing Escape —
 *     the only ways out are Cancel and Confirm, both of which are decisions.
 *     A free-text-only box would have been easier, but then "why do we reject
 *     most washers" is unanswerable without reading prose.
 *
 *  2. The reason is a CODE, not a sentence. The free-text note is additional
 *     colour, never the record itself.
 *
 * Modelled on the KYC rejection flow, which was the only place in the panel
 * that did this properly, and generalised so suspend/revoke/override can stop
 * shipping bare confirm dialogs.
 */
export function ReasonCodeDialog({
  open,
  onOpenChange,
  title,
  description,
  reasons,
  confirmLabel,
  destructive = true,
  pending = false,
  onConfirm,
  notice,
}: ReasonCodeDialogProps) {
  const [code, setCode] = useState<string>("");
  const [note, setNote] = useState("");

  // Reset on open, not on close: leaving the values in place while the dialog
  // animates out avoids the fields visibly emptying mid-transition. Adjusting
  // state during render (rather than in an effect) is React's documented way
  // to reset on a prop change.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCode("");
      setNote("");
    }
  }

  const selected = reasons.find((r) => r.code === code);
  const noteRequired = selected?.requiresNote ?? false;
  const canConfirm =
    code !== "" && (!noteRequired || note.trim().length > 0) && !pending;

  const items = Object.fromEntries(reasons.map((r) => [r.code, r.label]));

  return (
    <Dialog
      open={open}
      // Non-dismissable: the only ways out are Cancel and Confirm. Clicking
      // the backdrop or pressing Escape is an accident, not a decision, and
      // this dialog is the record of a decision.
      disablePointerDismissal
      onOpenChange={(next, details) => {
        if (!next && (details.reason === "escape-key" || pending)) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {notice && (
          <p className="rounded-md bg-[var(--status-pending-bg)] px-3 py-2 text-sm text-[var(--status-pending)]">
            {notice}
          </p>
        )}

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="reason-code">Reason</Label>
            <Select
              items={items}
              value={code}
              onValueChange={(value) => setCode(String(value ?? ""))}
            >
              <SelectTrigger id="reason-code" className="w-full">
                <SelectValue placeholder="Select a reason…" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((reason) => (
                  <SelectItem key={reason.code} value={reason.code}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="reason-note">
              Note {noteRequired ? "(required)" : "(optional)"}
            </Label>
            <Textarea
              id="reason-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Anything the next person reading this record needs to know."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!canConfirm}
            onClick={() => onConfirm(code, note.trim() || null)}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Shared reason vocabularies ──────────────────────────────────────────────
// Kept here rather than at the call sites so the same act ("we suspended
// someone") reads the same way whoever did it, and so the codes can be
// counted. Codes are SCREAMING_SNAKE to match how the backend stores enums.

export const PROVIDER_SUSPENSION_REASONS: readonly ReasonCode[] = [
  { code: "CUSTOMER_COMPLAINTS", label: "Repeated customer complaints" },
  { code: "QUALITY_FAILURE", label: "Service quality failure" },
  { code: "NO_SHOW_PATTERN", label: "Repeated no-shows or cancellations" },
  { code: "FRAUD_SUSPECTED", label: "Suspected fraud or abuse" },
  { code: "DOCUMENTS_INVALID", label: "Verification documents no longer valid" },
  { code: "PROVIDER_REQUEST", label: "Provider asked to pause" },
  { code: "OTHER", label: "Other (describe below)", requiresNote: true },
];

// The courier is shown this reason on the lockout screen, so every code
// carries copy telling them exactly what to do to get working again.
export const COURIER_PHOTO_REVOKE_REASONS: readonly ReasonCode[] = [
  {
    code: "NOT_THE_COURIER",
    label: "Photo is not the registered courier",
    message:
      "The photo does not match the registered courier for this account. Retake it yourself — someone else cannot take it for you.",
  },
  {
    code: "UNRECOGNISABLE",
    label: "Face not clearly visible",
    message:
      "Your face is not clearly visible. Retake the photo in good light, looking straight at the camera, with nothing covering your face.",
  },
  {
    code: "INAPPROPRIATE",
    label: "Inappropriate or offensive image",
    message:
      "This photo is not acceptable. Retake a plain, clear photo of your face.",
  },
  {
    code: "SPOOFED",
    label: "Suspected spoofed or replayed capture",
    message:
      "This photo could not be verified as a live capture. Retake it in the app now, in good light, following the on-screen prompts.",
  },
  {
    code: "OTHER",
    label: "Other (describe below)",
    message: "Your photo was rejected.",
    requiresNote: true,
  },
];

export const ACCOUNT_DEACTIVATION_REASONS: readonly ReasonCode[] = [
  { code: "REQUESTED_BY_OWNER", label: "Requested by the account owner" },
  { code: "FRAUD_SUSPECTED", label: "Suspected fraud or abuse" },
  { code: "DUPLICATE_ACCOUNT", label: "Duplicate account" },
  { code: "NON_COMPLIANCE", label: "Non-compliance with platform terms" },
  { code: "INACTIVE", label: "Dormant account cleanup" },
  { code: "OTHER", label: "Other (describe below)", requiresNote: true },
];

// Ending someone's session is not a punishment — it is nearly always a
// device problem — so the codes are about the DEVICE, not the person.
export const SESSION_REVOKE_REASONS: readonly ReasonCode[] = [
  { code: "DEVICE_LOST", label: "Device lost or stolen" },
  { code: "SHARED_DEVICE", label: "Signed in on a shared machine" },
  { code: "SUSPECTED_COMPROMISE", label: "Suspected account compromise" },
  { code: "ROLE_CHANGED", label: "Role or access changed" },
  { code: "OFFBOARDING", label: "Leaving the team" },
  { code: "OTHER", label: "Other (describe below)", requiresNote: true },
];

/**
 * Why an order is being moved by hand. Every one of these describes a
 * BREAKDOWN — the app not doing what it should have — because that is the only
 * legitimate reason to move an order manually. "Customer asked nicely" is not
 * on the list on purpose.
 */
export const ORDER_OVERRIDE_REASONS: readonly ReasonCode[] = [
  { code: "APP_NOT_SYNCED", label: "Provider or courier acted, app never synced" },
  { code: "DEVICE_FAILURE", label: "Device offline or broken at the doorstep" },
  { code: "STUCK_ORDER", label: "Order stuck, confirmed by phone" },
  { code: "WRONG_ACTION", label: "Wrong action taken in the app" },
  { code: "DATA_FIX", label: "Correcting a known data problem" },
  { code: "OTHER", label: "Other (describe below)", requiresNote: true },
];

// Taking a review down hides a customer's own words and changes a provider's
// public score, so the codes describe what is WRONG with the review — never
// that the provider disliked it.
export const REVIEW_TAKEDOWN_REASONS: readonly ReasonCode[] = [
  { code: "ABUSIVE", label: "Abusive or harassing language" },
  { code: "PERSONAL_INFO", label: "Contains someone's personal information" },
  { code: "NOT_ABOUT_SERVICE", label: "Not about the service received" },
  { code: "SPAM", label: "Spam or advertising" },
  { code: "FAKE", label: "Confirmed fake or from a competitor" },
  { code: "OTHER", label: "Other (describe below)", requiresNote: true },
];

export const REVIEW_RESTORE_REASONS: readonly ReasonCode[] = [
  { code: "MISTAKE", label: "Taken down in error" },
  { code: "APPEAL_UPHELD", label: "Customer appealed and was right" },
  { code: "POLICY_CHANGED", label: "No longer breaches the guidelines" },
  { code: "OTHER", label: "Other (describe below)", requiresNote: true },
];

// Dismissing means the review STAYS UP — these say why it was acceptable.
export const REVIEW_DISMISS_REASONS: readonly ReasonCode[] = [
  { code: "WITHIN_GUIDELINES", label: "Harsh but within the guidelines" },
  { code: "ACCURATE", label: "Complaint appears accurate" },
  { code: "NO_EVIDENCE", label: "No evidence supporting the report" },
  { code: "OTHER", label: "Other (describe below)", requiresNote: true },
];

// Signing in as someone else needs a real reason on file — this is the most
// sensitive action in the panel, and every one of these describes something
// that could not be resolved WITHOUT seeing their account directly.
export const IMPERSONATION_REASONS: readonly ReasonCode[] = [
  { code: "REPRODUCING_BUG", label: "Reproducing a reported bug" },
  { code: "VERIFYING_DATA", label: "Verifying what the customer sees" },
  { code: "FRAUD_INVESTIGATION", label: "Investigating suspected fraud" },
  { code: "SUPPORT_ESCALATION", label: "Support requested engineering's help" },
  { code: "OTHER", label: "Other (describe below)", requiresNote: true },
];

// There is no live checkout flow yet, so every redemption recorded here is an
// admin acting on someone's behalf — these describe WHY, not "customer used
// a code" (that path does not exist).
// The wallet is prepaid with no withdrawal path — a manual adjustment is a
// correction, not a routine tool, so every code names a specific breakdown
// the three ledgered paths (top-up, fee consumption, fee reversal) don't
// cover, never "provider asked for money."
export const WALLET_ADJUSTMENT_REASONS: readonly ReasonCode[] = [
  { code: "BILLING_MISTAKE", label: "Platform-side billing mistake" },
  { code: "DUPLICATE_FEE_CHARGED", label: "Fee consumed twice for one order" },
  { code: "TOPUP_NOT_CREDITED", label: "Verified top-up never posted" },
  { code: "GOODWILL_CREDIT", label: "Goodwill credit for a service issue" },
  { code: "OTHER", label: "Other (describe below)", requiresNote: true },
];

export const PROMO_REDEMPTION_REASONS: readonly ReasonCode[] = [
  { code: "GOODWILL_GESTURE", label: "Goodwill gesture for a service issue" },
  { code: "CODE_FAILED_AT_CHECKOUT", label: "Code did not apply due to a bug" },
  { code: "MANUAL_CORRECTION", label: "Correcting an order priced without it" },
  { code: "OTHER", label: "Other (describe below)", requiresNote: true },
];
