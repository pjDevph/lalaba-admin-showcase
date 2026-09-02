import type {
  MaintenanceAppState,
  MaintenanceMode,
} from "@/lib/graphql/maintenance";

/**
 * WHAT SAVING THIS PAGE WILL ACTUALLY DO.
 *
 * Every other config page in this panel affects one record. This one decides
 * whether anybody can use the apps at all, and the form does not read that way
 * — three toggles, two modes and a date window compose into an answer no one
 * can hold in their head while clicking Save.
 *
 * So the rules below are a deliberate mirror of the backend's
 * `MaintenanceService.effectiveStateForRole`, including its default messages
 * and the exact window comparison. If that function changes, this must change
 * with it: a confirmation dialog that describes something other than what the
 * server will do is worse than no dialog, because it will be believed.
 *
 * Two behaviours the form hides, and the reason this file exists:
 *   • SCHEDULED blocks ONLY inside its start/end window. Turning an app on in
 *     SCHEDULED mode with no dates blocks precisely nobody, ever.
 *   • Global Emergency overrides both apps entirely — their own settings are
 *     not merged with it, they are ignored.
 */

/** The backend's fallbacks, for when an admin activates without a message. */
export const DEFAULT_MESSAGES = {
  global: "The platform is temporarily unavailable. Please try again shortly.",
  emergency: "This app is temporarily unavailable.",
  scheduled: "Scheduled maintenance is in progress.",
} as const;

export type AppKey = "customerApp" | "partnerApp";

export const APP_LABELS: Record<AppKey, string> = {
  customerApp: "Customer app",
  partnerApp: "Partner/Washer app",
};

export type ConfigState = {
  globalEmergencyActive: boolean;
  globalEmergencyMessage: string | null;
  customerApp: MaintenanceAppState;
  partnerApp: MaintenanceAppState;
  supportEmail: string | null;
  supportPhone: string | null;
  bypassUids: string[];
};

export type EffectiveBlock = {
  blocked: boolean;
  /** Null when not blocked. */
  type: MaintenanceMode | null;
  message: string | null;
  endsAt: string | null;
  /**
   * A SCHEDULED window that has not started yet. Not blocking now, but it will
   * — the single most important thing to say out loud before saving, and the
   * one state a plain "blocked / not blocked" reading loses.
   */
  pendingFrom: string | null;
};

const NOT_BLOCKED: EffectiveBlock = {
  blocked: false,
  type: null,
  message: null,
  endsAt: null,
  pendingFrom: null,
};

/** Mirrors MaintenanceService.effectiveStateForRole for one app. */
export function effectiveBlock(
  config: ConfigState,
  app: AppKey,
  now: Date = new Date(),
): EffectiveBlock {
  if (config.globalEmergencyActive) {
    return {
      blocked: true,
      type: "EMERGENCY",
      message: config.globalEmergencyMessage?.trim() || DEFAULT_MESSAGES.global,
      endsAt: null,
      pendingFrom: null,
    };
  }

  const state = config[app];
  if (!state.active) return NOT_BLOCKED;

  if (state.mode === "EMERGENCY") {
    return {
      blocked: true,
      type: "EMERGENCY",
      message: state.message?.trim() || DEFAULT_MESSAGES.emergency,
      endsAt: null,
      pendingFrom: null,
    };
  }

  // SCHEDULED — blocking only inside its own window, and only when it HAS one.
  const start = state.scheduledStart ? new Date(state.scheduledStart) : null;
  const end = state.scheduledEnd ? new Date(state.scheduledEnd) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NOT_BLOCKED;
  }
  if (now < start) {
    return { ...NOT_BLOCKED, pendingFrom: state.scheduledStart };
  }
  if (now > end) return NOT_BLOCKED;

  return {
    blocked: true,
    type: "SCHEDULED",
    message: state.message?.trim() || DEFAULT_MESSAGES.scheduled,
    endsAt: state.scheduledEnd,
    pendingFrom: null,
  };
}

export type ImpactSeverity = "blocking" | "releasing" | "pending" | "neutral";

export type AppImpact = {
  app: AppKey;
  label: string;
  severity: ImpactSeverity;
  /** One sentence, written to be read aloud before clicking Save. */
  sentence: string;
  after: EffectiveBlock;
};

function when(iso: string | null): string {
  if (!iso) return "an unset time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "an invalid time";
  return d.toLocaleString("en-PH", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** What changes for one app, in terms of who can use it. */
export function appImpact(
  before: ConfigState,
  after: ConfigState,
  app: AppKey,
  now: Date = new Date(),
): AppImpact {
  const wasBlocked = effectiveBlock(before, app, now);
  const willBlock = effectiveBlock(after, app, now);
  const label = APP_LABELS[app];

  if (willBlock.blocked && !wasBlocked.blocked) {
    return {
      app,
      label,
      severity: "blocking",
      sentence:
        willBlock.type === "SCHEDULED"
          ? `${label} will be blocked immediately, until ${when(willBlock.endsAt)}.`
          : `${label} will be blocked immediately, until someone turns this off.`,
      after: willBlock,
    };
  }

  if (!willBlock.blocked && wasBlocked.blocked) {
    return {
      app,
      label,
      severity: "releasing",
      sentence: `${label} will be unblocked — people can use it again straight away.`,
      after: willBlock,
    };
  }

  if (willBlock.blocked && wasBlocked.blocked) {
    const changed =
      willBlock.message !== wasBlocked.message ||
      willBlock.type !== wasBlocked.type ||
      willBlock.endsAt !== wasBlocked.endsAt;
    return {
      app,
      label,
      severity: "blocking",
      sentence: changed
        ? `${label} stays blocked, with the new message and timing.`
        : `${label} stays blocked. No change.`,
      after: willBlock,
    };
  }

  // Not blocked either way — but a scheduled window may be waiting to start.
  if (willBlock.pendingFrom) {
    return {
      app,
      label,
      severity: "pending",
      sentence: `${label} is not blocked yet — it will be from ${when(
        willBlock.pendingFrom,
      )}.`,
      after: willBlock,
    };
  }

  return {
    app,
    label,
    severity: "neutral",
    sentence: `${label} is not blocked, and will not be.`,
    after: willBlock,
  };
}

export type SaveImpact = {
  apps: AppImpact[];
  /** True when this save turns the master override ON — both apps, at once. */
  globalEmergencyTurningOn: boolean;
  /** True when it turns it OFF. */
  globalEmergencyTurningOff: boolean;
  bypassCount: number;
  /** True when at least one app goes from usable to blocked. */
  blocksAnyone: boolean;
};

export function saveImpact(
  before: ConfigState,
  after: ConfigState,
  now: Date = new Date(),
): SaveImpact {
  const apps = (["customerApp", "partnerApp"] as AppKey[]).map((a) =>
    appImpact(before, after, a, now),
  );
  return {
    apps,
    globalEmergencyTurningOn:
      after.globalEmergencyActive && !before.globalEmergencyActive,
    globalEmergencyTurningOff:
      !after.globalEmergencyActive && before.globalEmergencyActive,
    bypassCount: after.bypassUids.length,
    blocksAnyone: apps.some((a) => a.severity === "blocking"),
  };
}

/**
 * Configuration that will not do what the admin plainly meant.
 *
 * Returned as blocking errors rather than warnings: every one of these is a
 * switch flipped with the intent of stopping traffic, that stops nothing —
 * discovered later, from the fact that the outage carried on serving people.
 */
export type ConfigProblem = { field: string; message: string };

export function configProblems(config: ConfigState): ConfigProblem[] {
  const problems: ConfigProblem[] = [];

  if (
    config.globalEmergencyActive &&
    !config.globalEmergencyMessage?.trim()
  ) {
    problems.push({
      field: "globalEmergencyMessage",
      message:
        "Write the message everyone will see. Without one they get a generic line that tells them nothing.",
    });
  }

  // Required as soon as ANY block is switched on, and not before. The one
  // screen someone reaches when the app will not open is the worst possible
  // place to have no way out, and "we'll add it later" never survives an
  // incident. Off = nothing is blocked = nobody needs it.
  const anythingBlocks =
    config.globalEmergencyActive ||
    config.customerApp.active ||
    config.partnerApp.active;
  if (
    anythingBlocks &&
    !config.supportEmail?.trim() &&
    !config.supportPhone?.trim()
  ) {
    problems.push({
      field: "support",
      message:
        "Give people somewhere to turn — a support email or phone number. While they are blocked, this screen is the only thing they can reach.",
    });
  }

  for (const app of ["customerApp", "partnerApp"] as AppKey[]) {
    const state = config[app];
    if (!state.active) continue;
    const label = APP_LABELS[app];

    if (!state.message?.trim()) {
      problems.push({
        field: `${app}.message`,
        message: `Write the message ${label} users will see while they are blocked.`,
      });
    }

    if (state.mode === "SCHEDULED") {
      if (!state.scheduledStart || !state.scheduledEnd) {
        problems.push({
          field: `${app}.window`,
          message: `Scheduled maintenance blocks ${label} only between a start and an end. Without both, this setting blocks nobody.`,
        });
      } else if (new Date(state.scheduledEnd) <= new Date(state.scheduledStart)) {
        problems.push({
          field: `${app}.window`,
          message: `${label}'s maintenance window has to end after it starts.`,
        });
      }
    }
  }

  return problems;
}
