import { z } from "zod";
import { refuse } from "../guard";
import { loadMediaFacts } from "@/lib/media/facts";
import { draftSite, saveChecklist, saveSiteCopy, saveWebsiteUrl } from "@/lib/media/website";

// Media > Website: save her address, tick the checklist, or write her five pages.
export const maxDuration = 120;

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("url"), url: z.string().max(200) }),
  z.object({ action: z.literal("checklist"), done: z.array(z.string().max(40)).max(20) }),
  z.object({ action: z.literal("pages") }),
]);

export async function POST(request: Request) {
  const no = refuse(request);
  if (no) return no;
  const b = body.safeParse(await request.json().catch(() => null));
  if (!b.success) return Response.json({ error: "Something was missing. Try again." }, { status: 400 });
  try {
    if (b.data.action === "url") return Response.json({ url: await saveWebsiteUrl(b.data.url) });
    if (b.data.action === "checklist") return Response.json({ done: await saveChecklist(b.data.done) });
    const site = await draftSite(await loadMediaFacts());
    await saveSiteCopy(site);
    return Response.json({ site });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "That didn't work. Try again." }, { status: 400 });
  }
}
