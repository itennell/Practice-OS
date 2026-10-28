import { db } from "../db";
import { OFFER_TTL_MS } from "../frontdesk/offers";
import { sendText } from "../frontdesk/store";
import type { Executor } from "./types";

// Texts a caller the consult times Front Desk offered (lib/frontdesk/offers.ts).
// The body is a fixed template; the offer row says which slot "1", "2" or "3" means.
export const textConsultOptions: Executor = async (approval) => {
  const { offer_id, inquiry_id, to, body } = approval.payload as Record<string, string>;
  if (!offer_id || !to || !body) throw new Error("payload needs offer_id, to and body.");
  const [offer] = await db()`select status from practice_os.consult_offers where id = ${offer_id}`;
  if (!offer) throw new Error("That offer no longer exists.");
  if (offer.status !== "pending") throw new Error("Newer times were offered since; this text is out of date.");
  const out = await sendText({ to, body, inquiryId: inquiry_id ?? null, actor: "executor", action: "consult_options_sent", approvalId: approval.id });
  await db()`
    update practice_os.consult_offers
    set status = 'sent', sent_at = now(), expires_at = now() + ${`${OFFER_TTL_MS / 1000} seconds`}::interval
    where id = ${offer_id}`;
  if (inquiry_id) {
    await db()`
      update practice_os.inquiries
      set status = case when status = 'booked' then status else 'options_sent' end,
          ai_disclosed_at = coalesce(ai_disclosed_at, now())
      where id = ${inquiry_id}`;
  }
  return { texted: to, dryRun: out.dryRun };
};
