import { toSquareJpeg } from "@/lib/instagram/image";
import { postImage } from "@/lib/instagram/store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ?download=1 saves it as a file, for posting it herself in the Instagram app.
// ?shape=square gives the 1080 x 1080 version; the default is the 4:5 feed post.
export async function GET(request: Request, ctx: RouteContext<"/api/instagram/posts/[id]/image">) {
  const { id } = await ctx.params;
  const stored = UUID.test(id) ? await postImage(id) : null;
  if (!stored) return new Response("Not found", { status: 404 });
  const params = new URL(request.url).searchParams;
  const square = params.get("shape") === "square";
  const jpeg = square ? await toSquareJpeg(stored) : stored;
  const name = `instagram-post-${id.slice(0, 8)}${square ? "-square" : ""}.jpg`;
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "private, max-age=3600",
      ...(params.get("download") === "1" ? { "content-disposition": `attachment; filename="${name}"` } : {}),
    },
  });
}
