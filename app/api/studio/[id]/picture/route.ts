import { toSquareJpeg } from "@/lib/instagram/image";
import { UUID } from "@/lib/studio/http";
import { studioPicture } from "@/lib/studio/store";

// The studio's current picture. ?download=1 saves it as a file; ?shape=square gives
// 1080 x 1080 (the 4:5 picture centred on a blurred fill, so no words are cut).
export async function GET(request: Request, ctx: RouteContext<"/api/studio/[id]/picture">) {
  const { id } = await ctx.params;
  const stored = UUID.test(id) ? await studioPicture(id) : null;
  if (!stored) return new Response("Not found", { status: 404 });
  const params = new URL(request.url).searchParams;
  const square = params.get("shape") === "square";
  const jpeg = square ? await toSquareJpeg(stored) : stored;
  const name = `instagram-${id.slice(0, 8)}${square ? "-square" : ""}.jpg`;
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "private, no-cache",
      ...(params.get("download") === "1" ? { "content-disposition": `attachment; filename="${name}"` } : {}),
    },
  });
}
