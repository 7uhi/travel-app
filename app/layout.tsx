import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";

import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Roam — travel planner",
  description: "Plan trips day by day, together.",
  applicationName: "Roam",
  appleWebApp: {
    capable: true,
    title: "Roam",
    statusBarStyle: "default",
  },
};

// Android shrinks the layout for the keyboard, so dialogs stay reachable.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  themeColor: "#f4f1e9",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
