import { auth } from "@/auth";

/** The signed-in user's database id, or null when there is no session. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
