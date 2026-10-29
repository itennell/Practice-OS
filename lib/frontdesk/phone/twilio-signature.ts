import { createHmac, timingSafeEqual } from "node:crypto";

// X-Twilio-Signature (twilio.com/docs/usage/webhooks/webhooks-security):
// HMAC-SHA1, keyed with the auth token, over the full URL followed by every
// POST parameter name and value, sorted by name; base64-encoded.
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function isValidTwilioSignature(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature || !authToken) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
