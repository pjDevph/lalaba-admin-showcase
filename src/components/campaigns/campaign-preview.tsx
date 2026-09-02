"use client";

import { useState } from "react";
import { X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEVICE_WIDTH,
  PhoneFrame,
} from "@/components/ui/phone-frame";
import {
  CAMPAIGN_ACTION_EFFECTS,
  type CampaignActionType,
} from "@/lib/graphql/campaigns";

/**
 * WHAT THE POPUP ACTUALLY LOOKS LIKE ON A PHONE.
 *
 * A campaign is nothing but artwork, so the only meaningful review is visual —
 * and the admin form's inline thumbnail is misleading in the one way that
 * matters: it shows the whole file, letter-boxed to whatever width the sheet
 * happens to be. The app does not. It renders a fixed 3:4 card with a COVER
 * crop, which silently throws away the top and bottom of a tall poster.
 *
 * So this is not a decorative frame. The numbers below are copied from the
 * real component (LALABA_*_APP_DEV/src/components/CampaignPopup.tsx) rather
 * than eyeballed, and the crop warning is computed from the uploaded file's
 * own dimensions. If those numbers change in the app, they must change here —
 * a preview that has drifted from the thing it previews is worse than none.
 */

/** From CampaignPopup: `Math.min(width - SP.xl * 2, 420)`, SP.xl = 24. */
const CARD_WIDTH = Math.min(DEVICE_WIDTH - 24 * 2, 420);

/** From CampaignPopup: the image is always `aspectRatio: 3 / 4`, `cover`.
 *  Exported because the crop dialog exists to match exactly this number. */
export const CARD_ASPECT = 3 / 4;

/**
 * How much of the artwork the cover crop hides.
 *
 * Cover fills the box and clips the overflowing axis, so the visible fraction
 * of the long axis is the ratio of the two aspect ratios. Returned as a
 * percentage of the ORIGINAL, which is the number an admin can act on: "28% of
 * your poster is not on screen" tells them to re-crop, "the aspect ratio is
 * 0.53" does not.
 */
export function croppedPercent(
  naturalWidth: number,
  naturalHeight: number,
): { axis: "height" | "width"; percent: number } | null {
  if (!naturalWidth || !naturalHeight) return null;
  const ratio = naturalWidth / naturalHeight;
  const hidden =
    ratio < CARD_ASPECT
      ? { axis: "height" as const, percent: 1 - ratio / CARD_ASPECT }
      : { axis: "width" as const, percent: 1 - CARD_ASPECT / ratio };
  // Under ~2% is rounding on an image that was cropped to 3:4 already; calling
  // that "cropped" would train admins to ignore the warning.
  return hidden.percent < 0.02
    ? null
    : { axis: hidden.axis, percent: Math.round(hidden.percent * 100) };
}

/**
 * The phone. Renders at full device scale and is shrunk with a transform, so
 * every inset stays proportional to the real thing instead of being re-guessed
 * in Tailwind units.
 */
export function CampaignPhonePreview({
  imageUrl,
  altText,
  onNatural,
}: {
  imageUrl: string;
  altText: string;
  /** Reports the file's own dimensions once the browser has them. */
  onNatural?: (width: number, height: number) => void;
}) {
  return (
    <PhoneFrame>
      {/* The app screen behind the modal is never part of the review, so it
          stays a neutral ground rather than a fake home screen that would
          invite feedback on a thing this page cannot change. */}
      <div className="absolute inset-0 bg-neutral-200" />

      {/* Scrim: rgba(0,0,0,0.6), from the Modal's container style. */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.6)", padding: 24 }}
      >
        <div style={{ width: CARD_WIDTH }}>
          <div
            className="overflow-hidden bg-white"
            style={{ borderRadius: 14, aspectRatio: "3 / 4" }}
          >
            {imageUrl ? (
              /* Raw <img> on purpose: the whole point of this element is
                 to reproduce the app's own cover crop, and next/image would
                 re-encode and re-fit the artwork before we could see it. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={altText || "Campaign artwork"}
                className="h-full w-full object-cover"
                onLoad={(e) =>
                  onNatural?.(
                    e.currentTarget.naturalWidth,
                    e.currentTarget.naturalHeight,
                  )
                }
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
                No image yet
              </div>
            )}
          </div>

          {/* Close sits BELOW the card in the app, deliberately — see the
              comment there. Reproduced so nobody designs artwork with a gap
              at the top for a close button that is not there. */}
          <div
            className="flex items-center justify-center gap-1.5 text-white"
            style={{ marginTop: 16, paddingTop: 8, paddingBottom: 8 }}
          >
            <X size={16} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Close</span>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

/** The preview as a dialog, for the form sheet and the campaign list. */
export function CampaignPreviewDialog({
  open,
  onOpenChange,
  name,
  imageUrl,
  altText,
  actionType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  imageUrl: string;
  altText: string;
  actionType: CampaignActionType;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const cropped = natural ? croppedPercent(natural.w, natural.h) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{name.trim() || "Untitled campaign"}</DialogTitle>
          <DialogDescription>
            How the popup appears on a phone after sign-in. Tapping the
            artwork{" "}
            <span className="text-foreground">
              {CAMPAIGN_ACTION_EFFECTS[actionType]}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          <CampaignPhonePreview
            imageUrl={imageUrl}
            altText={altText}
            onNatural={(w, h) => setNatural({ w, h })}
          />
        </div>

        {cropped ? (
          <p className="text-sm text-amber-600 dark:text-amber-500">
            About {cropped.percent}% of the artwork&apos;s {cropped.axis} is
            cropped off — the popup always shows a 3:4 card. Re-crop the image
            to 3:4 (for example 1200 × 1600) to keep all of it on screen.
          </p>
        ) : (
          natural && (
            <p className="text-muted-foreground text-sm">
              The artwork fits the 3:4 card with nothing cropped.
            </p>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
