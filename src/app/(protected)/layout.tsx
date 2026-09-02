"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CurrentDateTime } from "@/components/current-date-time";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useAuth } from "@/context/auth-context";
import { MfaEnrolment } from "@/components/security/mfa-enrolment";
import { OmniboxTrigger } from "@/components/omnibox";
import { ThemeToggle } from "@/components/theme-toggle";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading, mfaEnrolmentRequired } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  // The backend is refusing this session for want of a second factor. Render
  // the enrolment screen and nothing else: `profile` is null because `me`
  // itself was refused, so the sidebar has no role to filter by and every
  // query behind it would fail identically. Signed in, and holding exactly one
  // affordance — the one that fixes it.
  if (!loading && user && mfaEnrolmentRequired) {
    return (
      <div className="flex min-h-svh w-full items-start justify-center p-4 md:p-10">
        <div className="w-full max-w-2xl">
          <MfaEnrolment blocking />
        </div>
      </div>
    );
  }

  if (loading || !user || !profile) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-4 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumbs />
          </div>
          {/* In the shell, not the sidebar: search is not a place you go, it
              is available from wherever you already are — which is the only
              version that saves the trip. */}
          <div className="flex shrink-0 items-center gap-4 px-4">
            <OmniboxTrigger />
            <ThemeToggle />
            <CurrentDateTime />
          </div>
        </header>
        <div className="@container/main flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
