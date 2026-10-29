import { connection } from "next/server";
import { liveCheck } from "@/lib/instagram/account";

// The Instagram card's live check: who Instagram says the stored sign-in belongs to.
export async function GET() {
  await connection(); // per request, never at build time
  return Response.json(await liveCheck());
}
