import { postImage } from "@/lib/instagram/store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ?download=1 saves it as a file, for posting it herself in the Instagram app.
export async function GET(request: Request, ctx: RouteContext<"/api/instagram/posts/[id]/image">) {
  const { id } = await ctx.params;
  const jpeg = UUID.test(id) ? await postImage(id) : null;
  if (!jpeg) return new Response("Not found", { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "private, max-age=3600",
      ...(download ? { "content-disposition": `attachment; filename="instagram-post-${id.slice(0, 8)}.jpg"` } : {}),
    },
  });
}
