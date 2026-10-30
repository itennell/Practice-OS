import { connection } from "next/server";
import { z } from "zod";
import { BY, refuse } from "@/lib/studio/http";
import { standInDeps } from "@/lib/studio/standin";
import { listProjects, makeProject, type MakeEvent } from "@/lib/studio/store";

export async function GET() {
  await connection(); // per request, never at build time
  return Response.json({ projects: await listProjects() });
}

const body = z.object({ request: z.string().trim().min(3).max(600) }).strict();

// Make something new from what she typed. The answer streams one JSON event per
// line (lib/studio/store.ts MakeEvent) so the canvas fills in as Aeon works:
// research (~45 s), then the words, then the picture, then the slides.
export const maxDuration = 300;

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Tell Aeon what to make." }, { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // She may close the tab mid-way: Aeon keeps going (the post still reaches her approvals),
      // but nothing more is written to the closed stream, and close always runs.
      let open = true;
      const send = (e: MakeEvent | { type: "error"; why: string } | { type: "end" }) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        await makeProject(BY, parsed.data.request, send, process.env.PLAYWRIGHT_STUDIO_STANDIN === "1" ? standInDeps() : {});
      } catch (err) {
        // The details stay in the server log; the browser gets a plain sentence.
        console.error("studio make failed", err);
        send({ type: "error", why: "Aeon couldn't make that. Try again." });
      } finally {
        send({ type: "end" });
        try {
          controller.close();
        } catch {
          // Already closed by the browser going away.
        }
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
