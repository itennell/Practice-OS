import { liveCheck } from "@/lib/instagram/account";

// The Instagram card's live check: who Instagram says the stored sign-in belongs to.
export async function GET() {
  return Response.json(await liveCheck());
}
