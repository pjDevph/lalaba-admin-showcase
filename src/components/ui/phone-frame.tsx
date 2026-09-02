"use client";

import type { ReactNode } from "react";

/**
 * A handset, at the app's own logical pixel scale.
 *
 * Children are laid out in real device points (390 × 844) and the whole thing
 * is shrunk with a transform, so every inset, radius and font size stays in
 * the proportion the app actually renders — rather than being re-guessed in
 * Tailwind units and drifting from the screen it claims to show.
 *
 * Shared by the campaign popup preview and the maintenance screen preview:
 * both answer the same question, "what will this look like on a phone", and
 * two frames that disagreed about the size of a phone would make those two
 * answers incomparable.
 */

export const DEVICE_WIDTH = 390;
export const DEVICE_HEIGHT = 844;

export function PhoneFrame({
  children,
  scale = 0.62,
}: {
  children: ReactNode;
  scale?: number;
}) {
  return (
    <div
      style={{ width: DEVICE_WIDTH * scale, height: DEVICE_HEIGHT * scale }}
      className="shrink-0"
    >
      <div
        style={{
          width: DEVICE_WIDTH,
          height: DEVICE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        className="relative overflow-hidden rounded-[44px] border-[10px] border-neutral-800 bg-neutral-900 shadow-xl"
      >
        {children}
      </div>
    </div>
  );
}
