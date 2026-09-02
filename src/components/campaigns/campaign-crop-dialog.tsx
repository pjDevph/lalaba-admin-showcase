"use client";

import { useCallback, useRef, useState } from "react";

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
import { Slider } from "@/components/ui/slider";
import { CARD_ASPECT } from "@/components/campaigns/campaign-preview";

/**
 * CROP TO THE SHAPE THE POPUP ACTUALLY SHOWS.
 *
 * The app renders a fixed 3:4 card with a cover crop, so artwork of any other
 * shape loses its edges. Left alone, WHICH edges is decided by a centring rule
 * nobody chose — and on a tall poster that is reliably the call-to-action at
 * the bottom.
 *
 * This makes the choice explicit and puts it in front of the person who knows
 * what the artwork is for. It is not a general image editor and should not
 * grow into one: one fixed aspect, pan and zoom, no rotate, no filters.
 *
 * Hand-rolled rather than pulling in a cropping library — the interaction is
 * one drag and one slider against one fixed aspect ratio, and the canvas
 * export would have to be written either way.
 */

/** The crop window on screen. 3:4, sized to sit in a dialog without scrolling. */
export const VIEW_WIDTH = 288;
export const VIEW_HEIGHT = Math.round(VIEW_WIDTH / CARD_ASPECT); // 384

/** Longest edge of the exported file. Matches the 1200 × 1600 guidance; the
 *  export never upscales past the crop's real pixels, so a small source stays
 *  small rather than being blown up into a soft, larger file. */
const MAX_OUTPUT_WIDTH = 1200;

const MAX_ZOOM = 3;

export type Placement = { zoom: number; x: number; y: number };

/**
 * Keeps the image covering the window.
 *
 * Every drag and every zoom step runs through this, so there is no state in
 * which a corner of the crop is empty — a gap would export as transparent or
 * black and nobody would notice until it was on a phone.
 */
export function clamp(
  placement: Placement,
  displayWidth: number,
  displayHeight: number,
): Placement {
  const minX = Math.min(0, VIEW_WIDTH - displayWidth);
  const minY = Math.min(0, VIEW_HEIGHT - displayHeight);
  return {
    zoom: placement.zoom,
    x: Math.min(0, Math.max(minX, placement.x)),
    y: Math.min(0, Math.max(minY, placement.y)),
  };
}

/**
 * The file's own dimensions, read before anything is uploaded.
 *
 * Lets the caller skip the crop dialog entirely for artwork that is already
 * 3:4 — a step that changes nothing is a step that teaches people to click
 * through without looking.
 */
export function readImageSize(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

/**
 * The crop window expressed in the ORIGINAL file's pixels.
 *
 * Dividing the on-screen offsets back out by the scale is what makes the
 * export a true crop of the source rather than a re-encode of the 288px
 * preview — the difference between a 1200px-wide ad and a blurry one.
 */
export function sourceRect(placement: Placement, scale: number) {
  return {
    sx: -placement.x / scale,
    sy: -placement.y / scale,
    sw: VIEW_WIDTH / scale,
    sh: VIEW_HEIGHT / scale,
  };
}

export function CampaignCropDialog({
  open,
  file,
  objectUrl,
  onOpenChange,
  onCropped,
  onUseAsIs,
}: {
  open: boolean;
  /** The file the admin just picked, before any upload. */
  file: File;
  /**
   * A blob URL for that file, created AND revoked by the parent.
   *
   * Deliberately not owned here. An object URL is a live handle into the
   * browser's blob store, and the obvious way to manage one — create it in a
   * state initialiser, revoke it in an effect cleanup — is broken under React
   * Strict Mode, which mounts, unmounts and remounts every component in
   * development. The cleanup fires on that simulated unmount and revokes the
   * URL while the `<img>` is still pointing at it, so the crop window comes up
   * blank and nothing ever fires `onLoad`. Owning the lifecycle in the
   * parent's event handlers keeps it out of the double-invoked path entirely.
   */
  objectUrl: string;
  onOpenChange: (open: boolean) => void;
  onCropped: (cropped: File) => void;
  /** Skip the crop and upload the original, cover-crop and all. */
  onUseAsIs: (original: File) => void;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [placement, setPlacement] = useState<Placement>({ zoom: 1, x: 0, y: 0 });
  const [exporting, setExporting] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);


  /** Scale at which the image exactly covers the window — zoom 1. */
  const baseScale = natural
    ? Math.max(VIEW_WIDTH / natural.w, VIEW_HEIGHT / natural.h)
    : 1;
  const scale = baseScale * placement.zoom;
  const displayWidth = natural ? natural.w * scale : 0;
  const displayHeight = natural ? natural.h * scale : 0;

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const w = e.currentTarget.naturalWidth;
      const h = e.currentTarget.naturalHeight;
      setNatural({ w, h });
      // Start centred on the overflowing axis, which is the sane default and
      // matches what the app would have done unaided.
      const base = Math.max(VIEW_WIDTH / w, VIEW_HEIGHT / h);
      setPlacement({
        zoom: 1,
        x: (VIEW_WIDTH - w * base) / 2,
        y: (VIEW_HEIGHT - h * base) / 2,
      });
    },
    [],
  );

  function setZoom(zoom: number) {
    if (!natural) return;
    const nextScale = baseScale * zoom;
    const nextW = natural.w * nextScale;
    const nextH = natural.h * nextScale;
    // Zoom about the centre of the window, so the thing the admin is looking
    // at stays where it is instead of sliding away from under the pointer.
    const cx = (VIEW_WIDTH / 2 - placement.x) / displayWidth;
    const cy = (VIEW_HEIGHT / 2 - placement.y) / displayHeight;
    setPlacement(
      clamp(
        { zoom, x: VIEW_WIDTH / 2 - cx * nextW, y: VIEW_HEIGHT / 2 - cy * nextH },
        nextW,
        nextH,
      ),
    );
  }

  /**
   * Redraw the chosen window at export resolution.
   *
   * The crop rectangle is computed back in SOURCE pixels — dividing the
   * on-screen offsets by the scale — so the export is a true crop of the
   * original file rather than a re-encode of the 288px preview.
   */
  async function exportCrop() {
    if (!natural) return;
    setExporting(true);
    try {
      const { sx, sy, sw, sh } = sourceRect(placement, scale);
      const outWidth = Math.round(Math.min(MAX_OUTPUT_WIDTH, sw));
      const outHeight = Math.round(outWidth / CARD_ASPECT);

      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = outWidth;
      canvas.height = outHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outWidth, outHeight);
      bitmap.close();

      // Keep PNG as PNG: a logo-on-transparent ad re-encoded to JPEG gains a
      // black background. Everything else exports as JPEG, which is smaller
      // and keeps the upload inside the 5 MB limit.
      const type = file.type === "image/png" ? "image/png" : "image/jpeg";
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, type, 0.92),
      );
      if (!blob) throw new Error("Export failed");

      const name = file.name.replace(/\.[^.]+$/, "");
      const ext = type === "image/png" ? "png" : "jpg";
      onCropped(new File([blob], `${name}-3x4.${ext}`, { type }));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crop to 3:4</DialogTitle>
          <DialogDescription>
            The popup always shows a 3:4 card. Drag to choose what stays inside
            it — artwork exported at 1200 × 1600 needs no cropping at all.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div
            className="relative cursor-grab touch-none overflow-hidden rounded-md border bg-neutral-900 select-none active:cursor-grabbing"
            style={{ width: VIEW_WIDTH, height: VIEW_HEIGHT }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = {
                pointerId: e.pointerId,
                x: e.clientX - placement.x,
                y: e.clientY - placement.y,
              };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || d.pointerId !== e.pointerId) return;
              setPlacement((p) =>
                clamp(
                  { zoom: p.zoom, x: e.clientX - d.x, y: e.clientY - d.y },
                  displayWidth,
                  displayHeight,
                ),
              );
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={objectUrl}
              alt=""
              draggable={false}
              onLoad={onImageLoad}
              style={{
                position: "absolute",
                left: placement.x,
                top: placement.y,
                width: displayWidth || undefined,
                height: displayHeight || undefined,
                maxWidth: "none",
              }}
            />
          </div>

          <div className="flex w-full items-center gap-3">
            <Label htmlFor="campaign-zoom" className="text-muted-foreground text-xs">
              Zoom
            </Label>
            <Slider
              id="campaign-zoom"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={placement.zoom}
              onValueChange={(v) => setZoom(Array.isArray(v) ? v[0] : v)}
              disabled={!natural}
              className="flex-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => void exportCrop()} disabled={!natural || exporting}>
            {exporting ? "Cropping…" : "Use this crop"}
          </Button>
          {/* Deliberately offered, not hidden. Some artwork is meant to bleed
              off the edges, and an admin who has looked at the crop and
              decided it is fine should not have to fight the tool. */}
          <Button
            variant="outline"
            disabled={exporting}
            onClick={() => onUseAsIs(file)}
          >
            Upload without cropping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
