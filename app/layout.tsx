import type { Metadata } from "next";
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
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
