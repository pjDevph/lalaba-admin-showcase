"use client";

import { FirebaseError } from "firebase/app";
import {
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  type MultiFactorError,
  type MultiFactorResolver,
} from "firebase/auth";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/auth-context";
import { auth } from "@/lib/firebase";

function authErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (error.code === "auth/invalid-credential") {
      return "Invalid email or password.";
    }
    if (error.code === "auth/invalid-verification-code") {
      return "That code was not accepted. Try the current one from your app.";
    }
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const { rejectionReason } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Set when the password was right and Firebase wants the second factor. The
  // resolver carries the half-finished sign-in; nothing else can complete it,
  // so it lives in state rather than being re-derived.
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(
    null,
  );
  const [mfaCode, setMfaCode] = useState("");
  const displayedError = error ?? rejectionReason;

  async function handleEmailSignIn(event: React.FormEvent) {
    event.preventDefault();
    if (!auth) {
      setError("Firebase Auth is not configured yet.");
      return;
    }
    setError(null);
    setResetMessage(null);
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/");
    } catch (err) {
      // Not a failure — the password was right and Firebase is asking for the
      // second factor. Without this branch an enrolled account could never
      // sign in at all, which is the other half of the lockout the enrolment
      // screen exists to prevent.
      if (
        err instanceof FirebaseError &&
        err.code === "auth/multi-factor-auth-required"
      ) {
        // FirebaseError is the widest type the SDK throws; the MFA variant
        // carries `customData.operationType`, which the base type does not
        // model. The code check above is what makes this narrowing sound.
        setMfaResolver(getMultiFactorResolver(auth, err as MultiFactorError));
        setError(null);
      } else {
        setError(authErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMfaSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!mfaResolver) return;
    setError(null);
    setSubmitting(true);
    try {
      // The first enrolled TOTP factor. Firebase allows several, but this
      // panel only ever enrols authenticator apps, so there is nothing to
      // choose between.
      const factor = mfaResolver.hints.find(
        (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID,
      );
      if (!factor) {
        setError(
          "This account's second factor is not an authenticator app. Contact another administrator.",
        );
        return;
      }
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(
        factor.uid,
        mfaCode.trim(),
      );
      await mfaResolver.resolveSignIn(assertion);
      router.replace("/");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    if (!auth) {
      setError("Firebase Auth is not configured yet.");
      return;
    }
    if (!email) {
      setError("Enter your email above first, then click this link again.");
      return;
    }
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetMessage(`Password reset email sent to ${email}.`);
    } catch (err) {
      setError(authErrorMessage(err));
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* Both approved cuts, one per theme. The navy wordmark is the
              lockup for light surfaces and vanishes on a dark card — which is
              exactly what it did here until someone opened the login page in
              dark mode. Two <img>s rather than a filter, because recolouring
              a brand asset is the one thing its own guidance forbids. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/lalaba-wordmark.png"
            alt="Lalaba"
            className="mb-2 h-9 w-auto object-contain dark:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/lalaba-wordmark-white.png"
            alt=""
            aria-hidden
            className="mb-2 hidden h-9 w-auto object-contain dark:block"
          />
          <CardTitle>{mfaResolver ? "Two-factor code" : "Sign in"}</CardTitle>
          <CardDescription>
            {mfaResolver
              ? "Enter the 6-digit code from your authenticator app."
              : "Admin panel"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* The password half is replaced rather than added to: the sign-in
              is already half-complete at this point and re-submitting the
              password would start a second one. */}
          {mfaResolver ? (
            <form onSubmit={handleMfaSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="mfa-code">Code</FieldLabel>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                    placeholder="123456"
                    className="tracking-widest"
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                  />
                </Field>
                <Field>
                  {displayedError && <FieldError>{displayedError}</FieldError>}
                  <Button type="submit" disabled={submitting}>
                    Verify
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMfaResolver(null);
                      setMfaCode("");
                      setError(null);
                    }}
                  >
                    Back
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          ) : (
          <form onSubmit={handleEmailSignIn}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <button
                    type="button"
                    className="ml-auto text-sm underline-offset-4 hover:underline"
                    onClick={handleForgotPassword}
                  >
                    Forgot your password?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </Field>
              <Field>
                {displayedError && <FieldError>{displayedError}</FieldError>}
                {resetMessage && (
                  <FieldDescription className="text-emerald-600 dark:text-emerald-400">
                    {resetMessage}
                  </FieldDescription>
                )}
                <Button type="submit" disabled={submitting}>
                  Sign in
                </Button>
                <FieldDescription className="text-center">
                  Don&apos;t have an account? Contact your admin.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
