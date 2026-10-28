// Instagram API with Instagram Login (graph.instagram.com). Shapes from Meta's
// docs, checked 2026-10-28; recorded replies are in lib/instagram/__fixtures__/.
// - Business login and tokens: developers.facebook.com/docs/instagram-platform/
//   instagram-api-with-instagram-login/business-login
// - Publishing: developers.facebook.com/docs/instagram-platform/content-publishing
// - /media params: .../instagram-graph-api/reference/ig-user/media
// - Quota: .../instagram-graph-api/reference/ig-user/content_publishing_limit
// The app secret is never needed here: the code exchange and the long-lived
// exchange run on the relay (lib/instagram/relay.ts). Refresh needs no secret.

export const IG_GRAPH = "https://graph.instagram.com";
export const IG_API_VERSION = "v26.0";

export const SCOPES = ["instagram_business_basic", "instagram_business_content_publish"] as const;

/** Meta's limits on a single-image post (reference/ig-user/media). */
export const LIMITS = {
  captionChars: 2200,
  hashtags: 30,
  mentions: 20,
  altTextChars: 1000,
  imageBytes: 8 * 1024 * 1024,
} as const;

export type ContainerStatus = "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";

/** A Graph API error, with Meta's code so callers can tell an expired token apart. */
export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null,
    readonly body: unknown,
  ) {
    super(message);
  }
  /** Meta's code 190: the token is expired, revoked or wrong. She must reconnect. */
  get tokenInvalid() {
    return this.code === 190;
  }
}

export type Fetch = typeof fetch;

export class InstagramGraph {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async call<T>(method: "GET" | "POST", path: string, params: Record<string, string> = {}): Promise<T> {
    // A leading "/" means an unversioned endpoint (refresh_access_token).
    const url = new URL(path.startsWith("/") ? `${IG_GRAPH}${path}` : `${IG_GRAPH}/${IG_API_VERSION}/${path}`);
    const body = new URLSearchParams({ ...params, access_token: this.token });
    let res: Response;
    if (method === "GET") {
      url.search = body.toString();
      res = await this.fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
    } else {
      res = await this.fetchImpl(url, { method, body, signal: AbortSignal.timeout(30_000) });
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Meta answers JSON; anything else is reported as-is below.
    }
    if (!res.ok) {
      const err = (json as { error?: { message?: string; code?: number } } | null)?.error;
      throw new InstagramApiError(
        `Instagram ${method} /${path.split("?")[0]} failed (HTTP ${res.status}): ${err?.message ?? text.slice(0, 200)}`,
        res.status,
        err?.code ?? null,
        json ?? text,
      );
    }
    return json as T;
  }

  /** The live check: who this token belongs to. */
  me() {
    return this.call<{ user_id: string; username: string; id?: string }>("GET", "me", {
      fields: "user_id,username",
    });
  }

  /** Step 1: a container Meta fills by fetching image_url. */
  createImageContainer(igUserId: string, input: { imageUrl: string; caption: string; altText: string; aiGenerated: boolean }) {
    return this.call<{ id: string }>("POST", `${igUserId}/media`, {
      image_url: input.imageUrl,
      caption: input.caption,
      alt_text: input.altText,
      is_ai_generated: String(input.aiGenerated),
    });
  }

  containerStatus(containerId: string) {
    return this.call<{ status_code: ContainerStatus; id: string }>("GET", containerId, { fields: "status_code" });
  }

  /** Step 3: the post goes live. */
  publish(igUserId: string, containerId: string) {
    return this.call<{ id: string }>("POST", `${igUserId}/media_publish`, { creation_id: containerId });
  }

  permalink(mediaId: string) {
    return this.call<{ id: string; permalink: string }>("GET", mediaId, { fields: "permalink" });
  }

  /** Meta's docs say 50 in one place and 100 in another, so read the real number. */
  async publishingLimit(igUserId: string) {
    const res = await this.call<{ data: { quota_usage: number; config?: { quota_total: number; quota_duration: number } }[] }>(
      "GET",
      `${igUserId}/content_publishing_limit`,
      { fields: "quota_usage,config" },
    );
    const row = res.data[0];
    return { used: row?.quota_usage ?? 0, total: row?.config?.quota_total ?? 50 };
  }

  /** Long-lived tokens refresh only when at least 24 hours old and not yet expired. */
  refresh() {
    return this.call<{ access_token: string; token_type: string; expires_in: number }>("GET", "/refresh_access_token", {
      grant_type: "ig_refresh_token",
    });
  }
}

/** Counts hashtags and @ tags the way Meta's limits do. */
export function captionProblems(caption: string): string[] {
  const problems: string[] = [];
  if (caption.length > LIMITS.captionChars) problems.push(`The caption is ${caption.length} characters; Instagram allows ${LIMITS.captionChars}.`);
  const tags = caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  if (tags > LIMITS.hashtags) problems.push(`The caption has ${tags} hashtags; Instagram allows ${LIMITS.hashtags}.`);
  const mentions = caption.match(/(^|\s)@[\w.]+/g)?.length ?? 0;
  if (mentions > LIMITS.mentions) problems.push(`The caption tags ${mentions} accounts; Instagram allows ${LIMITS.mentions}.`);
  return problems;
}
