import { demoCapReached, isViewOnly } from "@/lib/aeon/demo";
import { practiceFacts } from "@/lib/instagram/store";
import { FALLBACK_SAMPLES, writeStyleSamples } from "@/lib/instagram/style";
import { canWrite } from "../safety";

// muse-spark-1.3 writes three [Sample] captions on one topic (warm, plain,
// professional) from her practice facts, so she can pick the style her posts use
// (lib/instagram/style.ts checks each one). Only her own app may spend her Muse
// calls; the demo copy and anything odd get the three fixed captions.
export const maxDuration = 60;

export async function POST(request: Request) {
  const fallback = () => Response.json({ samples: FALLBACK_SAMPLES, source: "fallback" }, { headers: { "Cache-Control": "no-store" } });
  if (!canWrite(request) || isViewOnly(request) || (await demoCapReached())) return fallback();
  const facts = await practiceFacts().catch(() => null);
  if (!facts) return fallback();
  return Response.json(await writeStyleSamples(facts), { headers: { "Cache-Control": "no-store" } });
}
