"use client";

import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/auth-context";
import { ColorThemeProvider } from "@/context/color-theme-context";
import { ApiError } from "@/lib/api-client";

// Keyed by each query's leading queryKey segment (e.g. ["adminUsers", filter])
// so one global handler can still surface a page-appropriate message instead
// of a generic "something went wrong" for every failed query.
const QUERY_ERROR_LABELS: Record<string, string> = {
  adminUsers: "users",
  merchants: "merchants",
  adminPermissions: "permissions",
  "kyc-review-queue": "the review queue",
  "kyc-providers": "provider verification status",
  "kyc-provider-detail": "this provider's record",
  "kyc-audit-log": "the audit trail",
  "kyc-metrics": "verification metrics",
  // Not listed on purpose: kyc-document-url. It fails routinely (expired signed
  // URL, storage permissions) and the DocumentViewer already renders the error
  // inline — a toast on top of that is noise.
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            const label =
              QUERY_ERROR_LABELS[query.queryKey[0] as string] ?? "data";
            toast.error(
              error instanceof ApiError ? error.message : `Could not load ${label}.`,
            );
          },
        }),
      }),
  );

  // Light by default, not "system". The panel is used on office machines whose
  // OS theme is set for everything else, and an operator opening it for the
  // first time should get the brand's own light surface rather than whatever
  // their laptop decided. Dark and system both stay one click away in
  // Settings -> Themes.
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <ColorThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </AuthProvider>
          <Toaster position="top-center" />
        </QueryClientProvider>
      </ColorThemeProvider>
    </ThemeProvider>
  );
}
