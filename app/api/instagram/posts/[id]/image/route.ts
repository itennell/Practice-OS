import { postImage } from "@/lib/instagram/store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, ctx: RouteContext<"/api/instagram/posts/[id]/image">) {
  const { id } = await ctx.params;
  const jpeg = UUID.test(id) ? await postImage(id) : null;
  if (!jpeg) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(jpeg), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
}
