-- 044: What she learned about a referral partner over coffee ("Debrief my
-- coffee meeting", lib/referrals/debrief.ts).
--
-- She records a short voice debrief after meeting a referral partner. The audio
-- and the raw transcript are never stored: plain code strips anything about the
-- partner's own patients, Muse Spark fills in these fields from what is left,
-- plain code checks every field against that cleaned text, and she confirms or
-- edits each one before it is saved here. Practice-business facts only: how
-- they refer, who to ask for, who they serve, what they need from a therapist.
-- No client or patient details, ever.
--
-- suggested_from: a card Aeon suggested from a debrief ("you should meet the
-- nurse navigator at ..."), pointing at the partner who mentioned them. It is
-- labelled "Suggested from your debrief" and never contacted on its own.
--
-- The follow-up email reuses the referral_letter approval kind (copy and send
-- only), so the approvals kind check is unchanged.

alter table practice_os.referral_sources
  add column refers_via text check (refers_via in ('fax', 'portal', 'email', 'phone')),
  add column referral_contact text check (length(referral_contact) between 1 and 120),
  add column populations text[] check (cardinality(populations) <= 8 and length(array_to_string(populations, ',')) <= 480),
  add column needs_from_therapist text check (length(needs_from_therapist) between 1 and 300),
  add column waitlist boolean,
  add column payer_mix text check (length(payer_mix) between 1 and 200),
  add column best_time text check (length(best_time) between 1 and 120),
  add column last_meeting_summary text check (length(last_meeting_summary) between 1 and 600),
  add column connection_points text check (length(connection_points) between 1 and 300),
  add column profile_updated_at timestamptz,
  add column suggested_from uuid references practice_os.referral_sources (id) on delete set null;
