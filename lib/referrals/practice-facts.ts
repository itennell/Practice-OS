// Her practice facts for referral letters and the call script: name, phone, email, fees,
// insurers and telehealth read the same everywhere. Built only from what she already told
// Aeon (profile, credentialing, office settings, payer tracker, client-form policies).
import { db } from "../db";
import { loadCredentialingProfile } from "../credentialing/store";
import { loadPracticeSettings } from "../gfe/store";
import { listPayerApplications } from "../payers/store";
import { loadPolicies } from "../client-forms/store";

export type PracticeFacts = {
  name: string;
  credential: string;
  practiceName: string;
  neighborhood: string | null;
  city: string;
  state: string;
  phone: string;
  email: string;
  telehealth: boolean;
  fees: { label: string; cents: number }[];
  /** Insurers that approved her: only these are "in network". */
  inNetwork: string[];
  /** Sliding scale or reduced fees from her saved client-form policies; null when she hasn't said. */
  slidingScale: boolean | null;
  /** Whole years in practice, only when she said so herself; null otherwise. */
  yearsInPractice: number | null;
  isSample: boolean;
};

function years(raw: unknown): number | null {
  const v = (raw as { media?: { answers?: { yearsInPractice?: unknown } } } | null)?.media?.answers?.yearsInPractice;
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 70 ? v : null;
}

export async function loadPracticeFacts(): Promise<PracticeFacts> {
  const [p] = await db()<
    { full_name: string; credential: string; practice_name: string; neighborhood: string | null; city: string; state: string; is_sample: boolean; answers: Record<string, unknown> | null }[]
  >`select full_name, credential, practice_name, neighborhood, city, state, is_sample, onboarding_answers as answers from practice_os.clinician_profile limit 1`;
  if (!p) throw new Error("Finish setting up your practice first, so Aeon knows what to write.");
  const [cred, settings, payers, policies] = await Promise.all([loadCredentialingProfile(), loadPracticeSettings(), listPayerApplications(), loadPolicies()]);
  const loc = cred?.practiceLocation;
  return {
    name: p.full_name,
    credential: p.credential,
    practiceName: p.practice_name,
    neighborhood: p.neighborhood,
    city: p.city,
    state: p.state,
    phone: loc?.phone || cred?.identity.phone || "",
    email: cred?.identity.email ?? "",
    telehealth: Boolean(loc?.telehealth),
    fees: settings.fees.map((f) => ({ label: f.label, cents: f.cents })),
    inNetwork: payers.filter((x) => x.status === "approved").map((x) => x.payer),
    slidingScale: policies.saved && typeof policies.policies.offers_sliding_scale === "boolean" ? policies.policies.offers_sliding_scale : null,
    yearsInPractice: years(p.answers),
    isSample: p.is_sample,
  };
}
