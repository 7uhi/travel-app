import { redirect } from "next/navigation";

import { auth } from "@/auth";

/**
 * proxy.ts only verifies the session cookie, so a cookie from a since-deleted
 * account (another device) gets through it; auth() refuses it (auth.ts), and
 * this sends that visitor to sign in instead of an error screen.
 */
export default async function TripsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin?callbackUrl=/trips");
  return children;
}
