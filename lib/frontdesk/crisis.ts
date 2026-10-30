import { audit } from "../audit";
import { db } from "../db";
import { CRISIS_REPLY, type CrisisCategory } from "../safety";
import { toE164 } from "./phone/numbers";
import type { PhoneAdapter } from "./phone/types";
import { maskPhone } from "./redact";
import { addAlert, sendText } from "./store";
import { crisisAlertText } from "./templates";

/**
 * Her own verified cell for urgent alerts: settings.alert_phone (set during
 * onboarding, migration 013), with CLINICIAN_ALERT_PHONE as the developer fallback.
 * Read through to_jsonb so it works before 013 has run.
 */
export async function alertPhone(): Promise<string | null> {
  const [row] = await db()`select to_jsonb(s) ->> 'alert_phone' as phone from practice_os.settings s limit 1`.catch(() => []);
  return toE164(row?.phone) ?? toE164(process.env.CLINICIAN_ALERT_PHONE);
}

// The one path that skips approvals (AGENTS.md > Approvals): the fixed crisis
// reply to the caller and an urgent alert to the clinician's own verified phone
// (CLINICIAN_ALERT_PHONE), both written to audit_log. No model sees the words.
export async function handleCrisis(input: {
  inquiryId: string;
  channel: "voicemail" | "sms";
  from: string | null;
  category: CrisisCategory;
  phone: PhoneAdapter | null;
}): Promise<{ replied: boolean; alerted: boolean }> {
  await db()`
    update practice_os.inquiries set crisis_flag = true, status = 'needs_clinician'
    where id = ${input.inquiryId}`;
  // The page gets the masked number; only the text to her own phone below has it in full.
  await addAlert("crisis", crisisAlertText(input.channel, input.from ? maskPhone(input.from) : null), input.inquiryId);
  await audit({
    actor: "safety",
    action: "crisis_detected",
    subjectType: "inquiry",
    subjectId: input.inquiryId,
    details: { channel: input.channel, category: input.category },
  });

  let replied = false;
  if (input.from) {
    try {
      await sendText({ to: input.from, body: CRISIS_REPLY, inquiryId: input.inquiryId, actor: "safety", action: "crisis_reply_sent", force: true, phone: input.phone });
      replied = true;
    } catch (e) {
      await audit({ actor: "safety", action: "crisis_reply_failed", subjectType: "inquiry", subjectId: input.inquiryId, details: { error: String(e) } });
    }
  }

  let alerted = false;
  const clinician = await alertPhone();
  if (clinician) {
    try {
      await sendText({ to: clinician, body: crisisAlertText(input.channel, input.from), inquiryId: null, actor: "safety", action: "crisis_alert_sent", force: true, phone: input.phone });
      alerted = true;
    } catch (e) {
      await audit({ actor: "safety", action: "crisis_alert_failed", subjectType: "inquiry", subjectId: input.inquiryId, details: { error: String(e) } });
    }
  } else {
    await audit({ actor: "safety", action: "crisis_alert_failed", subjectType: "inquiry", subjectId: input.inquiryId, details: { error: "no alert phone (settings.alert_phone or CLINICIAN_ALERT_PHONE)" } });
  }
  return { replied, alerted };
}
