// Spike: send ONE SMS with the Twilio Messages API to Isaiah's own verified phone,
// then fetch its status once ~5 seconds later.
//
// Run: npx tsx scripts/spike-twilio.ts          (prints what it would send; sends nothing)
//      npx tsx scripts/spike-twilio.ts --send   (really sends one text)
//
// Docs used (read 2026-10-28):
// - Message resource: https://www.twilio.com/docs/messaging/api/message-resource
//   POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json, form-encoded To, From, Body;
//   HTTP Basic auth (Account SID + Auth Token is fine for local testing).
//   GET .../Messages/{Sid}.json to fetch. Status: accepted, scheduled, canceled, queued, sending, sent,
//   failed, delivered, undelivered, receiving, received, read.
// - Error 30034: https://www.twilio.com/docs/api/errors/30034
// - Error 30032: https://www.twilio.com/docs/api/errors/30032
// - Trial accounts: https://www.twilio.com/docs/usage/trials
// - Toll-free verification: https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding
// - Virtual Phone: https://www.twilio.com/docs/messaging/guides/guide-to-using-the-twilio-virtual-phone
//
// Why a text can be blocked (US carriers, not Twilio bugs):
// - 30034 "US A2P 10DLC - Message from an Unregistered Number": the From number is an ordinary
//   local (10-digit) number that is not attached to an approved A2P 10DLC Campaign (Brand + Campaign
//   registration, paid account only; Sole Proprietor campaigns allow one number). Carriers block it even
//   when you only text yourself. Fix: finish 10DLC registration, or send from a verified toll-free number.
// - 30032 "Toll-Free Number Has Not Been Verified": the From number is toll-free (8xx) and its
//   Toll-Free Verification is not approved yet. "Pending" is blocked too. Review is about 3 business days.
// - Trial accounts: can only text verified numbers (up to 5), SMS uses pre-set templates only
//   (custom bodies like this one are not supported), and trial numbers are shared. Upgrade first.
// - The Virtual Phone (+1 877 780 4236) in the Console takes API texts with no registration, but it
//   is a simulator; nothing reaches a real phone.
import { call, mask, requireEnv, saveFixture, SEND, sleep } from "./spike-lib";

const BODY = "Practice-OS spike test";
const env = requireEnv("spike-twilio", [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "CLINICIAN_ALERT_PHONE",
]);
const to = env.CLINICIAN_ALERT_PHONE; // Isaiah's own verified phone; the only allowed test recipient.
const from = env.TWILIO_PHONE_NUMBER;
const base = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}`;
const auth = `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`;

if (!SEND) {
  console.log("\nDry run (add --send to really send). Would send:");
  console.log(`  POST ${base.replace(env.TWILIO_ACCOUNT_SID, "AC[redacted]")}/Messages.json`);
  console.log(`  To=${mask(to)}  From=${mask(from)}  Body="${BODY}"`);
  process.exit(0);
}

type TwilioError = { code?: number; message?: string; more_info?: string; status?: number };
const explain = (e: TwilioError) => {
  console.error(`\nTwilio error ${e.code}: ${e.message}\n  more_info: ${e.more_info}`);
  if (e.code === 30034) console.error("  -> From is an unregistered 10DLC number. Register A2P 10DLC or use a verified toll-free number.");
  if (e.code === 30032) console.error("  -> From is a toll-free number without approved Toll-Free Verification.");
};

let ok = false;
try {
  const sent = await call("POST", `${base}/Messages.json`, {
    headers: { Authorization: auth, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: BODY }).toString(),
    logBody: { To: mask(to), From: mask(from), Body: BODY },
  });
  const msg = sent.body as { sid?: string; status?: string } & TwilioError;
  if (sent.status >= 400 || !msg.sid) {
    explain(msg);
  } else {
    console.log(`\nCreated ${msg.sid}, status ${msg.status}. Checking again in 5 seconds...`);
    await sleep(5000);
    const check = await call("GET", `${base}/Messages/${msg.sid}.json`, { headers: { Authorization: auth } });
    const m = check.body as { status?: string; error_code?: number | null; error_message?: string | null };
    console.log(`\nStatus after ~5s: ${m.status}${m.error_code ? ` (error ${m.error_code}: ${m.error_message ?? ""})` : ""}`);
    if (m.error_code) explain({ code: m.error_code, message: m.error_message ?? "", more_info: `https://www.twilio.com/docs/api/errors/${m.error_code}` });
    ok = check.status === 200 && !m.error_code && m.status !== "failed" && m.status !== "undelivered";
  }
  await saveFixture("twilio", ok);
} catch (err) {
  console.error(`\nspike-twilio failed: ${(err as Error).message}`);
  await saveFixture("twilio", false);
  process.exit(1);
}
process.exit(ok ? 0 : 1);
