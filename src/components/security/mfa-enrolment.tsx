"use client";

/**
 * TOTP enrolment for back-office accounts.
 *
 * The backend has had `ADMIN_MFA_REQUIRED` since the guard was written, and
 * turning it on rejected every admin and support account that had not already
 * enrolled a second factor — including whoever would have to sign in to turn
 * it back off. There was no enrolment surface anywhere in the panel, so there
 * was no way for anyone to be in the "already enrolled" group. The flag was
 * effectively a switch that only locked people out.
 *
 * Two entry points, and both matter:
 *
 *   - Settings → Security, reachable any time. This is what makes the flag
 *     safe to turn on: the team enrols first, then it is switched.
 *   - The blocking screen the layout renders when the backend has answered
 *     MFA_REQUIRED. This is the recovery path for anyone who was caught out.
 *
 * TOTP rather than SMS: a back-office account is shared-desk equipment as
 * often as it is a person, no phone number is on file for it, and an
 * authenticator app costs nothing per sign-in.
 *
 * A note on what happens after enrolling: the token in hand still carries no
 * `sign_in_second_factor` claim — Firebase sets that at SIGN-IN, not at
 * enrolment — so the backend keeps rejecting it. The only honest ending is to
 * sign out and sign in again, which this screen says and does.
 */

import { useState } from "react";
import { FirebaseError } from "firebase/app";
import {
  TotpMultiFactorGenerator,
  TotpSecret,
  multiFactor,
  signOut,
} from "firebase/auth";
import QRCode from "qrcode";
import { ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/auth-context";
import { auth } from "@/lib/firebase";

/** Shown on the authenticator app's entry, so a shared account is identifiable. */
const ISSUER = "Lalaba Admin";

function enrolmentErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-verification-code":
        return "That code was not accepted. Check your authenticator app and try the current code.";
      case "auth/requires-recent-login":
        return "For security, sign out and sign in again before enrolling.";
      case "auth/maximum-second-factor-count-exceeded":
        return "This account already has the maximum number of second factors.";
      case "auth/unsupported-first-factor":
      case "auth/operation-not-allowed":
        // The most likely real-world failure: TOTP is an Identity Platform
        // feature and is off on a plain Firebase Auth project. Saying which
        // knob is wrong beats a raw Firebase code.
        return "Two-factor authentication is not enabled on this Firebase project. Turn on multi-factor authentication (TOTP) in Identity Platform first.";
      default:
        return error.message;
    }
  }
  return "Something went wrong. Please try again.";
}

export function MfaEnrolment({
  /** The blocking variant explains why the panel is unreachable. */
  blocking = false,
}: {
  blocking?: boolean;
}) {
  const { user } = useAuth();
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [done, setDone] = useState(false);

  // Whether this account already has a factor. Read from the client-side user
  // object rather than the backend, which is the same source Firebase itself
  // checks at sign-in.
  const enrolledFactors = user ? multiFactor(user).enrolledFactors : [];

  async function begin() {
    if (!auth || !user) return;
    setError(null);
    setStarting(true);
    try {
      const session = await multiFactor(user).getSession();
      const generated = await TotpMultiFactorGenerator.generateSecret(session);
      // Rendered here rather than in an effect on `secret`: the QR is a
      // function of the secret we just generated, and drawing it locally keeps
      // the shared secret off any third-party chart service.
      const url = await QRCode.toDataURL(
        generated.generateQrCodeUrl(user.email ?? "admin", ISSUER),
        { margin: 1, width: 220 },
      );
      setSecret(generated);
      setQrDataUrl(url);
    } catch (err) {
      setError(enrolmentErrorMessage(err));
    } finally {
      setStarting(false);
    }
  }

  async function finish() {
    if (!user || !secret) return;
    setError(null);
    setEnrolling(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        secret,
        code.trim(),
      );
      await multiFactor(user).enroll(assertion, "Authenticator app");
      setDone(true);
      toast.success("Two-factor authentication enabled.");
    } catch (err) {
      setError(enrolmentErrorMessage(err));
    } finally {
      setEnrolling(false);
    }
  }

  if (!auth || !user) {
    return <Skeleton className="h-40 w-full" />;
  }
  // Captured so the narrowing survives into the callbacks below — `auth` is a
  // module binding and TypeScript will not carry a guard on it into a closure.
  const firebaseAuth = auth;

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-5 text-[var(--status-success)]" />
            Two-factor authentication is on
          </CardTitle>
          <CardDescription>
            Sign in again to finish. The token you are holding was issued
            before you enrolled and does not carry a second factor — Firebase
            stamps that at sign-in, not at enrolment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void signOut(firebaseAuth)}>Sign out</Button>
        </CardContent>
      </Card>
    );
  }

  if (enrolledFactors.length > 0 && !secret) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-5 text-[var(--status-success)]" />
            Two-factor authentication is on
          </CardTitle>
          <CardDescription>
            {enrolledFactors.length === 1
              ? "One second factor is enrolled on this account."
              : `${enrolledFactors.length} second factors are enrolled on this account.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {enrolledFactors.map((factor) => (
              <li key={factor.uid}>
                {factor.displayName ?? "Authenticator"}
                {factor.enrollmentTime
                  ? ` · added ${new Date(factor.enrollmentTime).toLocaleDateString()}`
                  : ""}
              </li>
            ))}
          </ul>
          {/* No remove button on purpose. Unenrolling is how an account with
              ADMIN_MFA_REQUIRED on locks itself out, and this screen exists
              because that already happened once at the project level. */}
          <p className="text-xs text-muted-foreground">
            To remove a factor, contact another administrator — doing it here
            would be the same lockout this screen exists to prevent.
          </p>
          <Button variant="outline" disabled={starting} onClick={begin}>
            {starting ? "Preparing…" : "Add another authenticator"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up two-factor authentication</CardTitle>
        <CardDescription>
          {blocking
            ? "Back-office accounts require a second factor. Enrol an authenticator app to get back in."
            : "Add an authenticator app to this account. Enrolling before two-factor is enforced is what keeps it from locking you out later."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!secret ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              You will need an authenticator app — Google Authenticator, 1Password,
              Authy or any other TOTP app.
            </p>
            <Button className="w-fit" disabled={starting} onClick={begin}>
              {starting ? "Preparing…" : "Begin setup"}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-6">
              <div className="flex flex-col items-center gap-2">
                {qrDataUrl ? (
                  /* A locally-generated data URI, not a remote content image —
                     next/image would round-trip it through the optimizer for
                     nothing. */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt="QR code for authenticator app setup"
                    className="rounded-md border bg-white p-2"
                    width={220}
                    height={220}
                  />
                ) : (
                  <Skeleton className="size-[220px]" />
                )}
                <p className="text-xs text-muted-foreground">
                  Scan with your authenticator app
                </p>
              </div>
              <div className="flex min-w-56 flex-col gap-2">
                <Label htmlFor="mfa-secret">Or enter this key by hand</Label>
                <code
                  id="mfa-secret"
                  className="rounded-md border bg-muted px-2 py-1.5 text-sm break-all"
                >
                  {secret.secretKey}
                </code>
                <p className="text-xs text-muted-foreground">
                  Some apps call this a &quot;setup key&quot;.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mfa-code">Code from the app</Label>
              <Input
                id="mfa-code"
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="max-w-40 tracking-widest"
                onChange={(event) => setCode(event.target.value)}
              />
            </div>

            <Button
              className="w-fit"
              disabled={enrolling || code.trim().length < 6}
              onClick={finish}
            >
              {enrolling ? "Verifying…" : "Turn on two-factor"}
            </Button>
          </>
        )}

        {error && (
          <p className="text-sm text-[var(--status-danger)]">{error}</p>
        )}

        {blocking && (
          <Button
            variant="ghost"
            className="w-fit"
            onClick={() => void signOut(firebaseAuth)}
          >
            Sign out
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
