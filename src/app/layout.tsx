import "~/styles/globals.css";

import { type Metadata } from "next";
import localFont from "next/font/local";
import { AuthProvider } from "~/components/auth/auth-provider";
import { TooltipProvider } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

/**
 * Lader (src/fonts). If it fails to load, text falls back to the system
 * sans-serif stack (see --font-sans in globals.css).
 */
const lader = localFont({
  variable: "--font-lader",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  src: [
    { path: "../fonts/lader-thin.otf", weight: "100", style: "normal" },
    { path: "../fonts/lader-thinitalic.otf", weight: "100", style: "italic" },
    { path: "../fonts/lader-exlight.otf", weight: "200", style: "normal" },
    {
      path: "../fonts/lader-exlightitalic.otf",
      weight: "200",
      style: "italic",
    },
    { path: "../fonts/lader-light.otf", weight: "300", style: "normal" },
    { path: "../fonts/lader-lightitalic.otf", weight: "300", style: "italic" },
    { path: "../fonts/lader-regular.otf", weight: "400", style: "normal" },
    { path: "../fonts/lader-italic.otf", weight: "400", style: "italic" },
    { path: "../fonts/lader-medium.otf", weight: "500", style: "normal" },
    { path: "../fonts/lader-mediumitalic.otf", weight: "500", style: "italic" },
    { path: "../fonts/lader-semibold.otf", weight: "600", style: "normal" },
    {
      path: "../fonts/lader-semibolditalic.otf",
      weight: "600",
      style: "italic",
    },
    { path: "../fonts/lader-bold.otf", weight: "700", style: "normal" },
    { path: "../fonts/lader-bolditalic.otf", weight: "700", style: "italic" },
    { path: "../fonts/lader-exbold.otf", weight: "800", style: "normal" },
    { path: "../fonts/lader-exbolditalic.otf", weight: "800", style: "italic" },
    { path: "../fonts/lader-black.otf", weight: "900", style: "normal" },
    { path: "../fonts/lader-blackitalic.otf", weight: "900", style: "italic" },
  ],
});

export const metadata: Metadata = {
  title: "Cadence",
  description: "Continuous pricing for sustainability-linked loans",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn(lader.variable, "font-sans")}>
      <body>
        <AuthProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
