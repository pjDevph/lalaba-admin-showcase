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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import {
  ANNOUNCEMENT_AUDIENCES,
  type AnnouncementAudience,
  type CreateAnnouncementInput,
  type SiteAnnouncement,
} from "@/lib/graphql/site-content";

type AnnouncementDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcement: SiteAnnouncement | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: CreateAnnouncementInput) => void;
};

export function AnnouncementDialog({
  open,
  onOpenChange,
  announcement,
  submitting,
  error,
  onSubmit,
}: AnnouncementDialogProps) {
  const isEdit = !!announcement;
  const [audience, setAudience] = useState<AnnouncementAudience>(
    announcement?.audience ?? "ALL",
  );
  const [eyebrow, setEyebrow] = useState(announcement?.eyebrow ?? "");
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [description, setDescription] = useState(announcement?.description ?? "");
  const [promoCode, setPromoCode] = useState(announcement?.promoCode ?? "");
  const [validityText, setValidityText] = useState(announcement?.validityText ?? "");
  const [ctaText, setCtaText] = useState(announcement?.ctaText ?? "Book Laundry");
  const [ctaUrl, setCtaUrl] = useState(announcement?.ctaUrl ?? "");
  const [image, setImage] = useState(announcement?.image ?? "");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAudience(announcement?.audience ?? "ALL");
      setEyebrow(announcement?.eyebrow ?? "");
      setTitle(announcement?.title ?? "");
      setDescription(announcement?.description ?? "");
      setPromoCode(announcement?.promoCode ?? "");
      setValidityText(announcement?.validityText ?? "");
      setCtaText(announcement?.ctaText ?? "Book Laundry");
      setCtaUrl(announcement?.ctaUrl ?? "");
      setImage(announcement?.image ?? "");
    }
  }

  const canSubmit =
    eyebrow.trim() && title.trim() && description.trim() && ctaText.trim() && ctaUrl.trim() && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit announcement" : "Add announcement"}</DialogTitle>
          <DialogDescription>
            Display copy for the site&apos;s promo carousel. May mention a code in
            text, but this is never itself a working discount — that lives in
            Promo Codes.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Audience</FieldLabel>
            <Select value={audience} onValueChange={(v) => v && setAudience(v as AnnouncementAudience)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: AnnouncementAudience) =>
                    ANNOUNCEMENT_AUDIENCES.find((a) => a.id === v)?.label ?? v
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ANNOUNCEMENT_AUDIENCES.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="ann-eyebrow">Eyebrow</FieldLabel>
            <Input id="ann-eyebrow" value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} placeholder="New" />
          </Field>
          <Field>
            <FieldLabel htmlFor="ann-title">Title</FieldLabel>
            <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ann-description">Description</FieldLabel>
            <Textarea
              id="ann-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="ann-code">Promo code (optional)</FieldLabel>
              <Input id="ann-code" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ann-validity">Validity text (optional)</FieldLabel>
              <Input id="ann-validity" value={validityText} onChange={(e) => setValidityText(e.target.value)} placeholder="Until Aug 31" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="ann-cta-text">Button text</FieldLabel>
              <Input id="ann-cta-text" value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ann-cta-url">Button link</FieldLabel>
              <Input id="ann-cta-url" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://…" />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="ann-image">Image URL (optional)</FieldLabel>
            <Input id="ann-image" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" />
            <Label className="text-xs text-muted-foreground">
              Paste a link to an already-hosted image — there is no upload here.
            </Label>
          </Field>
          {error && <FieldError>{error}</FieldError>}
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                audience,
                eyebrow: eyebrow.trim(),
                title: title.trim(),
                description: description.trim(),
                promoCode: promoCode.trim() || undefined,
                validityText: validityText.trim() || undefined,
                ctaText: ctaText.trim(),
                ctaUrl: ctaUrl.trim(),
                image: image.trim() || undefined,
              })
            }
          >
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Add announcement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
