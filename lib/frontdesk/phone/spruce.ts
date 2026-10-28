import { randomUUID } from "node:crypto";
import { prettyPhone, toE164 } from "./numbers";
import { PhoneError, type CheckResult, type InboundText, type PhoneAdapter, type Voicemail } from "./types";

// Spruce Health (developer.sprucehealth.com), the clinician's own account.
// She asks Spruce Support once to turn on API access, then pastes an org token
// from Settings > API Access. Spruce hosts her number, greeting and voicemail;
// we list conversations changed since the last check and read their new items.

export const SPRUCE_API = "https://api.sprucehealth.com/v1";

export type SpruceConfig = { token: string; endpointId?: string };

type SpruceEndpoint = { id: string; channel: string; displayValue: string; rawValue: string; isInternal: boolean };
type SpruceConversation = {
  id: string;
  type: string;
  lastMessageAt?: string;
  externalParticipants?: Array<{ endpoint?: SpruceEndpoint }>;
};
type SpruceAudio = {
  type: string;
  data: {
    mimetype?: string;
    signedUrl?: { url: string; expiresAt: string };
    transcription?: { id: string; status: string };
  };
};
type SpruceItem = {
  id: string;
  direction: "inbound" | "outbound" | "none";
  isInternalNote: boolean;
  text: string;
  createdAt: string;
  event?: { type: string; data: { answered?: boolean; voicemail?: SpruceAudio } };
};

type Scan = { voicemails: Voicemail[]; texts: InboundText[] };

export function spruceAdapter(config: SpruceConfig, fetchImpl: typeof fetch = fetch): PhoneAdapter {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchImpl(`${SPRUCE_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 401 || res.status === 403) {
      throw new PhoneError(
        `Spruce refused the token (${res.status})`,
        "Spruce turned this token down. Check you pasted all of it, and that Spruce Support has turned on API access for your account.",
        res.status,
      );
    }
    if (res.status === 429) throw new PhoneError("Spruce rate limit", "Spruce asked us to slow down. Front Desk will try again in a minute.", 429);
    if (!res.ok) throw new PhoneError(`Spruce answered HTTP ${res.status}`, "Spruce didn't answer. Try again in a minute.", res.status);
    return (await res.json()) as T;
  }

  async function phoneEndpoint(): Promise<SpruceEndpoint | null> {
    const out = await call<{ internalEndpoints: Array<{ endpoint: SpruceEndpoint }> }>("/internalendpoints");
    const phones = out.internalEndpoints.map((e) => e.endpoint).filter((e) => e.channel === "phone");
    return phones.find((e) => e.id === config.endpointId) ?? phones[0] ?? null;
  }

  async function transcriptText(id: string): Promise<string | undefined> {
    try {
      const out = await call<{ transcription: { status: string; text: string } }>(`/transcriptions/${encodeURIComponent(id)}`);
      return out.transcription.status === "completed" && out.transcription.text ? out.transcription.text : undefined;
    } catch {
      return undefined; // legacy (pre-Nov 2025) transcripts return 404
    }
  }

  // One pass over every phone conversation that changed since `since`; both
  // list calls share it, so a check costs one scan.
  let memo: { key: number; at: number; scan: Promise<Scan> } | null = null;

  async function doScan(since: Date): Promise<Scan> {
    const voicemails: Voicemail[] = [];
    const texts: InboundText[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({ orderBy: "last_message", pageSize: "50" });
      if (pageToken) q.set("paginationToken", pageToken);
      else q.set("startFrom", since.toISOString());
      const page = await call<{ conversations: SpruceConversation[]; hasMore: boolean; paginationToken: string }>(`/conversations?${q}`);
      for (const c of page.conversations.filter((c) => c.type === "phone")) {
        const caller = c.externalParticipants?.map((p) => p.endpoint).find((e) => e?.channel === "phone");
        const from = toE164(caller?.rawValue);
        const iq = new URLSearchParams({ order: "oldest_first", pageSize: "100", startFrom: since.toISOString() });
        const items = await call<{ conversationItems: SpruceItem[] }>(`/conversations/${encodeURIComponent(c.id)}/items?${iq}`);
        for (const item of items.conversationItems) {
          if (item.direction !== "inbound" || item.isInternalNote) continue;
          const receivedAt = new Date(item.createdAt);
          if (receivedAt < since) continue;
          const vm = item.event?.type === "inboundCall" ? item.event.data.voicemail : undefined;
          if (vm?.data.signedUrl) {
            const signed = vm.data.signedUrl;
            const tid = vm.data.transcription?.status === "completed" ? vm.data.transcription.id : undefined;
            voicemails.push({
              id: item.id,
              from,
              receivedAt,
              providerTranscript: tid ? await transcriptText(tid) : undefined,
              audio: async () => {
                // A signed URL: no auth header, and it must be fetched before expiresAt.
                const res = await fetchImpl(signed.url, { signal: AbortSignal.timeout(30_000) });
                if (!res.ok) throw new PhoneError(`Voicemail download failed (${res.status})`, "Try again in a minute.", res.status);
                return { bytes: Buffer.from(await res.arrayBuffer()), mime: vm.data.mimetype ?? res.headers.get("content-type") ?? "" };
              },
            });
          } else if (!item.event && item.text.trim() && from) {
            texts.push({ id: item.id, from, body: item.text, receivedAt });
          }
        }
      }
      pageToken = page.hasMore ? page.paginationToken : undefined;
    } while (pageToken);
    const byTime = (a: { receivedAt: Date }, b: { receivedAt: Date }) => a.receivedAt.getTime() - b.receivedAt.getTime();
    return { voicemails: voicemails.sort(byTime), texts: texts.sort(byTime) };
  }

  function scan(since: Date): Promise<Scan> {
    const key = since.getTime();
    if (!memo || memo.key !== key || Date.now() - memo.at > 30_000) memo = { key, at: Date.now(), scan: doScan(since) };
    return memo.scan;
  }

  return {
    vendor: "spruce",

    async check(): Promise<CheckResult> {
      try {
        const line = await phoneEndpoint();
        if (!line) return { ok: false, fix: "Your Spruce account has no business phone number yet. Add one in Spruce, then check again." };
        const e164 = toE164(line.rawValue);
        return { ok: true, label: `Connected: ${e164 ? prettyPhone(e164) : line.displayValue} (Spruce)` };
      } catch (e) {
        return { ok: false, fix: e instanceof PhoneError ? e.fix : "Couldn't reach Spruce. Check your internet, then try again." };
      }
    },

    listVoicemails: async (since) => (await scan(since)).voicemails,
    listInboundTexts: async (since) => (await scan(since)).texts,

    async sendText(to: string, body: string) {
      const line = await phoneEndpoint();
      if (!line) throw new PhoneError("No Spruce phone line", "Your Spruce account has no business phone number yet.");
      const out = await call<{ requestId: string }>(`/internalendpoints/${encodeURIComponent(line.id)}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "s-idempotency-key": randomUUID() },
        body: JSON.stringify({ destination: { smsOrEmailEndpoint: to }, message: { body: [{ type: "text", value: body }] } }),
      });
      return { id: out.requestId };
    },
  };
}
