"use client";

import { CircleAlert, Clock, Mail, Phone } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PhoneFrame } from "@/components/ui/phone-frame";
import {
  APP_LABELS,
  effectiveBlock,
  type AppKey,
  type ConfigState,
} from "@/lib/maintenance-impact";

/**
 * WHAT A BLOCKED PERSON ACTUALLY SEES.
 *
 * The admin writes a message into a textarea and finds out how it reads when
 * someone tells them. This renders the two apps' real maintenance screens
 * (LALABA_CUSTOMER_APP_DEV/app/maintenance.tsx and
 * LALABA_MERCHANT_APP_DEV/app/maintenance.tsx) from the current draft — the
 * same icon, the same title for the mode, the same fallback copy when no
 * message is written, and the same countdown for a scheduled window.
 *
 * The two apps genuinely differ in their wording, and the difference matters:
 * a customer is told to wait, a partner is told their business is stopped. So
 * this shows whichever app is being previewed rather than one generic screen.
 */

/** Copied from each app's theme tokens. */
const CUSTOMER = {
  bg: "#F7F9FC",
  ink: "#172033",
  muted: "#667085",
  primary: "#00AEEF",
  errorTint: "#FEECEA",
  error: "#C9362B",
  warnTint: "#FFF4E0",
  warn: "#C77800",
};
const PARTNER = {
  bg: "#F7F9FC",
  ink: "#0F172A",
  muted: "#475569",
  primary: "#00AEEF",
  errorTint: "#FEE2E2",
  error: "#EF4444",
  warnTint: "#FEF3C7",
  warn: "#D97706",
};

/**
 * Titles, the standing "what this means for you" line, and the button — per
 * app, because the two audiences are told different things. A customer wants
 * to know about the order already on its way; a partner wants to know whether
 * she is missing work.
 *
 * Kept in step with each app's own maintenance.tsx by hand. A preview that
 * shows different words from the app is a preview of nothing.
 */
const COPY: Record<
  AppKey,
  {
    emergencyTitle: string;
    scheduledTitle: string;
    effect: string;
    button: string;
    theme: typeof CUSTOMER;
  }
> = {
  customerApp: {
    emergencyTitle: "Under Maintenance",
    scheduledTitle: "Scheduled Maintenance",
    effect:
      "You can't place or track orders right now. Any order already running is unaffected — it carries on as normal.",
    button: "Try again",
    theme: CUSTOMER,
  },
  partnerApp: {
    emergencyTitle: "Under Maintenance",
    scheduledTitle: "Scheduled Maintenance",
    effect:
      "You can't take or update orders right now. Nothing is lost — anything waiting will still be here when this clears.",
    button: "Try again",
    theme: PARTNER,
  },
};

/** 5425 → "1:30:25". The apps' own hhmmss, so the shapes match. */
function hhmmss(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function MaintenancePhonePreview({
  config,
  app,
  now = new Date(),
}: {
  config: ConfigState;
  app: AppKey;
  now?: Date;
}) {
  const block = effectiveBlock(config, app, now);
  const copy = COPY[app];
  const t = copy.theme;

  // Not blocked = the app opens normally. Saying so is the point: an admin who
  // expected a block here has caught a misconfiguration before saving it.
  if (!block.blocked) {
    return (
      <PhoneFrame>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-10 text-center"
          style={{ backgroundColor: t.bg }}
        >
          <p style={{ color: t.ink, fontSize: 18, fontWeight: 700 }}>
            No block
          </p>
          <p style={{ color: t.muted, fontSize: 14, lineHeight: "20px" }}>
            {block.pendingFrom
              ? "The app opens normally. The scheduled window has not started yet."
              : "The app opens normally — nobody sees a maintenance screen."}
          </p>
        </div>
      </PhoneFrame>
    );
  }

  const isEmergency = block.type === "EMERGENCY";
  const remaining =
    block.endsAt != null
      ? Math.round((new Date(block.endsAt).getTime() - now.getTime()) / 1000)
      : null;

  return (
    <PhoneFrame>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ backgroundColor: t.bg, padding: 24, gap: 14 }}
      >
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 84,
            height: 84,
            backgroundColor: isEmergency ? t.errorTint : t.warnTint,
          }}
        >
          {isEmergency ? (
            <CircleAlert size={40} color={t.error} />
          ) : (
            <Clock size={40} color={t.warn} />
          )}
        </div>

        <p
          className="text-center"
          style={{ fontSize: 20, fontWeight: 700, color: t.ink }}
        >
          {isEmergency ? copy.emergencyTitle : copy.scheduledTitle}
        </p>

        <p
          className="text-center"
          style={{
            fontSize: 14,
            color: t.muted,
            lineHeight: "20px",
            maxWidth: 320,
          }}
        >
          {block.message}
        </p>

        <p
          className="text-center"
          style={{
            fontSize: 13,
            color: t.muted,
            lineHeight: "18px",
            maxWidth: 320,
          }}
        >
          {copy.effect}
        </p>

        {!isEmergency && remaining != null && remaining > 0 && (
          <p
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: t.ink,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {hhmmss(remaining)}
          </p>
        )}

        <div
          className="flex items-center justify-center rounded-xl"
          style={{
            backgroundColor: t.primary,
            paddingInline: 24,
            paddingBlock: 14,
            minWidth: 220,
          }}
        >
          <span style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>
            {copy.button}
          </span>
        </div>

        <p style={{ fontSize: 12, color: t.muted }}>
          Checking again automatically.
        </p>

        {/* The support actions, exactly as the apps render them: real buttons,
            present only when configured. An admin who has left both blank sees
            the screen with nothing to reach — which is the argument for
            filling them in, made better than any hint text could. */}
        {(config.supportEmail || config.supportPhone) && (
          <div className="flex flex-wrap justify-center" style={{ gap: 8 }}>
            {config.supportEmail && (
              <span
                className="inline-flex items-center rounded-lg border"
                style={{
                  gap: 6,
                  paddingInline: 14,
                  paddingBlock: 10,
                  borderColor: t.muted,
                  color: t.ink,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <Mail size={15} /> Email support
              </span>
            )}
            {config.supportPhone && (
              <span
                className="inline-flex items-center rounded-lg border"
                style={{
                  gap: 6,
                  paddingInline: 14,
                  paddingBlock: 10,
                  borderColor: t.muted,
                  color: t.ink,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <Phone size={15} /> Call support
              </span>
            )}
          </div>
        )}

        <p style={{ fontSize: 14, fontWeight: 600, color: t.muted }}>Log out</p>
      </div>
    </PhoneFrame>
  );
}

export function MaintenancePreviewDialog({
  open,
  onOpenChange,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ConfigState;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>What people will see</DialogTitle>
          <DialogDescription>
            Both apps, as your current unsaved settings would leave them right
            now. A scheduled window that has not started yet shows no block.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap justify-center gap-6">
          {(["customerApp", "partnerApp"] as AppKey[]).map((app) => (
            <div key={app} className="flex flex-col items-center gap-2">
              <MaintenancePhonePreview config={config} app={app} />
              <p className="text-muted-foreground text-sm">{APP_LABELS[app]}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
