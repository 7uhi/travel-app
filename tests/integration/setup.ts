import { afterAll, beforeEach, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import { truncateAllTables } from "../database";
import { actAs, cookieJar } from "./helpers";

vi.mock("@/lib/session", () => ({ currentUserId: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/navigation", async () => {
  const { Redirect } = await import("./helpers");
  return {
    redirect: (url: string) => {
      throw new Redirect(url);
    },
  };
});

vi.mock("next/headers", async () => {
  const { cookieJar } = await import("./helpers");
  return {
    headers: async () => new Headers({ host: "localhost:3000" }),
    cookies: async () => ({
      get: (name: string) =>
        cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
      has: (name: string) => cookieJar.has(name),
      set: (name: string, value: string) => void cookieJar.set(name, value),
      delete: (name: string) => void cookieJar.delete(name),
    }),
  };
});

beforeEach(async () => {
  actAs(null);
  cookieJar.clear();
  await truncateAllTables(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});
