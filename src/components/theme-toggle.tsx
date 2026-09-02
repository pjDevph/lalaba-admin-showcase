"use client";

/**
 * Light/dark, one click, always on screen.
 *
 * It already existed — as a three-option control on Settings → Themes, two
 * navigations deep. That is the right home for the full choice (including
 * "System" and the palette picker), and the wrong home for the one someone
 * makes twice a day when the office lights change. A preference that has to
 * be hunted for is a preference most people never find; the first question
 * asked after light became the default was "where's the dark mode toggle?".
 *
 * Cycles light → dark → system rather than a plain two-way switch, so
 * "follow my OS" stays reachable without a second control. The icon shows
 * what is ACTIVE, not what clicking will do — a button whose icon predicts
 * the next state reads as already being in it.
 */

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ORDER = ["light", "dark", "system"] as const;

/**
 * "Has this hydrated yet?", without writing state from inside an effect.
 *
 * Whether we are on the client is an external fact that never changes after
 * the first paint, so the subscribe callback has nothing to listen to and the
 * two snapshots differ only by environment. The usual useState + useEffect
 * spelling of this does the same job by re-rendering itself, which is what the
 * lint rule objects to — correctly.
 */
const NEVER_CHANGES = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );

const LABELS: Record<string, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  // next-themes cannot know the theme until it has read localStorage on the
  // client, so rendering the real icon during SSR guarantees a mismatch. A
  // placeholder of the same size keeps the header from shifting when the real
  // one arrives.
  const hydrated = useHydrated();

  if (!hydrated) {
    return <div className="size-8" aria-hidden />;
  }

  const current = theme ?? "system";
  const next = ORDER[(ORDER.indexOf(current as typeof ORDER[number]) + 1) % ORDER.length];

  const Icon =
    current === "system"
      ? MonitorIcon
      : (resolvedTheme ?? current) === "dark"
        ? MoonIcon
        : SunIcon;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setTheme(next)}
            // The accessible name states both, because the icon alone cannot:
            // a moon could mean "dark is on" or "switch to dark".
            aria-label={`Theme: ${LABELS[current]}. Switch to ${LABELS[next]}.`}
          />
        }
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent>
        {LABELS[current]} — click for {LABELS[next].toLowerCase()}
      </TooltipContent>
    </Tooltip>
  );
}
