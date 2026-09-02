"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CampaignActionField } from "@/components/campaigns/campaign-action-field";
import {
  CampaignCropDialog,
  readImageSize,
} from "@/components/campaigns/campaign-crop-dialog";
import {
  CampaignPreviewDialog,
  croppedPercent,
} from "@/components/campaigns/campaign-preview";
import {
  CAMPAIGN_ACTIONS,
  CAMPAIGN_AUDIENCES,
  CAMPAIGN_FREQUENCIES,
  type Campaign,
  type CampaignActionType,
  type CampaignFrequency,
  type CampaignInput,
} from "@/lib/graphql/campaigns";
import {
  CAMPAIGN_IMAGE_ACCEPT,
  ImageRejected,
  uploadCampaignImage,
} from "@/lib/graphql/media";

type Draft = {
  name: string;
  audienceId: string;
  imageUrl: string;
  altText: string;
  frequency: CampaignFrequency;
  actionType: CampaignActionType;
  promoId: string;
  deepLink: string;
  startsAt: string;
  endsAt: string;
  priority: string;
};

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` with no zone. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Which preset a stored role list came from, so editing shows what was picked. */
function audienceIdFor(roleIds: string[]): string {
  const sorted = [...roleIds].sort().join(",");
  const match = CAMPAIGN_AUDIENCES.find(
    (a) => [...a.roleIds].sort().join(",") === sorted,
  );
  return match?.id ?? CAMPAIGN_AUDIENCES[0].id;
}

const emptyDraft = (): Draft => ({
  name: "",
  audienceId: "customer",
  imageUrl: "",
  altText: "",
  frequency: "ONCE_EVER",
  actionType: "NONE",
  promoId: "",
  deepLink: "",
  startsAt: toLocalInput(new Date().toISOString()),
  endsAt: "",
  priority: "0",
});

export function CampaignFormSheet({
  open,
  editing,
  onOpenChange,
  onSubmit,
  saving,
}: {
  open: boolean;
  /** Null when creating. */
  editing: Campaign | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CampaignInput) => Promise<void>;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // The picked file, held between "chosen" and "uploaded" while the admin
  // decides how it should be cropped — together with its blob URL, whose
  // lifetime this component owns. See the note on CampaignCropDialog's
  // `objectUrl` prop for why it cannot live inside the dialog.
  const [pending, setPending] = useState<{ file: File; url: string } | null>(
    null,
  );
  const [cropOpen, setCropOpen] = useState(false);

  /** Revoke, then forget. Only ever called from an event handler, so Strict
   *  Mode's double-invoked render and effect passes cannot reach it. */
  function clearPending() {
    if (pending) URL.revokeObjectURL(pending.url);
    setPending(null);
  }
  const fileInput = useRef<HTMLInputElement>(null);

  // Re-seed when the sheet opens, so a cancelled edit cannot leave one
  // campaign's artwork sitting in the form for the next one. Adjusting state
  // during render is React's documented way to reset on a prop change.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setErrors({});
      setDraft(
        editing
          ? {
              name: editing.name,
              audienceId: audienceIdFor(editing.targetRoleIds),
              imageUrl: editing.imageUrl,
              altText: editing.altText ?? "",
              frequency: editing.frequency,
              actionType: editing.actionType,
              promoId: editing.promoId ?? "",
              deepLink: editing.deepLink ?? "",
              startsAt: toLocalInput(editing.startsAt),
              endsAt: toLocalInput(editing.endsAt),
              priority: String(editing.priority),
            }
          : emptyDraft(),
      );
    }
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  /**
   * Changing the audience can invalidate the action — a promo campaign
   * re-aimed at merchants, or a deep link re-aimed at "all partners". Reset to
   * an announcement rather than leaving a selection the radio group now shows
   * as disabled, which reads as "this is still set" while the form refuses to
   * save it.
   */
  function setAudience(audienceId: string) {
    setDraft((d) => {
      const action = CAMPAIGN_ACTIONS.find((a) => a.id === d.actionType);
      const stillAllowed =
        !action?.audiences || action.audiences.includes(audienceId);
      return stillAllowed
        ? { ...d, audienceId }
        : { ...d, audienceId, actionType: "NONE", promoId: "", deepLink: "" };
    });
  }

  /**
   * Artwork that is already 3:4 goes straight up; anything else stops at the
   * crop dialog first. Offering to crop a picture that needs no cropping is
   * how a safeguard turns into a step people click past without reading.
   */
  async function pickImage(file: File | undefined) {
    if (!file) return;
    if (fileInput.current) fileInput.current.value = "";
    try {
      const { width, height } = await readImageSize(file);
      if (!croppedPercent(width, height)) {
        await upload(file);
        return;
      }
      // Revoke anything still held, so picking a second file cannot strand
      // the first one's blob in memory.
      if (pending) URL.revokeObjectURL(pending.url);
      setPending({ file, url: URL.createObjectURL(file) });
      setCropOpen(true);
    } catch {
      toast.error("Couldn't read that image. Please try another file.");
    }
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const url = await uploadCampaignImage(file);
      set("imageUrl", url);
      setErrors((e) => ({ ...e, imageUrl: undefined }));
    } catch (err) {
      toast.error(
        err instanceof ImageRejected
          ? err.message
          : "Couldn't upload that image. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  function validate(): CampaignInput | null {
    const next: Partial<Record<keyof Draft, string>> = {};
    if (!draft.name.trim()) next.name = "Give the campaign a name.";
    if (!draft.imageUrl) next.imageUrl = "Upload the image people will see.";
    if (!draft.startsAt) next.startsAt = "Pick when it starts.";
    if (draft.endsAt && draft.startsAt && draft.endsAt <= draft.startsAt) {
      next.endsAt = "The end has to be after the start.";
    }
    // Mirrors the backend's own coherence check, so an action with nothing
    // behind it is caught here as an inline error rather than there as a toast.
    if (draft.actionType === "PROMO" && !draft.promoId) {
      next.promoId = "Pick the voucher this campaign hands out.";
    }
    if (draft.actionType === "DEEP_LINK" && !draft.deepLink) {
      next.deepLink = "Pick the screen this campaign opens.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    const audience =
      CAMPAIGN_AUDIENCES.find((a) => a.id === draft.audienceId) ??
      CAMPAIGN_AUDIENCES[0];

    return {
      name: draft.name.trim(),
      targetRoleIds: audience.roleIds,
      imageUrl: draft.imageUrl,
      altText: draft.altText.trim() || undefined,
      frequency: draft.frequency,
      actionType: draft.actionType,
      // Sent only with the action that owns it. On an edit these are the
      // fields that clear a previous action, so an empty string — not
      // undefined — is what has to reach the update.
      promoId: draft.actionType === "PROMO" ? draft.promoId : "",
      deepLink: draft.actionType === "DEEP_LINK" ? draft.deepLink : "",
      startsAt: new Date(draft.startsAt).toISOString(),
      endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : undefined,
      priority: Number(draft.priority) || 0,
    };
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit campaign" : "New campaign"}</SheetTitle>
          <SheetDescription>
            A full-screen image shown after sign-in. It can advertise a promo
            code, but it never applies a discount itself.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="campaign-name">Name</FieldLabel>
              <Input
                id="campaign-name"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Welcome ₱100"
                maxLength={200}
              />
              <FieldDescription>
                Internal only — people never see this.
              </FieldDescription>
              {errors.name && <FieldError>{errors.name}</FieldError>}
            </Field>

            <Field>
              <FieldLabel>Audience</FieldLabel>
              <RadioGroup
                value={draft.audienceId}
                onValueChange={(v) => setAudience(v)}
                className="gap-2"
              >
                {CAMPAIGN_AUDIENCES.map((a) => (
                  <div key={a.id} className="flex items-start gap-2">
                    <RadioGroupItem value={a.id} id={`aud-${a.id}`} className="mt-1" />
                    <Label htmlFor={`aud-${a.id}`} className="font-normal">
                      <span className="block">{a.label}</span>
                      {a.hint && (
                        <span className="text-muted-foreground block text-xs">
                          {a.hint}
                        </span>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </Field>

            <Field>
              <FieldLabel>Image</FieldLabel>
              {draft.imageUrl ? (
                <div className="relative overflow-hidden rounded-md border">
                  {/* Remote host is the storage bucket; unoptimized keeps this
                      working without registering every bucket domain in
                      next.config. */}
                  <Image
                    src={draft.imageUrl}
                    alt={draft.altText || "Campaign artwork"}
                    width={640}
                    height={800}
                    unoptimized
                    className="h-auto w-full"
                  />
                </div>
              ) : (
                <div className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
                  No image yet
                </div>
              )}
              <input
                ref={fileInput}
                type="file"
                accept={CAMPAIGN_IMAGE_ACCEPT}
                className="hidden"
                onChange={(e) => void pickImage(e.target.files?.[0])}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={uploading}
                  onClick={() => fileInput.current?.click()}
                >
                  {uploading
                    ? "Uploading…"
                    : draft.imageUrl
                      ? "Replace image"
                      : "Upload image"}
                </Button>
                {/* The thumbnail above shows the whole file; the app shows a
                    3:4 cover crop of it. Those are different pictures, and
                    only one of them is what people see. */}
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={!draft.imageUrl}
                  onClick={() => setPreviewOpen(true)}
                >
                  Preview on phone
                </Button>
              </div>
              <FieldDescription>
                JPG, PNG or WebP, up to 5 MB. The popup crops to 3:4, so
                artwork sized 1200 × 1600 shows in full.
              </FieldDescription>
              {errors.imageUrl && <FieldError>{errors.imageUrl}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="campaign-alt">Image description</FieldLabel>
              <Input
                id="campaign-alt"
                value={draft.altText}
                onChange={(e) => set("altText", e.target.value)}
                placeholder="₱100 off your first laundry"
                maxLength={200}
              />
              <FieldDescription>
                Read aloud in place of the image by screen readers.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>How often</FieldLabel>
              <RadioGroup
                value={draft.frequency}
                onValueChange={(v) => set("frequency", v as CampaignFrequency)}
                className="gap-2"
              >
                {CAMPAIGN_FREQUENCIES.map((f) => (
                  <div key={f.id} className="flex items-start gap-2">
                    <RadioGroupItem value={f.id} id={`freq-${f.id}`} className="mt-1" />
                    <Label htmlFor={`freq-${f.id}`} className="font-normal">
                      <span className="block">{f.label}</span>
                      <span className="text-muted-foreground block text-xs">
                        {f.hint}
                      </span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </Field>

            <CampaignActionField
              audienceId={draft.audienceId}
              audienceRoleIds={
                CAMPAIGN_AUDIENCES.find((a) => a.id === draft.audienceId)
                  ?.roleIds ?? []
              }
              actionType={draft.actionType}
              promoId={draft.promoId}
              deepLink={draft.deepLink}
              errors={{ promoId: errors.promoId, deepLink: errors.deepLink }}
              onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            />

            <Field>
              <FieldLabel htmlFor="campaign-start">Starts</FieldLabel>
              <Input
                id="campaign-start"
                type="datetime-local"
                value={draft.startsAt}
                onChange={(e) => set("startsAt", e.target.value)}
              />
              {errors.startsAt && <FieldError>{errors.startsAt}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="campaign-end">Ends</FieldLabel>
              <Input
                id="campaign-end"
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => set("endsAt", e.target.value)}
              />
              <FieldDescription>
                Leave blank to run until you pause it.
              </FieldDescription>
              {errors.endsAt && <FieldError>{errors.endsAt}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="campaign-priority">Priority</FieldLabel>
              <Input
                id="campaign-priority"
                type="number"
                min={0}
                value={draft.priority}
                onChange={(e) => set("priority", e.target.value)}
              />
              <FieldDescription>
                Only one popup is ever shown at a time. When several are due,
                the highest priority wins and the rest wait.
              </FieldDescription>
            </Field>

            {editing && (
              <p className="text-muted-foreground text-xs">
                Editing does not re-show this campaign to anyone who has already
                seen it — their showing still counts. To reach those people
                again, publish a new campaign.
              </p>
            )}
          </FieldGroup>
        </div>

        <SheetFooter>
          <Button
            onClick={() => {
              const input = validate();
              if (input) void onSubmit(input);
            }}
            disabled={saving || uploading}
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Create draft"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
        </SheetFooter>

        {/* One instance per picked file: the crop dialog creates its object
            URL once, in a state initialiser, and a keyed remount is what
            guarantees a new file never shows the previous one's artwork. */}
        {pending && (
          <CampaignCropDialog
            open={cropOpen}
            file={pending.file}
            objectUrl={pending.url}
            onOpenChange={(open) => {
              setCropOpen(open);
              if (!open) clearPending();
            }}
            onCropped={(cropped) => {
              setCropOpen(false);
              clearPending();
              void upload(cropped);
            }}
            onUseAsIs={(original) => {
              setCropOpen(false);
              clearPending();
              void upload(original);
            }}
          />
        )}

        <CampaignPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          name={draft.name}
          imageUrl={draft.imageUrl}
          altText={draft.altText}
          actionType={draft.actionType}
        />
      </SheetContent>
    </Sheet>
  );
}
