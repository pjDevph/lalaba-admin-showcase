import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";

// Sets the color-palette attribute from localStorage before the page paints,
// so switching palettes doesn't flash the previous one on reload — the same
// problem next-themes solves internally for light/dark, needed here too since
// the color-palette axis is a separate mechanism (see ColorThemeProvider).
//
// An operator who has never chosen gets "lalaba", the brand palette. Even the
// catch branch sets it: a localStorage failure should still produce a panel
// that looks like Lalaba, not the neutral greyscale it happened to ship with.
const SET_COLOR_THEME_SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem("color-theme") || "lalaba";
    if (theme !== "default") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "lalaba");
  }
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lalaba Admin",
  description: "Lalaba back office",
  // The brand's own favicon, from the approved asset set — the panel shipped
  // with Next's default, so a pinned tab was indistinguishable from any other
  // scaffolded app.
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="set-color-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: SET_COLOR_THEME_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
