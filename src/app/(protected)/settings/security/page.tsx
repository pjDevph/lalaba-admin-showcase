"use client";

/**
 * The account's own security settings.
 *
 * Deliberately NOT gated on a capability: it is about the signed-in person's
 * own credentials, not about administering anyone. Every account that can
 * reach the panel — admin and support alike — is subject to
 * ADMIN_MFA_REQUIRED, so every account needs somewhere to get ahead of it.
 *
 * Enrolling here, before the flag is switched on, is the entire point. The
 * blocking screen in the protected layout is the recovery path for whoever
 * was not warned; this is the one that means nobody needs it.
 */

import { MfaEnrolment } from "@/components/security/mfa-enrolment";

export default function SecuritySettingsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Security</h1>
        <p className="text-sm text-muted-foreground">
          Two-factor authentication for your own back-office account.
        </p>
      </div>
      <div className="max-w-2xl">
        <MfaEnrolment />
      </div>
    </div>
  );
}
