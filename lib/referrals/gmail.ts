// A Gmail DRAFT, never a sent email (gmail.compose scope only): she opens
// Gmail and presses send herself. Gmail API users.drafts.create takes the whole
// message as RFC 2822 text, base64url-encoded, in message.raw.
// https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create

export const GMAIL_COMPOSE = "https://www.googleapis.com/auth/gmail.compose";

/** Thrown when Google isn't connected (or lacks gmail.compose). Matches lib/connect's NeedsConnectError by name. */
export class NeedsGoogleError extends Error {
  readonly name = "NeedsConnectError";
  constructor() {
    super("Connect Google first: open Settings › Connections and press Connect Google. The letter is saved here until then.");
  }
}

/**
 * The access token from the desktop app's Google Connect (lib/connect,
 * getAccessToken('google', [gmail.compose]), interface v0). That module isn't on
 * main yet; until it is, Google counts as not connected.
 * TODO(desktop-app): import { getAccessToken } from "../connect" once it lands.
 */
export async function gmailToken(): Promise<string> {
  throw new NeedsGoogleError();
}

/** Encodes a header value that isn't plain ASCII (RFC 2047). */
function header(value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ");
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

/** The RFC 2822 message for the draft. Only To, Subject and the text body; Gmail adds From. */
export function mimeMessage(to: string, subject: string, body: string): string {
  if (!/^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/.test(to)) throw new Error("TEST_INBOX_EMAIL isn't an email address.");
  return [
    `To: ${to}`,
    `Subject: ${header(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
}

export async function createDraft(
  token: string,
  msg: { to: string; subject: string; body: string },
  fetcher: typeof fetch = fetch,
): Promise<{ draftId: string; messageId: string }> {
  const raw = Buffer.from(mimeMessage(msg.to, msg.subject, msg.body), "utf8").toString("base64url");
  const res = await fetcher("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ message: { raw } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403) throw new NeedsGoogleError();
  if (!res.ok) throw new Error(`Gmail didn't save the draft (${res.status}). Try again in a minute.`);
  const data = (await res.json()) as { id: string; message: { id: string } };
  return { draftId: data.id, messageId: data.message.id };
}
