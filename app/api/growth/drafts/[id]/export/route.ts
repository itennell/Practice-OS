import { googleAdsEditorCsv, metaAdsSpec, type GoogleAdsDraft, type MetaAdsDraft } from "@/lib/growth/ads";
import { renderSquarespaceText, siteFiles, type SiteDraft } from "@/lib/growth/site";
import { draftImage, getDraft, isReady } from "@/lib/growth/store";
import { makeZip } from "@/lib/growth/zip";
import { practiceToday } from "@/lib/compliance/store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATS = { google_ads: ["csv"], meta_ads: ["json", "image"], website: ["zip", "squarespace"] } as const;

function file(data: string | Buffer, type: string, name: string) {
  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": type, "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}

// Downloads for an approved Grow draft. Before she approves it, every format is
// refused: the approval is the only way to unlock an export.
export async function GET(request: Request, ctx: RouteContext<"/api/growth/drafts/[id]/export">) {
  const { id } = await ctx.params;
  const row = UUID.test(id) ? await getDraft(id) : null;
  if (!row) return Response.json({ error: "Not found." }, { status: 404 });
  if (!isReady(row)) return Response.json({ error: "Approve this draft first. Exports unlock once you approve it." }, { status: 409 });
  const as = new URL(request.url).searchParams.get("as") ?? FORMATS[row.kind][0];
  if (!(FORMATS[row.kind] as readonly string[]).includes(as)) return Response.json({ error: "That format isn't offered for this draft." }, { status: 400 });
  const tag = row.is_sample ? "sample-" : "";
  if (row.kind === "google_ads") return file(googleAdsEditorCsv(row.draft as GoogleAdsDraft), "text/csv; charset=utf-8", `${tag}google-ads-editor.csv`);
  if (row.kind === "meta_ads") {
    if (as === "image") {
      const jpeg = await draftImage(row.id);
      return jpeg ? file(jpeg, "image/jpeg", `${tag}meta-ad.jpg`) : Response.json({ error: "No picture." }, { status: 404 });
    }
    return file(JSON.stringify(metaAdsSpec(row.draft as MetaAdsDraft), null, 2), "application/json", `${tag}meta-ads-spec.json`);
  }
  const site = row.draft as SiteDraft;
  if (as === "squarespace") return file(renderSquarespaceText(site), "text/plain; charset=utf-8", `${tag}website-squarespace.txt`);
  return file(makeZip(siteFiles(site, await practiceToday())), "application/zip", `${tag}website.zip`);
}
