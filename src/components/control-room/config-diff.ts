/**
 * WHAT CHANGED, FIELD BY FIELD.
 *
 * The booking policy publish dialog asked for a change note and then published
 * whatever was in the form. That is trust without evidence: an admin who
 * has been editing for ten minutes cannot reliably recall which of thirty
 * numbers they actually moved, and the note they write is a description of
 * what they MEANT to do.
 *
 * So the dialog shows the diff and the note describes it. Pure functions in
 * their own file rather than a hook, because the interesting part is the
 * flattening rule and it deserves tests.
 */

export type FieldChange = {
  /** Dotted path, e.g. "defaults.advanceBookingDays". */
  path: string;
  /** Human label derived from the path — "Defaults · advance booking days". */
  label: string;
  before: string;
  after: string;
};

/** camelCase / dotted path → "Defaults · advance booking days". */
export function labelForPath(path: string): string {
  return path
    .split(".")
    .map((segment) =>
      segment
        .replace(/([a-z\d])([A-Z])/g, "$1 $2")
        .replace(/^./, (c) => c.toUpperCase())
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase()),
    )
    .join(" · ");
}

/** Renders a leaf for display. Nulls are a real state, not a missing value. */
function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (Array.isArray(value)) {
    return value.length === 0 ? "none" : `${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Every leaf that differs between two config objects.
 *
 * Arrays are compared WHOLE rather than element by element. A weekly schedule's
 * windows are meaningful as a set — "Monday 08:00–20:00 became 09:00–18:00" is
 * the useful statement, and "windows[0].start changed" is not — so an array
 * that differs at all reports as one changed field and renders as its summary.
 */
export function diffConfig(
  before: unknown,
  after: unknown,
  path = "",
): FieldChange[] {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      // __typename rides along on fetched objects and is never a change.
      .filter((key) => key !== "__typename");
    return keys.flatMap((key) =>
      diffConfig(before[key], after[key], path ? `${path}.${key}` : key),
    );
  }

  const beforeText = display(before);
  const afterText = display(after);

  // Arrays and nested objects compare by their serialised form, so a change
  // inside one is caught even though it renders as a summary.
  const same = Array.isArray(before) || Array.isArray(after)
    ? JSON.stringify(before) === JSON.stringify(after)
    : beforeText === afterText;

  if (same) return [];

  return [
    {
      path,
      label: labelForPath(path),
      before: beforeText,
      after: afterText,
    },
  ];
}
