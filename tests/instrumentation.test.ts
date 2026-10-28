// instrumentation.ts never starts a built-in database on the Vercel copy.
import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "../instrumentation";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("server start", () => {
  it("refuses to run on Vercel without DATABASE_URL", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATABASE_URL", "");
    await expect(register()).rejects.toThrow("DATABASE_URL is required on Vercel");
  });
});
