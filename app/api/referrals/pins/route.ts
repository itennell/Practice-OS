import { connection } from "next/server";
import { LOOP } from "@/lib/referrals/area";
import { zipCenters } from "@/lib/referrals/geo";
import { getReferralSettings } from "@/lib/referrals/settings";
import { listSources } from "@/lib/referrals/store";

// Referrals › Map: the ZIP centers of the cards on her board (Census ZCTA centers, no
// outside call), and the map's center (her home ZIP, else downtown Chicago). A sensitive
// card's ZIP is never sent: it gets no pin (lib/referrals/sensitive.ts).
export async function GET() {
  await connection(); // read the database per request, never at build time
  const [sources, settings, centers] = await Promise.all([listSources(), getReferralSettings(), zipCenters()]);
  const zips: Record<string, [number, number]> = {};
  for (const s of sources) {
    const zip = s.zip?.slice(0, 5);
    if (!s.sensitive && zip && centers[zip]) zips[zip] = centers[zip];
  }
  const home = settings.searchZip ? centers[settings.searchZip] : undefined;
  return Response.json({ center: home ?? LOOP, zips }, { headers: { "Cache-Control": "no-store" } });
}
