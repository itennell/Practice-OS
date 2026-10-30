import { connection } from "next/server";
import { formatDate } from "@/components/deadline-card";
import { InsuranceChecklist, type ChecklistData, type ChecklistPayer } from "@/components/insurance-checklist";
import { PayerTracker } from "@/components/payer-tracker";
import { ButtonLink, GlassCard } from "@/components/ui";
import { practiceToday } from "@/lib/compliance/store";
import { loadCredentialingProfile } from "@/lib/credentialing/store";
import { loadChecklist, needsPrelist, type Checklist, type PayerItem } from "@/lib/payers/checklist";
import { eligibilityTag } from "@/lib/payers/eligibility";
import { CMS855I_VERSION, LEFT_FOR_YOU, MFT_MHC_FAQ, cms855iEntries, specialtyFor } from "@/lib/payers/cms855i";
import { payerDates } from "@/lib/payers/store";

// Admin › Insurance: every payer that fits her license and state, already listed,
// each a checklist (credentialing, then contracting) with how to do each step and
// the official link. Under it, the dates for each application and the Medicare
// form Aeon prepares. Aeon prepares; she signs and submits. Its own file so the
// other Admin panels can change without touching this one.

function payerView(i: PayerItem): ChecklistPayer {
  const p = i.fit.payer;
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    note: i.fit.note,
    eligibilityTag: eligibilityTag(i.fit),
    eligibilitySource: i.fit.source,
    isDefault: i.fit.isDefault,
    status: i.status,
    statusLabel: i.statusLabel,
    networks: p.networks.map((n) => ({ name: n.name, status: n.panel.status, note: n.panel.note, source: n.panel.source })),
    facts: [
      { label: "How long", text: p.timeline.text, source: p.timeline.source },
      { label: "Fees", text: p.fees.text, source: p.fees.source },
      { label: "Recredential", text: p.recredential.text, source: p.recredential.source },
      { label: "Malpractice", text: p.requirements.malpractice, source: p.requirements.source },
    ].filter((f) => f.text),
    steps: i.steps.map((s) => ({ id: s.id, stage: s.stage, title: s.title, how: s.how, portal_url: s.portal_url, aeon_can: s.aeon_can, submits: s.submits, source: s.source, done_on: s.done_on })),
    notes: p.notes,
  };
}

export function checklistView(c: Checklist): ChecklistData {
  return {
    license: c.license,
    state: c.state,
    stateResearched: c.set.stateResearched,
    blocked: c.set.blocked,
    prerequisites: c.prerequisites.map((s) => ({ id: s.id, stage: "credentialing", title: s.title, how: s.how, portal_url: s.portal_url, aeon_can: s.aeon_can, applies: s.applies, source: s.source, done_on: s.done_on })),
    payers: c.payers.map(payerView),
    platforms: c.platforms.map(payerView),
    notEligible: c.set.notEligible.map((n) => ({ name: n.payer.name, reason: n.reason })),
    // The prelist is a write: only on her own computer, never on the view-only Vercel copy (its POST needs canDecide too).
    needsPrelist: needsPrelist(c) && !process.env.VERCEL,
  };
}

export async function Insurance() {
  await connection(); // read the database per request, never at build time
  const [checklist, profile, today] = await Promise.all([loadChecklist(), loadCredentialingProfile(), practiceToday()]);
  const apps = [...checklist.payers, ...checklist.platforms].map((i) => i.app).filter((a) => a.status !== "not_started").concat(checklist.other);
  const entries = profile ? cms855iEntries(profile) : [];
  const spec = profile ? specialtyFor(profile.identity.credential) : null;
  const dates = payerDates(apps, today, 90);
  return (
    <>
      <GlassCard aria-labelledby="checklist-heading" className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="checklist-heading" className="text-section font-semibold">
            Your insurance checklist
          </h2>
          <p className="max-w-[65ch] text-[var(--fg-muted)]">
            Every insurer you can join, with each step and how to do it. Aeon fills in what it can; you sign and send every application
            yourself. You can also ask Aeon in any chat, like “help me get on Aetna”.
          </p>
        </div>
        <InsuranceChecklist data={checklistView(checklist)} />
      </GlassCard>

      <GlassCard aria-labelledby="payers-heading" className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="payers-heading" className="text-section font-semibold">
            Dates for each application
          </h2>
          <p className="max-w-[65ch] text-[var(--fg-muted)]">
            Aeon reminds you to follow up 30 days after you apply and to recredential 36 months after approval. When you send an
            application, open Edit on its row and set Status to Applied yourself — only your own change records the sent date. Telling
            Aeon in chat never marks it sent.
          </p>
        </div>
        {dates.length > 0 && (
          <ul className="flex flex-col gap-1">
            {dates.map((d) => (
              <li key={`${d.id}-${d.kind}`} className="text-small">
                <strong>{formatDate(d.due_on, false)}</strong>: {d.what}
              </li>
            ))}
          </ul>
        )}
        <PayerTracker apps={apps} />
      </GlassCard>

      <GlassCard aria-labelledby="cms855i-heading" className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="cms855i-heading" className="text-section font-semibold">
            Medicare enrollment (CMS-855I)
          </h2>
          <p className="max-w-[65ch] text-[var(--fg-muted)]">
            Aeon fills the paper form (version {CMS855I_VERSION}, the one CMS posts) from your credentialing profile. You finish it, sign it and
            send it to your Medicare contractor. Applying online in{" "}
            <a href="https://pecos.cms.hhs.gov" target="_blank" rel="noreferrer" className="text-[var(--link)] underline underline-offset-2">
              PECOS
            </a>{" "}
            is usually faster.
          </p>
        </div>
        {!profile ? (
          <p>Set up your credentialing profile first.</p>
        ) : (
          <>
            {spec?.writeIn && (
              <p className="max-w-[65ch] text-small">
                The paper form doesn’t list your specialty yet, so Aeon checks “Undefined Non-Physician Practitioner Specialty” and writes in{" "}
                <strong>{spec.writeIn}</strong>, as{" "}
                <a href={MFT_MHC_FAQ} target="_blank" rel="noreferrer" className="text-[var(--link)] underline underline-offset-2">
                  CMS’s May 2024 FAQ
                </a>{" "}
                says to.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <h3 className="font-semibold">Aeon fills ({entries.length})</h3>
                <ul className="flex flex-col gap-1 text-small">
                  {entries.map((e) => (
                    <li key={e.field}>
                      {e.label}: <span className="text-[var(--fg-muted)]">{e.value === true ? "checked" : e.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="font-semibold">You complete</h3>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-small">
                  {LEFT_FOR_YOU.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink variant="primary" href="/api/payers/cms855i" download>
                Download the prepared CMS-855I
              </ButtonLink>
              <p className="text-small text-[var(--fg-muted)]">
                {profile.isSample ? "[Sample] Every page is marked not for submission. " : ""}Aeon never signs or submits it.
              </p>
            </div>
          </>
        )}
      </GlassCard>
    </>
  );
}
