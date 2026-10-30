import { toE164, prettyPhone } from "./numbers";
import { PhoneError, type Call, type CheckResult, type InboundText, type PhoneAdapter, type Voicemail } from "./types";

// Twilio, on her own Twilio account (Settings › Connections › Practice phone),
// or Isaiah's developer demo line (FRONT_DESK_DEV_TWILIO=true). Practice-OS
// never owns her number. The greeting and recording are TwiML hosted by Twilio
// (a TwiML Bin on the demo line, Twilio's echo Twimlet on hers, set by
// setVoicemail below), so nothing here needs a public URL; new recordings and
// texts are found by listing. Changing her number's call setting is her
// choice: the card asks first, keeps the old setting, and can put it back.

const API = "https://api.twilio.com/2010-04-01";

export type TwilioConfig = { accountSid: string; authToken: string; phoneNumber: string; /** Isaiah's demo line from .env. */ developer?: boolean };

type TwilioRecording = { sid: string; call_sid: string; date_created: string; status: string; duration: string };
type TwilioCall = { sid: string; from: string; to: string; status?: string; duration?: string | null; start_time?: string | null; date_created?: string };
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
    if (res.status === 401) {
      const fix = config.developer ? "Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env." : "Twilio didn't accept those keys. Copy the Account SID and Auth Token again from the Twilio Console home page.";
      throw new PhoneError("Twilio refused the keys", fix, 401);
    }
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
          return { ok: false, fix: config.developer ? "TWILIO_PHONE_NUMBER isn't a number on this Twilio account." : "That number is no longer on your Twilio account. Connect again and pick your number." };
        }
        return { ok: true, label: `Connected: ${prettyPhone(config.phoneNumber)} (Twilio${config.developer ? ", developer line" : ""})` };
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
          callId: r.call_sid,
          seconds: Number(r.duration) || 0,
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

    async recording(id: string) {
      if (!/^RE[0-9a-f]{32}$/i.test(id)) throw new PhoneError("Not a Twilio recording id", "This voicemail has no recording to play.");
      // MP3 is small and every browser plays it.
      const res = await fetchImpl(`${base}/Recordings/${id}.mp3`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new PhoneError(`Recording download failed (${res.status})`, "Twilio hasn't finished this recording yet. Try again in a minute.", res.status);
      return { bytes: Buffer.from(await res.arrayBuffer()), mime: "audio/mpeg" };
    },

    async listCalls(since: Date): Promise<Call[]> {
      const q = new URLSearchParams({ To: config.phoneNumber, "StartTime>": day(new Date(since.getTime() - 86_400_000)), PageSize: "100" });
      const out = await call<{ calls: TwilioCall[] }>(`/Calls.json?${q}`);
      return out.calls
        .filter((c) => !["queued", "ringing", "in-progress"].includes(c.status ?? ""))
        .map((c) => ({
          id: c.sid,
          from: toE164(c.from),
          receivedAt: new Date(c.start_time ?? c.date_created ?? 0),
          seconds: Number(c.duration) || 0,
          status: c.status ?? "completed",
        }))
        .filter((c) => c.receivedAt >= since)
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
  return { accountSid, authToken, phoneNumber, developer: true };
}

export type TwilioNumber = { sid: string; phoneNumber: string; label: string; tollFree: boolean };
/** Where Twilio sends calls to a number: what setVoiceUrl changes and Undo restores. */
export type VoiceSetting = { voiceUrl: string | null; voiceMethod: string | null };

/** Her Twilio numbers. Throws PhoneError (with a plain fix) when the keys don't work. */
export async function listTwilioNumbers(accountSid: string, authToken: string, fetchImpl: typeof fetch = fetch): Promise<TwilioNumber[]> {
  const auth = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
  let res: Response;
  try {
    res = await fetchImpl(`${API}/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=50`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new PhoneError("Twilio unreachable", "Couldn't reach Twilio. Check your internet and try again.");
  }
  if (res.status === 401 || res.status === 404) {
    throw new PhoneError("Twilio refused the keys", "Twilio didn't accept those keys. Copy the Account SID and Auth Token again from the Twilio Console home page.", res.status);
  }
  if (!res.ok) throw new PhoneError(`Twilio answered HTTP ${res.status}`, "Twilio didn't answer. Try again in a minute.", res.status);
  const out = (await res.json()) as { incoming_phone_numbers: { sid: string; phone_number: string }[] };
  return out.incoming_phone_numbers.map((n) => ({
    sid: n.sid,
    phoneNumber: n.phone_number,
    label: prettyPhone(n.phone_number),
    tollFree: isTollFree(n.phone_number),
  }));
}

export const isTollFree = (e164: string) => /^\+18(00|33|44|55|66|77|88)/.test(e164);

const ECHO = "https://twimlets.com/echo";
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The page Twilio reads when someone calls her number: her greeting, then a
 * recording of up to two minutes. Hosted by Twilio's echo Twimlet, so her
 * computer needs no public address. After the recording Twilio hangs up
 * (without an action Twilio would ask the same page again and loop).
 */
export function voicemailUrl(greeting: string): string {
  const hangup = `${ECHO}?${new URLSearchParams({ Twiml: "<Response><Hangup/></Response>" })}`;
  const twiml = `<Response><Say>${xml(greeting)}</Say><Record maxLength="120" playBeep="true" trim="trim-silence" action="${xml(hangup)}"/></Response>`;
  return `${ECHO}?${new URLSearchParams({ Twiml: twiml })}`;
}

const numberUrl = (config: TwilioConfig, numberSid: string) => `${API}/Accounts/${config.accountSid}/IncomingPhoneNumbers/${numberSid}.json`;
const basic = (config: TwilioConfig) => `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`;

/** Whether a number's call setting is Practice-OS voicemail (so it is never kept as the "old" setting). */
export const isPracticeOsVoicemail = (url: string | null | undefined) => Boolean(url?.startsWith(`${ECHO}?`) && url.includes("Record"));

/** Her number's current call setting, read before anything changes it. */
export async function getVoiceSetting(config: TwilioConfig, numberSid: string, fetchImpl: typeof fetch = fetch): Promise<VoiceSetting> {
  const res = await fetchImpl(numberUrl(config, numberSid), { headers: { Authorization: basic(config) }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res?.ok) throw new PhoneError(`Twilio number read failed (${res?.status ?? "network"})`, "Couldn't reach your Twilio number. Try again in a minute.", res?.status ?? null);
  const n = (await res.json()) as { voice_url?: string | null; voice_method?: string | null };
  return { voiceUrl: n.voice_url || null, voiceMethod: n.voice_method || null };
}

/** Sets where Twilio sends calls to her number (an empty url clears it). */
export async function setVoiceSetting(config: TwilioConfig, numberSid: string, v: VoiceSetting, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl(numberUrl(config, numberSid), {
    method: "POST",
    headers: { Authorization: basic(config), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ VoiceUrl: v.voiceUrl ?? "", VoiceMethod: v.voiceMethod ?? "POST" }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res?.ok) throw new PhoneError(`Twilio number update failed (${res?.status ?? "network"})`, "Couldn't change your number's call setting. Try again in a minute.", res?.status ?? null);
}
