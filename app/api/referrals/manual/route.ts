import { canChange } from "@/lib/referrals/http";
import { limited } from "@/lib/referrals/rate-limit";

const MAX_BYTES = 8_000;
import { readManual } from "@/lib/referrals/manual";
import { addManual } from "@/lib/referrals/org-store";
import { getSource } from "@/lib/referrals/store";

// "Add someone yourself": an organisation or a person she knows, saved under
// Found and labelled "Added by you". Checked in plain code (lib/referrals/manual.ts);
// a sensitive type keeps only its city. Matched against her board first, so a
// card already there is pointed to, not made twice. Sends nothing.
export async function POST(request: Request) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const tooMany = limited(request, "manual", 30);
  if (tooMany) return tooMany;
  // Read the size before the body: a form is a few hundred bytes.
  const size = Number(request.headers.get("content-length") ?? "");
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) return Response.json({ error: "That's too much for one card." }, { status: 413 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Fill in the form first." }, { status: 400 });
  const read = readManual(body);
  if (!read.ok) return Response.json({ error: read.error }, { status: 400 });
  try {
    const r = await addManual(read.input, { addAnyway: body.add_anyway === true });
    if (r.refused) return Response.json({ error: r.refused }, { status: 409 });
    if (r.possible) return Response.json({ possible: r.possible });
    if (r.matched) return Response.json({ matched: r.matched, card: await getSource(r.matched.id) });
    return Response.json({ added: { id: r.id, name: r.name }, card: await getSource(r.id) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't add that." }, { status: 400 });
  }
}
