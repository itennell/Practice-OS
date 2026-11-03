import { canChange } from "@/lib/referrals/http";
import { MAX_CSV_BYTES } from "@/lib/referrals/manual";
import { commitImport, previewImport } from "@/lib/referrals/org-store";
import { listSources } from "@/lib/referrals/store";

// CSV import. Without `commit`: reads the file and says, row by row, what an
// import would do (new, matched an existing card, on her do-not-contact list,
// or a problem), saving nothing. With `commit: true`: reads the same file
// again on the server and adds the new rows she kept ticked. Sends nothing.
export async function POST(request: Request) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { csv?: unknown; commit?: unknown; skip?: unknown };
  if (typeof body.csv !== "string" || !body.csv.trim()) return Response.json({ error: "Pick a CSV file first." }, { status: 400 });
  if (body.csv.length > MAX_CSV_BYTES) return Response.json({ error: "That file is too big. Keep it under 200 KB (about 200 rows)." }, { status: 400 });
  const skip = Array.isArray(body.skip) ? body.skip.filter((n): n is number => Number.isInteger(n)) : [];
  try {
    if (body.commit === true) {
      const r = await commitImport(body.csv, skip);
      return Response.json({ added: r.added.map((a) => ({ id: a.id, name: a.name })), matched: r.matched, failed: r.failed, cards: await listSources() });
    }
    const { rows, error } = await previewImport(body.csv);
    if (error) return Response.json({ error }, { status: 400 });
    return Response.json({ rows });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't read that file." }, { status: 400 });
  }
}
