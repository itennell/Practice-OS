// Offline checks of the Instagram publish path against Meta's documented replies
// (lib/instagram/__fixtures__). No network: fetch is a fake that records calls.
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { captionProblems, InstagramApiError, InstagramGraph } from "../lib/instagram/graph";
import { checkInstagramJpeg, POST_HEIGHT, POST_WIDTH, toInstagramJpeg } from "../lib/instagram/image";
import { publishImagePost, type PublishDeps, type PublishProgress } from "../lib/instagram/publish";
import { redirectUri, uploadPostImage } from "../lib/instagram/relay";

const fx = (name: string) => JSON.parse(readFileSync(`lib/instagram/__fixtures__/${name}.json`, "utf8")).body;

type Call = { method: string; url: URL; body: URLSearchParams | null };
function fakeFetch(replies: Array<[number, unknown]>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ method: init?.method ?? "GET", url, body: (init?.body as URLSearchParams) ?? null });
    const [status, body] = replies.shift() ?? [500, { error: { message: "no reply queued" } }];
    return new Response(JSON.stringify(body), { status });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const headshot = readFileSync("public/demo/dana-reyes-headshot.jpg");

describe("Instagram JPEG", () => {
  it("turns any image into a 1080x1350 sRGB JPEG under 8 MB", async () => {
    const png = await sharp({ create: { width: 2000, height: 1000, channels: 4, background: { r: 91, g: 71, b: 201, alpha: 0.5 } } })
      .png()
      .toBuffer();
    const jpeg = await toInstagramJpeg(png);
    const meta = await sharp(jpeg).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: POST_WIDTH, height: POST_HEIGHT, space: "srgb" });
    expect(meta.exif).toBeUndefined();
    expect(await checkInstagramJpeg(jpeg)).toEqual([]);
  });

  it("names what is wrong with an image Instagram would refuse", async () => {
    const wide = await sharp({ create: { width: 3000, height: 500, channels: 3, background: "#fff" } }).png().toBuffer();
    const problems = await checkInstagramJpeg(wide);
    expect(problems.join(" ")).toMatch(/JPEG/);
    expect(problems.join(" ")).toMatch(/wide/);
    expect(problems.join(" ")).toMatch(/shape/);
  });
});

describe("caption limits", () => {
  it("passes a normal caption and flags Meta's limits", () => {
    expect(captionProblems("Your first session: what to expect. #therapy")).toEqual([]);
    expect(captionProblems("x".repeat(2201))[0]).toMatch(/2201 characters/);
    expect(captionProblems(Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" "))[0]).toMatch(/31 hashtags/);
  });
});

describe("relay", () => {
  it("names the redirect URL for the Meta app", () => {
    expect(redirectUri("https://relay.example")).toBe("https://relay.example/connect/instagram/callback");
  });

  it("posts the JPEG to the relay's /images and returns its 1-hour URL", async () => {
    process.env.RELAY_URL = "https://relay.example/";
    const { impl, calls } = fakeFetch([[201, { url: "https://relay.example/i/abc.jpg", expiresAt: "2026-10-28T19:00:00Z" }]]);
    const hosted = await uploadPostImage(Buffer.from([0xff, 0xd8]), impl);
    expect(hosted.url).toBe("https://relay.example/i/abc.jpg");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url.href).toBe("https://relay.example/images");
    delete process.env.RELAY_URL;
  });
});

describe("Graph client", () => {
  it("reads the username for the live check", async () => {
    const { impl, calls } = fakeFetch([[200, fx("me")]]);
    expect((await new InstagramGraph("T", impl).me()).username).toBe("practiceos_");
    expect(calls[0].url.pathname).toBe("/v26.0/me");
    expect(calls[0].url.searchParams.get("fields")).toBe("user_id,username");
  });


  it("marks an expired token so the card can ask her to reconnect", async () => {
    const { impl } = fakeFetch([[400, fx("error_token_expired")]]);
    const err = await new InstagramGraph("T", impl).me().catch((e) => e);
    expect(err).toBeInstanceOf(InstagramApiError);
    expect(err.tokenInvalid).toBe(true);
  });
});

async function deps(replies: Array<[number, unknown]>) {
  const { impl, calls } = fakeFetch(replies);
  const saved: PublishProgress[] = [];
  const relay = { uploadJpeg: vi.fn(async () => ({ url: "https://relay.example/m/img1.jpg", expiresAt: "" })) };
  const d: PublishDeps = {
    graph: new InstagramGraph("T", impl),
    uploadImage: relay.uploadJpeg,
    igUserId: "17841400000000001",
    save: async (p) => void saved.push({ ...p }),
    sleep: async () => undefined,
  };
  return { d, calls, saved, relay };
}

const fresh: PublishProgress = { containerId: null, mediaId: null, permalink: null };

describe("publishing", async () => {
  const jpeg = await toInstagramJpeg(headshot);
  const input = { jpeg, caption: "How to book a first session. Dana Reyes, LCPC (fictional demo practice)", altText: "Dana smiling in her office", aiGenerated: true };

  it("hosts the JPEG, makes a container, waits, publishes and reads the link", async () => {
    const { d, calls, saved } = await deps([
      [200, fx("publishing_limit")],
      [200, fx("container_create")],
      [200, fx("container_in_progress")],
      [200, fx("container_finished")],
      [200, fx("media_publish")],
      [200, fx("permalink")],
    ]);
    const result = await publishImagePost(input, fresh, d);
    expect(result).toMatchObject({ mediaId: "17920238422030506", permalink: "https://www.instagram.com/p/SAMPLE123/", resumed: false });
    const create = calls[1];
    expect(create.method).toBe("POST");
    expect(create.url.pathname).toBe("/v26.0/17841400000000001/media");
    expect(create.body?.get("image_url")).toBe("https://relay.example/m/img1.jpg");
    expect(create.body?.get("alt_text")).toBe("Dana smiling in her office");
    expect(create.body?.get("is_ai_generated")).toBe("true");
    expect(calls[4].body?.get("creation_id")).toBe("17889455560051444");
    // The container id is saved before publishing, so a retry cannot post twice.
    expect(saved[0]).toEqual({ containerId: "17889455560051444", mediaId: null, permalink: null });
  });

  it("stops at a saved media id without calling Instagram", async () => {
    const { d, calls } = await deps([]);
    const r = await publishImagePost(input, { containerId: "c", mediaId: "m", permalink: "p" }, d);
    expect(r.resumed).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("resumes a saved container instead of making a second one", async () => {
    const { d, calls, relay } = await deps([
      [200, fx("container_finished")],
      [200, fx("media_publish")],
      [200, fx("permalink")],
    ]);
    const r = await publishImagePost(input, { ...fresh, containerId: "17889455560051444" }, d);
    expect(r.resumed).toBe(true);
    expect(relay.uploadJpeg).not.toHaveBeenCalled();
    expect(calls.map((c) => c.url.pathname)).not.toContain("/v26.0/17841400000000001/media");
  });

  it("refuses to post again when an earlier try already published", async () => {
    const { d } = await deps([[200, fx("container_published")]]);
    await expect(publishImagePost(input, { ...fresh, containerId: "c" }, d)).rejects.toThrow(/already on Instagram/);
  });

  it("respects the daily publishing limit", async () => {
    const { d, relay } = await deps([[200, fx("publishing_limit_full")]]);
    await expect(publishImagePost(input, fresh, d)).rejects.toThrow(/limit of 50 posts/);
    expect(relay.uploadJpeg).not.toHaveBeenCalled();
  });

  it("gives up after 5 minutes of waiting", async () => {
    const { d } = await deps([
      [200, fx("publishing_limit")],
      [200, fx("container_create")],
      ...Array.from({ length: 20 }, () => [200, fx("container_in_progress")] as [number, unknown]),
    ]);
    await expect(publishImagePost(input, fresh, d)).rejects.toThrow(/more than 5 minutes/);
  });

  it("checks the caption and image before anything leaves the computer", async () => {
    const { d, calls } = await deps([]);
    await expect(publishImagePost({ ...input, caption: "x".repeat(2300) }, fresh, d)).rejects.toThrow(/2,?200/);
    await expect(publishImagePost({ ...input, altText: " " }, fresh, d)).rejects.toThrow(/description/);
    expect(calls).toHaveLength(0);
  });
});
