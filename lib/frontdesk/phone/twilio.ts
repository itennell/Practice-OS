import { toE164, prettyPhone } from "./numbers";
import { PhoneError, type CheckResult, type InboundText, type PhoneAdapter, type Voicemail } from "./types";

// Developer-only adapter for Isaiah's own demo line (FRONT_DESK_DEV_TWILIO=true).
// Never offered to clinicians: Practice-OS doesn't own or manage their numbers.
// The greeting and recording come from a TwiML Bin on the number (Twilio-hosted),
// so nothing here needs a public URL; new recordings and texts are found by listing.

const API = "https://api.twilio.com/2010-04-01";

export type TwilioConfig = { accountSid: string; authToken: string; phoneNumber: string };

type TwilioRecording = { sid: string; call_sid: string; date_created: string; status: string; duration: string };
type TwilioCall = { sid: string; from: string; to: string };
type TwilioMessage = { sid: string; from: string; to: string; body: string; direction: string; date_sent: string | null; date_created: string };

/** Twilio's date filters take whole days; the exact cut is applied after. */
function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function twilioAdapter(config: TwilioConfig, fetchImpl: typeof fetch = fetch): PhoneAdapter {
  const auth = `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`;
  const base = `${API}/Accounts/${config.accountSid}`;

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchImpl(path.startsWith("http") ? path : `${base}${path}`, {
      ...init,
      headers: { Authorization: auth, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 401) throw new PhoneError("Twilio refused the keys", "Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env.", 401);
    if (!res.ok) throw new PhoneError(`Twilio answered HTTP ${res.status}`, "Twilio didn't answer. Try again in a minute.", res.status);
    return (await res.json()) as T;
  }

  return {
    vendor: "twilio",

    async check(): Promise<CheckResult> {
      try {
        const q = new URLSearchParams({ PhoneNumber: config.phoneNumber });
        const out = await call<{ incoming_phone_numbers: unknown[] }>(`/IncomingPhoneNumbers.json?${q}`);
        if (out.incoming_phone_numbers.length === 0) {
          return { ok: false, fix: "TWILIO_PHONE_NUMBER isn't a number on this Twilio account." };
        }
        return { ok: true, label: `Connected: ${prettyPhone(config.phoneNumber)} (Twilio, developer line)` };
      } catch (e) {
        return { ok: false, fix: e instanceof PhoneError ? e.fix : "Couldn't reach Twilio." };
      }
    },

    async listVoicemails(since: Date): Promise<Voicemail[]> {
      const q = new URLSearchParams({ "DateCreated>": day(new Date(since.getTime() - 86_400_000)), PageSize: "50" });
      const out = await call<{ recordings: TwilioRecording[] }>(`/Recordings.json?${q}`);
      const done = out.recordings.filter((r) => r.status === "completed" && new Date(r.date_created) >= since);
      const voicemails: Voicemail[] = [];
      for (const r of done) {
        const c = await call<TwilioCall>(`/Calls/${r.call_sid}.json`);
        if (toE164(c.to) !== toE164(config.phoneNumber)) continue; // only calls to the practice line
        voicemails.push({
          id: r.sid,
          from: toE164(c.from),
          receivedAt: new Date(r.date_created),
          audio: async () => {
            // .wav is mono 16-bit PCM, which muse-voice-transcribe-1.0 accepts as is.
            const res = await fetchImpl(`${base}/Recordings/${r.sid}.wav`, { headers: { Authorization: auth } });
            if (!res.ok) throw new PhoneError(`Recording download failed (${res.status})`, "Try again in a minute.", res.status);
            return { bytes: Buffer.from(await res.arrayBuffer()), mime: "audio/wav" };
          },
        });
      }
      return voicemails.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
    },

    async listInboundTexts(since: Date): Promise<InboundText[]> {
      const q = new URLSearchParams({
        To: config.phoneNumber,
        "DateSent>": day(new Date(since.getTime() - 86_400_000)),
        PageSize: "100",
      });
      const out = await call<{ messages: TwilioMessage[] }>(`/Messages.json?${q}`);
      return out.messages
        .filter((m) => m.direction === "inbound")
        .map((m) => ({ id: m.sid, from: toE164(m.from) ?? m.from, body: m.body, receivedAt: new Date(m.date_sent ?? m.date_created) }))
        .filter((m) => m.receivedAt >= since)
        .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
    },

    async sendText(to: string, body: string) {
      const form = new URLSearchParams({ To: to, From: config.phoneNumber, Body: body });
      const out = await call<{ sid: string }>("/Messages.json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      return { id: out.sid };
    },
  };
}

/** The developer line from .env, or null when it isn't switched on. */
export function twilioFromEnv(env: NodeJS.ProcessEnv = process.env): TwilioConfig | null {
  if (env.FRONT_DESK_DEV_TWILIO !== "true") return null;
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const phoneNumber = toE164(env.TWILIO_PHONE_NUMBER);
  if (!accountSid || !authToken || !phoneNumber) return null;
  return { accountSid, authToken, phoneNumber };
}
