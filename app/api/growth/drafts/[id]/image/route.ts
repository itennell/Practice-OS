import { draftImage } from "@/lib/growth/store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The Meta ad picture, to look at before she approves. The download is on the export route.
export async function GET(_request: Request, ctx: RouteContext<"/api/growth/drafts/[id]/image">) {
  const { id } = await ctx.params;
  const jpeg = UUID.test(id) ? await draftImage(id) : null;
  if (!jpeg) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(jpeg), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
}
