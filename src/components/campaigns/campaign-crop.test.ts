import { describe, expect, it } from "vitest";

import {
  VIEW_HEIGHT,
  VIEW_WIDTH,
  clamp,
  sourceRect,
} from "@/components/campaigns/campaign-crop-dialog";
import { croppedPercent } from "@/components/campaigns/campaign-preview";

/**
 * The crop maths, which is the part of this feature that cannot be checked by
 * looking at it. A wrong sign or a scale applied twice still produces a
 * plausible-looking picture in the dialog and a wrongly cropped advert on
 * every phone.
 */

/** The ad this feature was built for: a tall poster, far from 3:4. */
const POSTER = { w: 875, h: 1638 };

/** Zoom-1 scale — the smallest that still covers the window. */
const coverScale = (w: number, h: number) =>
  Math.max(VIEW_WIDTH / w, VIEW_HEIGHT / h);

describe("croppedPercent", () => {
  it("reports the height lost on a poster taller than 3:4", () => {
    // 875/1638 = 0.534 against 0.75 → 1 - 0.534/0.75 ≈ 29%.
    expect(croppedPercent(POSTER.w, POSTER.h)).toEqual({
      axis: "height",
      percent: 29,
    });
  });

  it("reports the width lost on a landscape image", () => {
    expect(croppedPercent(1600, 900)).toEqual({ axis: "width", percent: 58 });
  });

  it("says nothing when the artwork is already 3:4", () => {
    expect(croppedPercent(1200, 1600)).toBeNull();
  });

  it("tolerates artwork a rounding error away from 3:4", () => {
    expect(croppedPercent(1201, 1600)).toBeNull();
  });

  it("has no opinion about an unmeasurable image", () => {
    expect(croppedPercent(0, 0)).toBeNull();
  });
});

describe("clamp", () => {
  const scale = coverScale(POSTER.w, POSTER.h);
  const dw = POSTER.w * scale;
  const dh = POSTER.h * scale;

  it("refuses to drag a gap in at the top or left", () => {
    expect(clamp({ zoom: 1, x: 40, y: 90 }, dw, dh)).toEqual({
      zoom: 1,
      x: 0,
      y: 0,
    });
  });

  it("refuses to drag a gap in at the bottom or right", () => {
    const far = clamp({ zoom: 1, x: -9999, y: -9999 }, dw, dh);
    expect(far.x).toBeCloseTo(Math.min(0, VIEW_WIDTH - dw));
    expect(far.y).toBeCloseTo(Math.min(0, VIEW_HEIGHT - dh));
  });

  it("pins the axis that exactly fits, rather than letting it drift", () => {
    // At zoom 1 the poster's width is exactly the window's width.
    expect(dw).toBeCloseTo(VIEW_WIDTH);
    expect(clamp({ zoom: 1, x: -5, y: -100 }, dw, dh).x).toBeCloseTo(0);
  });
});

describe("sourceRect", () => {
  it("maps the whole window back to source pixels at zoom 1", () => {
    const scale = coverScale(POSTER.w, POSTER.h);
    // Centred vertically, which is where the dialog starts.
    const y = (VIEW_HEIGHT - POSTER.h * scale) / 2;
    const rect = sourceRect({ zoom: 1, x: 0, y }, scale);

    expect(rect.sx).toBeCloseTo(0);
    expect(rect.sw).toBeCloseTo(POSTER.w);
    // A 3:4 slice of the full width, taken from the middle of the poster.
    expect(rect.sh).toBeCloseTo(POSTER.w / (3 / 4));
    expect(rect.sy).toBeCloseTo((POSTER.h - rect.sh) / 2);
    expect(rect.sy + rect.sh).toBeLessThanOrEqual(POSTER.h + 0.001);
  });

  it("keeps the crop inside the source after dragging to the bottom", () => {
    const scale = coverScale(POSTER.w, POSTER.h);
    const dh = POSTER.h * scale;
    const placed = clamp({ zoom: 1, x: 0, y: -9999 }, POSTER.w * scale, dh);
    const rect = sourceRect(placed, scale);

    // Dragged fully down: the crop ends at the poster's last pixel row, which
    // is where the call-to-action lives.
    expect(rect.sy + rect.sh).toBeCloseTo(POSTER.h);
    expect(rect.sy).toBeGreaterThan(0);
  });

  it("narrows the source window as zoom grows", () => {
    const scale = coverScale(POSTER.w, POSTER.h);
    const wide = sourceRect({ zoom: 1, x: 0, y: 0 }, scale);
    const tight = sourceRect({ zoom: 2, x: 0, y: 0 }, scale * 2);

    expect(tight.sw).toBeCloseTo(wide.sw / 2);
    expect(tight.sh).toBeCloseTo(wide.sh / 2);
  });

  it("always describes a 3:4 window, whatever the zoom", () => {
    for (const zoom of [1, 1.37, 2, 3]) {
      const scale = coverScale(POSTER.w, POSTER.h) * zoom;
      const rect = sourceRect({ zoom, x: -12, y: -34 }, scale);
      expect(rect.sw / rect.sh).toBeCloseTo(3 / 4);
    }
  });
});
