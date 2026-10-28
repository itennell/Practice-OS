import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM with a raw 32-byte key, in the same v1.<iv>.<tag>.<ciphertext>
// shape as lib/secrets.ts. Shared by the relay and the app: the relay seals its
// own sign-in state with RELAY_STATE_KEY, and seals an Instagram token with the
// one-time key the app sent, so only that app can open it.

export function seal(plaintext: string, key: Buffer, context: string): string {
  if (key.length !== 32) throw new Error("seal key must be 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function unseal(sealed: string, key: Buffer, context: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || body === undefined) throw new Error("not a sealed value");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

/**
 * Where the relay may send a sign-in back to: the desktop app's own link, or
 * an app running on this same computer. Never another website.
 */
export function isAllowedReturn(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol === "practiceos:") return true;
  return u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost") && u.username === "" && u.password === "";
}
