import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../lib/secrets";

beforeAll(() => {
  process.env.CONNECTIONS_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
});

describe("token encryption", () => {
  const token = "IGQVJ-fake-token-for-tests";

  it("round-trips and never contains the plain token", () => {
    const sealed = encryptSecret(token, "instagram:access_token");
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/);
    expect(sealed).not.toContain(token);
    expect(decryptSecret(sealed, "instagram:access_token")).toBe(token);
  });

  it("gives a different result every time (random IV)", () => {
    expect(encryptSecret(token, "gmail:refresh_token")).not.toBe(encryptSecret(token, "gmail:refresh_token"));
  });

  it("refuses a value moved to another provider or column", () => {
    const sealed = encryptSecret(token, "instagram:access_token");
    expect(() => decryptSecret(sealed, "gmail:access_token")).toThrow();
    expect(() => decryptSecret(sealed, "instagram:refresh_token")).toThrow();
  });

  it("refuses a tampered value", () => {
    const sealed = encryptSecret(token, "instagram:access_token");
    const parts = sealed.split(".");
    const last = parts[3]!;
    parts[3] = (last[0] === "A" ? "B" : "A") + last.slice(1);
    expect(() => decryptSecret(parts.join("."), "instagram:access_token")).toThrow();
  });

  it("refuses a plain token passed in by mistake", () => {
    expect(() => decryptSecret(token, "instagram:access_token")).toThrow(/Not an encrypted value/);
  });

  it("refuses a key of the wrong length", () => {
    const saved = process.env.CONNECTIONS_ENCRYPTION_KEY;
    process.env.CONNECTIONS_ENCRYPTION_KEY = Buffer.from("too short").toString("base64");
    try {
      expect(() => encryptSecret(token, "x")).toThrow(/32 bytes/);
    } finally {
      process.env.CONNECTIONS_ENCRYPTION_KEY = saved;
    }
  });
});
