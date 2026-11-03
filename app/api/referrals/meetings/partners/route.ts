import { practiceTimeZone } from "@/lib/compliance/store";
import { isSensitive } from "@/lib/referrals/catalog";
import { isSuppressed, suppressedList } from "@/lib/referrals/contacts";
import { listSources } from "@/lib/referrals/store";

// The Referrals calendar's partners. GET: every card on her board (so a meeting's
// details can show the partner's phone), each marked with why no meeting can be
// planned with it (do-not-contact, Not a fit, or a sensitive DV/SA agency, reached
// through its public line only), plus her practice time zone. Read only, like
// GET /api/referrals/meetings: proxy.ts guards it the same way. No street address
// leaves the server here.
export async function GET() {
  const [sources, suppressed, timeZone] = await Promise.all([listSources(), suppressedList(), practiceTimeZone()]);
  const partners = sources.map((s) => {
    const blocked = isSuppressed(s, suppressed)
      ? "on your do-not-contact list"
      : s.stage === "not_a_fit"
        ? "in Not a fit"
        : s.sensitive || (s.source_type ? isSensitive(s.source_type) : false)
          ? "a sensitive agency: reach them through their public line"
          : null;
    return { id: s.id, name: s.name, organization: s.organization, phone: s.phone, blocked };
  });
  const bare = (n: string) => n.replace(/^\[Sample\]\s*/, "");
  partners.sort((a, b) => bare(a.name).localeCompare(bare(b.name)));
  return Response.json({ partners, timeZone }, { headers: { "Cache-Control": "no-store" } });
}
