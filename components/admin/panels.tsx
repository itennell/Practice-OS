import Link from "next/link";
import { connection } from "next/server";
import { formatDate } from "@/components/deadline-card";
import { GfeDraftForm } from "@/components/gfe-draft-form";
import { GfeMakePdf } from "@/components/gfe-make-pdf";
import { GfeTimingCheck } from "@/components/gfe-timing-check";
import { StatusPill } from "@/components/shared/status-mark";
import { ButtonLink, GlassCard } from "@/components/ui";
import { danaFacts } from "@/lib/compliance/demo";
import { loadSavedRules } from "@/lib/compliance/researched";
import { SHIPPED_RULES } from "@/lib/compliance/rules";
import { STATES } from "@/lib/compliance/states";
import { loadFacts, practiceToday } from "@/lib/compliance/store";
import { CAQH_URL, caqhPrep } from "@/lib/credentialing/checklist";
import { emptyCredentialingProfile, loadCredentialingProfile, sectionValues } from "@/lib/credentialing/store";
import { CredentialingEditor } from "@/components/credentialing-editor";
import { money } from "@/lib/gfe/build";
import { CMS855I_VERSION, LEFT_FOR_YOU, MFT_MHC_FAQ, cms855iEntries, specialtyFor } from "@/lib/payers/cms855i";
import { listPayerApplications, payerDates } from "@/lib/payers/store";
import { PayerTracker } from "@/components/payer-tracker";
import { CPT } from "@/lib/superbill/codes";
import { listSuperbills, summarize } from "@/lib/superbill/store";
import { MarkGiven, SuperbillForm } from "@/components/superbill-form";
import { ReleaseFormBuilder } from "@/components/release-form-builder";
import { getReleaseDraft } from "@/lib/release/drafts";
import { SERVICE_KINDS, estimateStatus, listEstimates, loadPracticeSettings, toOpenDays } from "@/lib/gfe/store";

// The Admin page's side panels (?panel=...): each form opens already filled with what
// Aeon knows (today's date, her fees, her profile), next to its list. These were the
// Paperwork tabs. Server components; the forms inside them are client components.

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function GoodFaithEstimates() {
  await connection(); // read the database per request, never at build time
  const [{ hours, fees }, estimates, today] = await Promise.all([loadPracticeSettings(), listEstimates(), practiceToday()]);
  const open = toOpenDays(hours);
  const days = open.weekdays.map((d) => WEEKDAY[d]).join(", ");
  return (
    <>
      <GlassCard aria-labelledby="new-gfe-heading" className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="new-gfe-heading" className="text-section font-semibold">
            New Good Faith Estimate
          </h2>
          <p className="max-w-[65ch] text-[var(--fg-muted)]">
            For a client paying out of pocket. No client names here: you type their details when you make the PDF, and Aeon doesn’t
            save them. Due dates count the days you’re open ({days}
            {open.closeFederalHolidays ? ", closed federal holidays" : ""}).{" "}
            <Link href="/settings" className="text-[var(--link)] underline underline-offset-2">
              Change hours or fees
            </Link>
          </p>
        </div>
        <GfeDraftForm fees={fees} open={open} today={today} />
      </GlassCard>

      <GlassCard aria-labelledby="gfe-list-heading" className="flex flex-col gap-4 p-5 md:p-6">
        <h2 id="gfe-list-heading" className="text-section font-semibold">
          Estimates
        </h2>
        {estimates.length === 0 ? (
          <p className="text-[var(--fg-muted)]">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {estimates.map((e) => {
              const status = estimateStatus(e);
              const tone = e.issued_on ? (e.on_time ? "done" : "failed") : e.approval_status === "rejected" ? "declined" : "pending";
              return (
                <li key={e.id} aria-label={e.reference} className="rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <h3 className="font-semibold">
                        {e.reference}
                        {e.is_sample && " [Sample]"}: {SERVICE_KINDS[e.service_kind].toLowerCase()}, {money(e.total_cents)}
                      </h3>
                      <p className="text-small text-[var(--fg-muted)]">
                        {e.lines.map((l) => `${l.quantity} x ${l.code} ${money(l.cents)}`).join(" · ")}
                        {e.service_on ? ` · First visit ${formatDate(e.service_on, false)}` : ` · Requested ${formatDate(e.requested_on!, false)}`}
                        {e.due_on ? ` · Due ${formatDate(e.due_on, false)}` : " · No deadline at booking"}
                        {e.issued_on && ` · Issued ${formatDate(e.issued_on, false)}`}
                      </p>
                    </div>
                    <StatusPill status={tone}>{status}</StatusPill>
                  </div>
                  {!e.issued_on && e.approval_status === "pending" && (
                    <p className="mt-2 text-small">
                      <Link href="/approvals" className="text-[var(--link)] underline underline-offset-2">
                        Approve it in Approvals
                      </Link>{" "}
                      to confirm the fees and mark it issued.
                    </p>
                  )}
                  {e.approval_status !== "rejected" && (
                    <details className="mt-3">
                      <summary className="flex min-h-touch cursor-pointer items-center font-medium">Make the PDF</summary>
                      <div className="pt-2">
                        <GfeMakePdf id={e.id} reference={e.reference} issued={Boolean(e.issued_on)} />
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-small text-[var(--fg-muted)]">
          Approving confirms the fees and records the estimate as issued. Aeon never sends it: you give the PDF to the client.{" "}
          <a href="/api/gfe/sample" target="_blank" rel="noreferrer" className="text-[var(--link)] underline underline-offset-2">
            See a filled-in sample PDF
          </a>
          .
        </p>
      </GlassCard>

      <GlassCard aria-labelledby="timing-heading" className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="timing-heading" className="text-section font-semibold">
            When is an estimate due?
          </h2>
          <p className="max-w-[65ch] text-[var(--fg-muted)]">
            Counted in days you’re open. Booked 3 or more open days ahead: 1 open day. 10 or more: 3 open days. If the client asks: 3 open
            days.
          </p>
        </div>
        <GfeTimingCheck open={open} initial={{ bookedOn: "2026-11-25", visitOn: "2026-12-15" }} />
        <p className="text-small text-[var(--fg-muted)]">
          Source:{" "}
          <a
            href="https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-149/subpart-G/section-149.610"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--link)] underline underline-offset-2"
          >
            45 CFR 149.610
          </a>
          . Aeon tracks paperwork; it isn’t legal advice.
        </p>
      </GlassCard>
    </>
  );
}

export async function Superbills() {
  await connection(); // read the database per request, never at build time
  const [{ fees }, today, profile] = await Promise.all([loadPracticeSettings(), practiceToday(), loadCredentialingProfile()]);
  const bills = await listSuperbills().catch(() => null);
  const cpts = Object.entries(CPT).map(([code, c]) => ({ code, label: c.label }));
  return (
    <>
      <GlassCard aria-labelledby="new-superbill-heading" className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="new-superbill-heading" className="text-section font-semibold">
            New superbill
          </h2>
          <p className="max-w-[65ch] text-[var(--fg-muted)]">
            For a client who pays you and asks their insurer to pay them back. Aeon fills in your practice, codes and fees. The client’s
            name, birth date, address and diagnosis codes stay blank in the PDF: you type them on your own computer, then give it to the
            client your own way. Or just tell Aeon in the chat, for example “superbill for four 53-minute video sessions in October, paid in
            full.”
          </p>
          {(!profile?.npi.number || !profile?.tin) && (
            <p className="text-small font-medium">
              Add your NPI and tax ID on{" "}
              <Link href="/admin?panel=credentialing" className="text-[var(--link)] underline underline-offset-2">
                Credentialing
              </Link>{" "}
              first. The superbill needs both.
            </p>
          )}
        </div>
        <SuperbillForm cpts={cpts} fees={fees} today={today} />
      </GlassCard>

      <GlassCard aria-labelledby="superbill-list-heading" className="flex flex-col gap-4 p-5 md:p-6">
        <h2 id="superbill-list-heading" className="text-section font-semibold">
          Superbills
        </h2>
        {bills === null ? (
          <p className="text-[var(--fg-muted)]">Superbills aren’t set up in the database yet (migration 011).</p>
        ) : bills.length === 0 ? (
          <p className="text-[var(--fg-muted)]">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {bills.map((b) => {
              const tone = b.issued_on ? "done" : "pending";
              return (
                <li key={b.id} aria-label={b.reference} className="rounded-[20px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <h3 className="font-semibold">
                        {b.reference}
                        {b.is_sample && " [Sample]"}: {b.lines.length} {b.lines.length === 1 ? "session" : "sessions"}, {money(b.total_cents)}
                      </h3>
                      <p className="text-small text-[var(--fg-muted)]">
                        {summarize(b.lines)} · Paid {money(b.paid_cents)}
                        {b.issued_on && ` · Given ${formatDate(b.issued_on, false)}`}
                      </p>
                    </div>
                    <StatusPill status={tone}>{b.issued_on ? "Given to client" : "Ready for you"}</StatusPill>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <ButtonLink variant="primary" href={`/api/superbills/${b.id}/pdf`} className="h-touch! px-5!">
                      Download PDF<span className="sr-only"> for {b.reference}</span>
                    </ButtonLink>
                    {!b.issued_on && <MarkGiven id={b.id} reference={b.reference} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-small text-[var(--fg-muted)]">
          Aeon never sends a superbill and never signs it. Open the PDF in Preview or Acrobat, fill in the blank boxes, sign it, then give it
          to the client.{" "}
          <a href="/api/superbills/sample" target="_blank" rel="noreferrer" className="text-[var(--link)] underline underline-offset-2">
            See a sample PDF
          </a>
          .
        </p>
      </GlassCard>
    </>
  );
}

export async function ReleaseForms({ draft }: { draft?: string }) {
  await connection(); // read the database per request, never at build time
  const today = await practiceToday();
  const filled = getReleaseDraft(draft);
  return (
    <>
      <GlassCard aria-labelledby="release-heading" className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="release-heading" className="text-section font-semibold">
            Release of information (Illinois)
          </h2>
          <p className="max-w-[65ch] text-[var(--fg-muted)]">
            The consent form Illinois requires before you share a client’s records (740 ILCS 110/5), also meeting HIPAA. Fill in who gets
            what, why and until when, and download it. The client’s name and birth date stay blank boxes you fill in yourself. Nothing is
            saved here. Or ask Aeon in the chat, for example “release form so I can talk with Dr. Lee about attendance, until June 30.”
          </p>
          {filled && <p className="text-small font-medium">Aeon filled in these boxes. Check them, then download.</p>}
        </div>
        <ReleaseFormBuilder initial={filled} today={today} />
      </GlassCard>

      <GlassCard aria-labelledby="release-blank-heading" className="flex flex-col gap-4 p-5 md:p-6">
        <h2 id="release-blank-heading" className="text-section font-semibold">
          Blank forms
        </h2>
        <div className="flex flex-wrap gap-3">
          <ButtonLink variant="quiet" href="/api/release-forms/pdf?kind=blank">
            Download blank release form
          </ButtonLink>
          <ButtonLink variant="quiet" href="/api/release-forms/pdf?kind=revocation">
            Download revocation form
          </ButtonLink>
        </div>
        <p className="max-w-[65ch] text-small text-[var(--fg-muted)]">
          Who signs: a client 12 or older signs for themselves; for a client under 12, a parent or guardian; for 12 to 17, both. The
          expiration date is required: without one, Illinois lets the form be used only on the day you receive it. Keep a copy in the
          client’s record. A revocation must be in writing and signed. This is paperwork help, not legal advice; have a colleague or attorney
          read it once before real clients sign.
        </p>
      </GlassCard>
    </>
  );
}

export async function Insurance() {
  await connection(); // read the database per request, never at build time
  const [apps, profile, today] = await Promise.all([listPayerApplications(), loadCredentialingProfile(), practiceToday()]);
  const entries = profile ? cms855iEntries(profile) : [];
  const spec = profile ? specialtyFor(profile.identity.credential) : null;
  const dates = payerDates(apps, today, 90);
  return (
    <>
      <GlassCard aria-labelledby="payers-heading" className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="payers-heading" className="text-section font-semibold">
            Insurance applications
          </h2>
          <p className="max-w-[65ch] text-[var(--fg-muted)]">
            Where you are with each payer. Aeon reminds you to follow up 30 days after you apply and to recredential 36 months after
            approval. You can also tell Aeon, like “I sent my BCBSIL application today”.
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

export async function Credentialing() {
  await connection(); // read the database per request, never at build time
  const today = await practiceToday();
  const facts = (await loadFacts()) ?? danaFacts(today);
  const rules = [...SHIPPED_RULES, ...(await loadSavedRules())];
  const p = (await loadCredentialingProfile()) ?? emptyCredentialingProfile();
  const prep = caqhPrep(p, facts, rules, today);
  const state = STATES[facts.practice_state] ?? facts.practice_state;

  return (
    <div className="flex flex-col gap-6">
      <GlassCard aria-labelledby="profile-heading" className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="profile-heading" className="text-section font-semibold">
            Credentialing profile
          </h2>
          <p className="text-[var(--fg-muted)]">
            {p.identity.name || "Your profile"}
            {p.identity.credential && `, ${p.identity.credential}`}
            {p.isSample && " (fictional demo practice)"}. In CAQH ProView’s order, so you can copy it section by section. Payer
            forms and Good Faith Estimates fill in from here. You can also tell Aeon what changed, like “my malpractice renewed
            through Dec 2027”.
          </p>
          {prep.licenseExpiresOn && (
            <p className="text-small text-[var(--fg-muted)]">
              License expires {formatDate(prep.licenseExpiresOn, false)} ({state} renewal rule, same as Deadlines).
            </p>
          )}
        </div>
        <CredentialingEditor values={sectionValues(p)} npiCheck={p.npiCheck} />
      </GlassCard>

      <GlassCard aria-labelledby="caqh-heading" className="flex h-fit flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="caqh-heading" className="text-section font-semibold">
            CAQH prep
          </h2>
          <p>
            {prep.attestBy ? (
              <>
                Re-attest by <strong>{formatDate(prep.attestBy)}</strong>
                {prep.cycleDays && <> ({state}: every {prep.cycleDays} days)</>}.
              </>
            ) : (
              "Aeon needs your last attestation date first."
            )}
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          {prep.items.map((i) => (
            <li key={i.id} className="flex gap-3 rounded-[16px] border border-[var(--hairline)] bg-[var(--glass-strong)] p-3">
              <span
                aria-hidden
                className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-small font-bold"
                style={
                  i.done
                    ? { color: "var(--status-done-fg)", background: "var(--status-done-bg)" }
                    : { color: "var(--status-pending-fg)", background: "var(--status-pending-bg)" }
                }
              >
                {i.done ? "✓" : "!"}
              </span>
              <div className="flex flex-col">
                <p className="font-medium">
                  <span className="sr-only">{i.done ? "Done: " : "To do: "}</span>
                  {i.label}
                  {i.you && !i.done && <span className="text-small text-[var(--fg-muted)]"> · You do this</span>}
                </p>
                {i.detail && <p className="text-small text-[var(--fg-muted)]">{i.detail}</p>}
                {i.id === "caqh_date" && (
                  <Link href="/admin/deadlines" className="text-small text-[var(--link)] underline underline-offset-2">
                    Add it on Deadlines
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-body font-semibold">{prep.finalStep}</p>
          <a href={CAQH_URL} target="_blank" rel="noreferrer" className="text-[var(--link)] underline underline-offset-2">
            Open CAQH ProView
          </a>
          <p className="text-small text-[var(--fg-muted)]">Aeon never attests or submits for you.</p>
        </div>
      </GlassCard>
    </div>
  );
}
