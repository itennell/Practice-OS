// Spike: publish one image post to @practiceos_ with the Instagram API with Instagram Login.
// Steps: create a media container -> poll status_code until FINISHED -> media_publish -> read permalink.
//
// Run: npx tsx scripts/spike-instagram.ts          (checks the account and limit; publishes nothing)
//      npx tsx scripts/spike-instagram.ts --send   (really publishes the post)
//
// Docs used (read 2026-10-28):
// - Content publishing: https://developers.facebook.com/docs/instagram-platform/content-publishing
//   Host graph.instagram.com, examples on v26.0. POST /<IG_ID>/media (image_url, caption, access_token);
//   GET /<IG_CONTAINER_ID>?fields=status_code -> EXPIRED | ERROR | FINISHED | IN_PROGRESS | PUBLISHED
//   (docs: poll about once a minute, at most 5 minutes); POST /<IG_ID>/media_publish (creation_id);
//   GET /<IG_ID>/content_publishing_limit. JPEG only (no MPO/JPS); image must be on a public URL.
//   Permissions: instagram_business_basic, instagram_business_content_publish.
// - Get started (user id): https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started
//   GET /me?fields=user_id,username -> user_id is the professional account id (<IG_ID>) used above.
// - Version: https://developers.facebook.com/docs/graph-api/changelog/version26.0/ (v26.0, latest on 2026-10-28).
// Errors come back as Meta's JSON: { error: { message, type, code, error_subcode, fbtrace_id } }.
import { call, requireEnv, saveFixture, SEND, sleep } from "./spike-lib";

const BASE = "https://graph.instagram.com/v26.0";
const CAPTION = "Test post";
const env = requireEnv("spike-instagram", ["INSTAGRAM_ACCESS_TOKEN", ...(SEND ? ["SPIKE_IMAGE_URL"] : [])]);
const token = env.INSTAGRAM_ACCESS_TOKEN;
const form = (fields: Record<string, string>) => ({
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ ...fields, access_token: token }).toString(),
  logBody: fields,
});
const get = (path: string, fields: string) =>
  call("GET", `${BASE}/${path}?${new URLSearchParams({ fields, access_token: token })}`);

type MetaError = { error?: { message: string; type: string; code: number; error_subcode?: number; fbtrace_id?: string } };
function failed(step: string, body: unknown): never {
  console.error(`\n${step} failed. Meta's error:\n${JSON.stringify((body as MetaError).error ?? body, null, 2)}`);
  throw new Error(step);
}

let ok = false;
try {
  // Which account is this token for? (Also gives the IG user id if .env doesn't have it.)
  const me = await get("me", "user_id,username,account_type");
  if (me.status !== 200) failed("Reading the account", me.body);
  const meBody = me.body as { user_id?: string; username?: string };
  const igId = process.env.INSTAGRAM_USER_ID || meBody.user_id;
  if (!igId) failed("Finding the Instagram user id", me.body);
  console.log(`\nAccount @${meBody.username}, user id ${igId}${process.env.INSTAGRAM_USER_ID ? "" : " (put INSTAGRAM_USER_ID=" + igId + " in .env)"}`);

  const limit = await get(`${igId}/content_publishing_limit`, "config,quota_usage");
  if (limit.status !== 200) failed("Reading the publishing limit", limit.body);

  if (!SEND) {
    console.log(`\nDry run (add --send to publish). Would post image ${process.env.SPIKE_IMAGE_URL || "<SPIKE_IMAGE_URL not set>"} with caption "${CAPTION}".`);
    ok = true;
  } else {
    const created = await call("POST", `${BASE}/${igId}/media`, form({ image_url: env.SPIKE_IMAGE_URL, caption: CAPTION }));
    const containerId = (created.body as { id?: string }).id;
    if (created.status !== 200 || !containerId) failed("Creating the media container", created.body);

    // Images are usually ready in seconds; poll every 10s for up to 5 minutes (docs' ceiling).
    let status = "IN_PROGRESS";
    for (let i = 0; i < 30 && status === "IN_PROGRESS"; i++) {
      if (i) await sleep(10_000);
      const s = await get(containerId!, "status_code,status");
      if (s.status !== 200) failed("Checking the container", s.body);
      status = (s.body as { status_code: string }).status_code;
    }
    if (status !== "FINISHED") failed(`Container ended as ${status}`, { status_code: status });

    const pub = await call("POST", `${BASE}/${igId}/media_publish`, form({ creation_id: containerId! }));
    const mediaId = (pub.body as { id?: string }).id;
    if (pub.status !== 200 || !mediaId) failed("Publishing", pub.body);

    const link = await get(mediaId!, "permalink,timestamp");
    if (link.status !== 200) failed("Reading the permalink", link.body);
    console.log(`\nPublished: ${(link.body as { permalink?: string }).permalink}`);
    ok = true;
  }
  await saveFixture("instagram", ok, { published: SEND });
} catch (err) {
  console.error(`\nspike-instagram stopped: ${(err as Error).message}`);
  await saveFixture("instagram", false, { published: false });
  process.exit(1);
}
process.exit(ok ? 0 : 1);
