import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { requireEnv } from "./env";

// AES-256-GCM for stored sign-in tokens. The key lives only in .env / Vercel
// (CONNECTIONS_ENCRYPTION_KEY, 32 bytes base64). The database only ever sees:
//   v1.<iv base64url>.<auth tag base64url>.<ciphertext base64url>
// The context string (e.g. "instagram:access_token") is bound as associated
// data, so a value copied into another row or column fails to decrypt.
const VERSION = "v1";

function key(): Buffer {
  const raw = Buffer.from(requireEnv("CONNECTIONS_ENCRYPTION_KEY"), "base64");
  if (raw.length !== 32) throw new Error("CONNECTIONS_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return raw;
}

export function encryptSecret(plaintext: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptSecret(sealed: string, context: string): string {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error("Not an encrypted value from lib/secrets.ts.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
