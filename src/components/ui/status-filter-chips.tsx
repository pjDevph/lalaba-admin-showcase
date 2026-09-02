"use client";

import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { lookupStatus, type StatusMeta } from "@/lib/status";

export type StatusChip = {
  value: string;
  label?: string;
  /** Shown after the label. Omit rather than pass 0 when the count is unknown. */
  count?: number;
};

/**
 * Multi-select status filter, rendered as chips rather than a dropdown.
 *
 * Chips because the states are the queue: an agent should be able to see that
 * six things are rejected without opening anything. A `<Select multiple>`
 * hides exactly the information the toolbar exists to surface.
 *
 * Empty selection means "all" — never "none". A filter bar that can filter
 * everything out looks identical to a loading failure.
 */
export function StatusFilterChips({
  chips,
  selected,
  onChange,
  registry,
  className,
}: {
  chips: readonly StatusChip[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  /** Registry used to resolve labels for chips that don't supply one. */
  registry?: Record<string, StatusMeta>;
  className?: string;
}) {
  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((chip) => {
        const isOn = selected.includes(chip.value);
        return (
          <Button
            key={chip.value}
            type="button"
            size="sm"
            variant={isOn ? "default" : "outline"}
            className="h-7 gap-1 px-2 text-xs"
            aria-pressed={isOn}
            onClick={() => toggle(chip.value)}
          >
            {isOn && <CheckIcon className="size-3" />}
            {chip.label ?? lookupStatus(chip.value, registry).label}
            {chip.count != null && (
              <span className="text-muted-foreground">{chip.count}</span>
            )}
          </Button>
        );
      })}
      {selected.length > 0 && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => onChange([])}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
