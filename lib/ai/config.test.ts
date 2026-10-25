import { afterEach, describe, expect, it } from "vitest";

import {
  aiMaxRetries,
  aiRequestTimeoutMs,
  aiTripDailyLimit,
  aiUserDailyLimit,
} from "@/lib/ai/config";

const KEYS = [
  "AI_SUGGEST_TIMEOUT_MS",
  "AI_SUGGEST_MAX_RETRIES",
  "AI_SUGGEST_USER_DAILY_LIMIT",
  "AI_SUGGEST_TRIP_DAILY_LIMIT",
] as const;
const saved = new Map<string, string | undefined>();

function setEnv(name: string, value: string | undefined): void {
  if (!saved.has(name)) saved.set(name, process.env[name]);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  for (const key of KEYS) {
    const original = saved.get(key);
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
  saved.clear();
});

describe("aiRequestTimeoutMs", () => {
  it("defaults to 8000 when unset", () => {
    setEnv("AI_SUGGEST_TIMEOUT_MS", undefined);
    expect(aiRequestTimeoutMs()).toBe(8_000);
  });

  it("accepts an in-range integer", () => {
    setEnv("AI_SUGGEST_TIMEOUT_MS", "250");
    expect(aiRequestTimeoutMs()).toBe(250);
  });

  it.each(["abc", "1.5", "1e3", "", "-5", "5", "999999999"])(
    "falls back to the default for malformed or out-of-range %j",
    (value) => {
      setEnv("AI_SUGGEST_TIMEOUT_MS", value);
      expect(aiRequestTimeoutMs()).toBe(8_000);
    },
  );
});

describe("aiMaxRetries", () => {
  it("defaults to 1 when unset", () => {
    setEnv("AI_SUGGEST_MAX_RETRIES", undefined);
    expect(aiMaxRetries()).toBe(1);
  });

  it("treats 0 as a real value, not a missing one", () => {
    setEnv("AI_SUGGEST_MAX_RETRIES", "0");
    expect(aiMaxRetries()).toBe(0);
  });

  it("accepts the ceiling value 2", () => {
    setEnv("AI_SUGGEST_MAX_RETRIES", "2");
    expect(aiMaxRetries()).toBe(2);
  });

  it.each(["3", "-1", "abc", "0.5", ""])(
    "falls back to the default for malformed or out-of-range %j",
    (value) => {
      setEnv("AI_SUGGEST_MAX_RETRIES", value);
      expect(aiMaxRetries()).toBe(1);
    },
  );
});

describe("daily generation limits", () => {
  it("defaults to 20 per user and 50 per trip", () => {
    setEnv("AI_SUGGEST_USER_DAILY_LIMIT", undefined);
    setEnv("AI_SUGGEST_TRIP_DAILY_LIMIT", undefined);
    expect(aiUserDailyLimit()).toBe(20);
    expect(aiTripDailyLimit()).toBe(50);
  });

  it.each(["0", "-3", "abc", "2.5"])(
    "falls back to defaults for invalid user limit %j",
    (value) => {
      setEnv("AI_SUGGEST_USER_DAILY_LIMIT", value);
      expect(aiUserDailyLimit()).toBe(20);
    },
  );

  it("accepts in-range values", () => {
    setEnv("AI_SUGGEST_TRIP_DAILY_LIMIT", "3");
    expect(aiTripDailyLimit()).toBe(3);
  });
});
