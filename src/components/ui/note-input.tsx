"use client";

import { useRef, useState } from "react";
import { EyeIcon, LockIcon, PaperclipIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type NoteVisibility = "internal" | "customer";

/**
 * Dual-mode note composer for tickets, verification reviews and order
 * overrides.
 *
 * The two modes look deliberately different — internal notes sit on a hatched
 * amber field, customer-visible ones on the plain form background. That is not
 * decoration: the failure this component exists to prevent is an agent typing
 * "this guy is lying, close it" into a box that turns out to be customer-
 * visible. Colour alone would not be enough for a colour-blind agent, so the
 * mode is also stated in words on the field and repeated on the submit button.
 *
 * `internal` is the default for the same reason: the safe mode is the one you
 * get by not thinking about it.
 */
export function NoteInput({
  onSubmit,
  pending = false,
  allowCustomerVisible = true,
  allowAttachment = false,
  attachmentAccept,
  defaultVisibility = "internal",
  placeholder = "Add a note…",
  className,
}: {
  onSubmit: (
    note: string,
    visibility: NoteVisibility,
    file?: File,
  ) => void;
  pending?: boolean;
  /**
   * Off by default. Only tickets have somewhere to put an attachment
   * (uploadSupportTicketImage scopes the object to the ticket); the
   * verification and order-override composers that share this component do
   * not, and offering a paperclip that silently drops the file is worse than
   * not offering one.
   */
  allowAttachment?: boolean;
  attachmentAccept?: string;
  /**
   * Set false where nothing can reach the customer yet — a note box that
   * offers a customer-visible mode the backend then drops is worse than one
   * that never offered it.
   */
  allowCustomerVisible?: boolean;
  defaultVisibility?: NoteVisibility;
  placeholder?: string;
  className?: string;
}) {
  const [visibility, setVisibility] = useState<NoteVisibility>(
    allowCustomerVisible ? defaultVisibility : "internal",
  );
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const isInternal = visibility === "internal";

  const clearFile = () => {
    setFile(null);
    // The input keeps its own value, so re-picking the same file after a
    // remove would fire no change event without this.
    if (fileInput.current) fileInput.current.value = "";
  };

  const submit = () => {
    const trimmed = value.trim();
    // An attachment on its own is a complete reply — a photo of the receipt
    // answers the question. Body OR file, not body-and-maybe-file.
    if ((!trimmed && !file) || pending) return;
    onSubmit(trimmed, visibility, file ?? undefined);
    setValue("");
    clearFile();
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {allowCustomerVisible && (
        <div className="flex w-fit items-center gap-1 rounded-lg bg-muted p-0.5">
          <ModeButton
            active={isInternal}
            onClick={() => setVisibility("internal")}
            icon={<LockIcon />}
            label="Internal note"
          />
          <ModeButton
            active={!isInternal}
            onClick={() => setVisibility("customer")}
            icon={<EyeIcon />}
            label="Customer-visible"
          />
        </div>
      )}

      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className={cn(
          isInternal &&
            "border-[var(--status-pending)]/40 bg-[var(--status-pending-bg)]",
        )}
      />

      {allowAttachment && (
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={attachmentAccept}
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          {file ? (
            <span className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
              <PaperclipIcon className="size-3" />
              <span className="max-w-48 truncate">{file.name}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="size-5 p-0"
                onClick={clearFile}
              >
                <XIcon className="size-3" />
                <span className="sr-only">Remove attachment</span>
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => fileInput.current?.click()}
            >
              <PaperclipIcon className="size-3" />
              Attach image
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p
          className={cn(
            "text-xs",
            isInternal
              ? "text-[var(--status-pending)]"
              : "text-muted-foreground",
          )}
        >
          {isInternal
            ? "Only staff can see this. Never exported to the customer."
            : "The customer will see this exactly as written."}
        </p>
        <Button
          size="sm"
          onClick={submit}
          disabled={(!value.trim() && !file) || pending}
        >
          {pending
            ? "Saving…"
            : isInternal
              ? "Add internal note"
              : "Send to customer"}
        </Button>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "outline" : "ghost"}
      className={cn("h-7 gap-1.5 px-2 text-xs", active && "bg-background")}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}
