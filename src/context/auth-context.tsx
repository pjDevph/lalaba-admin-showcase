"use client";

import { onIdTokenChanged, signOut, type User } from "firebase/auth";
import { createContext, useContext, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { graphqlFetch, ApiError } from "@/lib/api-client";
import type { UserProfile } from "@/lib/types";

// This panel is restricted to admin/support accounts — merchant, staff, and
// washer accounts authenticate fine against the shared backend but have no
// business in here.
export const ALLOWED_ROLES = ["admin", "support"];

const ME_QUERY = `
  query Me {
    me {
      _id
      email
      firstName
      lastName
      role { roleId roleName }
      isActive
      createdAt
      updatedAt
    }
  }
`;

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  rejectionReason: string | null;
  /**
   * The account is signed in, but ADMIN_MFA_REQUIRED is on and this token
   * carried no second factor.
   *
   * Kept SIGNED IN rather than signed out, which is the whole point: enrolling
   * a factor requires an authenticated Firebase user, so signing them out on
   * MFA_REQUIRED — as this context used to — made the requirement
   * unsatisfiable. Whoever flipped the flag locked out everyone who had not
   * already enrolled, including themselves, with no way back that did not
   * involve a console.
   *
   * The protected layout renders the enrolment screen and nothing else while
   * this is true. No panel data is reachable: `me` is still failing, so
   * `profile` is null and every query behind it would fail the same way.
   */
  mfaEnrolmentRequired: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  rejectionReason: null,
  mfaEnrolmentRequired: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(() => Boolean(auth));
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [mfaEnrolmentRequired, setMfaEnrolmentRequired] = useState(false);

  useEffect(() => {
    if (!auth) {
      return;
    }
    const firebaseAuth = auth;
    return onIdTokenChanged(firebaseAuth, async (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        // Don't clear rejectionReason here — this callback also fires as a
        // *result* of the signOut() below, right after we set the message a
        // rejected sign-in should leave visible on the login page.
        setProfile(null);
        setMfaEnrolmentRequired(false);
        setLoading(false);
        return;
      }

      setRejectionReason(null);
      setMfaEnrolmentRequired(false);
      try {
        const data = await graphqlFetch<{ me: UserProfile | null }>(ME_QUERY);
        const me = data.me;
        if (!me) {
          throw new ApiError(404, "No profile found for this account.");
        }
        if (!ALLOWED_ROLES.includes(me.role.roleId)) {
          throw new ApiError(
            403,
            "This admin panel is restricted to admin and support accounts.",
          );
        }
        setProfile(me);
      } catch (err) {
        setProfile(null);

        // MFA_REQUIRED is the one rejection that must NOT end the session.
        // Enrolling a second factor requires an authenticated user, so signing
        // them out here — which this did — turned "enrol a factor" into an
        // instruction nobody could follow. Stay signed in and let the layout
        // render the enrolment screen; nothing else is reachable, because `me`
        // is still failing and every other query fails the same way.
        if (err instanceof ApiError && err.code === "MFA_REQUIRED") {
          setMfaEnrolmentRequired(true);
          setLoading(false);
          return;
        }

        // SESSION_REVOKED still ends the session, and its message is worth
        // showing verbatim — it tells them an admin signed them out.
        // Everything else falls back to a generic line rather than leaking
        // internals to the login screen.
        const reason =
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.";
        setRejectionReason(reason);
        await signOut(firebaseAuth);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        rejectionReason,
        mfaEnrolmentRequired,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
