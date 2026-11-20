import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { redactUrl, scrubBreadcrumb, scrubEvent } from "./sentry";

const TOKEN = "Zk3_q-9xYb2LmN0pQrStUvWxYz012345";

describe("redactUrl", () => {
  it("hides invite tokens in paths, full URLs, and encoded callback URLs", () => {
    expect(redactUrl(`/invite/${TOKEN}`)).toBe("/invite/[token]");
    expect(redactUrl(`https://roam.example/invite/${TOKEN}?x=1`)).toBe(
      "https://roam.example/invite/[token]?x=1",
    );
    expect(redactUrl(`/api/auth/signin?callbackUrl=%2Finvite%2F${TOKEN}`)).toBe(
      "/api/auth/signin?callbackUrl=%2Finvite%2F[token]",
    );
  });

  it("leaves other URLs alone", () => {
    expect(redactUrl("/trips/abc123/expenses")).toBe("/trips/abc123/expenses");
  });
});

describe("scrubEvent", () => {
  it("drops user, headers, cookies, bodies, and query strings, and redacts invite tokens", () => {
    const event = {
      type: undefined,
      user: { id: "u1", email: "a@example.com" },
      request: {
        url: `https://roam.example/invite/${TOKEN}`,
        method: "GET",
        headers: { cookie: "authjs.session-token=secret" },
        cookies: { "authjs.session-token": "secret" },
        data: { note: "typed by a user" },
        query_string: "a=b",
      },
      message: `failed on /invite/${TOKEN}`,
      exception: { values: [{ type: "Error", value: `bad /invite/${TOKEN}` }] },
      contexts: { nextjs: { request_path: `/invite/${TOKEN}`, route_type: "render" } },
      breadcrumbs: [
        { category: "console", message: "anything logged" },
        { category: "navigation", data: { from: "/", to: `/invite/${TOKEN}` } },
        { category: "fetch", data: { url: `/invite/${TOKEN}`, method: "POST" } },
      ],
    } as ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.request).toEqual({
      url: "https://roam.example/invite/[token]",
      method: "GET",
    });
    expect(scrubbed.message).toBe("failed on /invite/[token]");
    expect(scrubbed.exception?.values?.[0].value).toBe("bad /invite/[token]");
    expect(scrubbed.contexts?.nextjs).toEqual({
      request_path: "/invite/[token]",
      route_type: "render",
    });
    expect(scrubbed.breadcrumbs).toEqual([
      { category: "navigation", data: { from: "/", to: "/invite/[token]" } },
      { category: "fetch", data: { url: "/invite/[token]", method: "POST" } },
    ]);
    expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console breadcrumbs", () => {
    expect(scrubBreadcrumb({ category: "console", message: "hi" })).toBeNull();
  });
});
