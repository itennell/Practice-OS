"use client";

// A read-only preview of how her Psychology Today profile will read, section by
// section in the same order and card structure as a PT public profile. Built only
// from our own components and tokens: no PT logo, colours, CSS or images. Nothing
// here is clickable except the Copy buttons; Email, Website and Share are plain labels.
// No "Verified" badge is shown: Aeon can't vouch for one (PT may add its own).

import { useId, type ReactNode } from "react";
import { ImagePlus, Quote } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import { Chip } from "@/components/ui";
import { CopyButton } from "@/components/media/copy-button";
import type { Box, ProfileView } from "@/lib/media/pt-profile";
import { MAKE_IT_YOURS, SECTION_TITLE, type SectionId } from "@/lib/media/pt-sections";

const CARD = "flex flex-col gap-3 rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)] p-5";
const MUTED = "text-small text-[var(--fg-muted)]";

function Missing() {
  return <span className={MUTED}>Not answered yet</span>;
}

function Section({ id, view, children, className = "" }: { id: SectionId; view: ProfileView; children: ReactNode; className?: string }) {
  const headingId = `${useId()}-${id}`;
  const title = SECTION_TITLE[id];
  const copy = view.sections.find((s) => s.id === id)?.copy ?? "";
  return (
    <section aria-labelledby={headingId} data-section={id} className={`${CARD} ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-section font-semibold">
          {title}
        </h3>
        <CopyButton text={copy} what={title} />
      </div>
      {children}
    </section>
  );
}

/** One labelled row; an empty value shows "Not answered yet" so she sees what's missing. */
function Row({ label, children, empty }: { label: string; children?: ReactNode; empty?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-[var(--line)] pt-3 first:border-t-0 first:pt-0">
      <span className="text-label font-medium text-[var(--fg-muted)]">{label}</span>
      <div className="text-body">{empty ? <Missing /> : children}</div>
    </div>
  );
}

const list = (xs: string[]) => xs.join(", ");

function andList(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

function BoxMeta({ box }: { box: Box }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-label font-medium text-[var(--fg-muted)]">{box.label}</span>
        <span className={MUTED}>
          {box.text.length} of {box.limit}
        </span>
      </div>
      {box.from !== "her" && <p className="text-small font-medium text-[var(--accent-fg)]">{MAKE_IT_YOURS}</p>}
    </div>
  );
}

function Findings({ box }: { box: Box }) {
  if (!box.findings.length) return null;
  return (
    <ul className="flex flex-col gap-1">
      {box.findings.map((f) => (
        <li key={f} className="text-small text-[var(--status-pending-fg)]">
          {f}
        </li>
      ))}
    </ul>
  );
}

/** A note box (the paragraph PT shows under a section) as a soft tinted panel. */
function NoteCard({ box }: { box: Box }) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card-sm)] bg-[var(--status-rejected-bg)] p-4">
      <BoxMeta box={box} />
      <div className="flex gap-3">
        <Quote size={16} aria-hidden className="mt-1 shrink-0 text-[var(--fg-muted)]" />
        {box.text ? <p className="text-body whitespace-pre-line">{box.text}</p> : <Missing />}
      </div>
      <Findings box={box} />
      <CopyButton text={box.text} what={box.label} />
    </div>
  );
}

function StatementBox({ box, snippetChars, first }: { box: Box; snippetChars: number; first: boolean }) {
  const shown = first ? box.text.slice(0, snippetChars) : "";
  const rest = first ? box.text.slice(snippetChars) : box.text;
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-3 first:border-t-0 first:pt-0">
      <BoxMeta box={box} />
      {box.text ? (
        <p className="text-body whitespace-pre-line">
          {shown && <strong className="font-semibold">{shown}</strong>}
          {rest}
        </p>
      ) : (
        <Missing />
      )}
      {first && box.text && <p className={MUTED}>In bold: the first {snippetChars} characters, Aeon&rsquo;s estimate of what a search results card shows (unverified).</p>}
      <Findings box={box} />
      <CopyButton text={box.text} what={box.label} />
    </div>
  );
}

/** Looks like a link on the real profile, but here it is only a label. */
function DeadLabel({ children }: { children: ReactNode }) {
  return (
    <span aria-disabled="true" className="inline-flex h-chip items-center rounded-full border border-[var(--line)] px-4 text-small text-[var(--fg-muted)]">
      {children}
    </span>
  );
}

export function PtPreview({ view }: { view: ProfileView }) {
  const titleId = useId();
  const { header, statement, consult, glance, finances, qualifications, specialties, clientFocus, treatment, location } = view;

  return (
    <section aria-labelledby={titleId} className="@container flex flex-col gap-4" data-testid="pt-preview">
      <div className="flex flex-col gap-0.5">
        <h2 id={titleId} className="text-body font-semibold">
          Preview of how your profile will read
        </h2>
        <p className={MUTED}>Not affiliated with Psychology Today.</p>
        {view.sample && <p className={MUTED}>[Sample] Fictional demo practice</p>}
      </div>

      {/* 1. Header */}
      <Section id="header" view={view}>
        <div className="flex gap-4">
          <Avatar name={header.name} size="lg" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-section font-semibold">
              {header.name || <Missing />}
              {header.credential && `, ${header.credential}`}
            </p>
            <p className="text-body">{header.title || <Missing />}</p>
            <p className={MUTED}>{header.place || "Not answered yet"}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {header.formats.length ? header.formats.map((f) => <Chip key={f}>{f === "In Person" ? "In person" : f}</Chip>) : <Missing />}
            </div>
          </div>
        </div>
        <p className={MUTED}>Psychology Today may show a verified badge after it checks your license (not confirmed).</p>
      </Section>

      {/* 2 + 5. Statement with At a Glance beside it on wide containers */}
      <div className="grid gap-4 @min-[40rem]:grid-cols-[minmax(0,1fr)_17rem] @min-[40rem]:items-start">
        <Section id="statement" view={view}>
          <Quote size={32} aria-hidden className="text-[var(--accent-fg)]" />
          {statement.boxes.map((b, i) => (
            <StatementBox key={b.id} box={b} snippetChars={statement.snippetChars} first={i === 0} />
          ))}
        </Section>

        <Section id="glance" view={view}>
          <Row label="Availability" empty={!glance.availability}>
            {glance.availability}
          </Row>
          <Row label="Practice" empty={!glance.practiceName}>
            {glance.practiceName}
          </Row>
          <Row label="Locations" empty={!glance.locations.length}>
            <ul className="flex flex-col gap-0.5">
              {glance.locations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Row>
          <Row label="Sessions" empty={!glance.formatLine}>
            {glance.formatLine}
          </Row>
          <Row label="Specialties" empty={!glance.topSpecialties.length}>
            I specialize in {andList(glance.topSpecialties)}
          </Row>
          <Row label="Fees" empty={!glance.feeLine}>
            {glance.feeLine}
          </Row>
          <Row label="I see" empty={!glance.participants.length}>
            {list(glance.participants)}
          </Row>
          <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
            <DeadLabel>Email</DeadLabel>
            <DeadLabel>Website</DeadLabel>
            <DeadLabel>Share</DeadLabel>
          </div>
        </Section>
      </div>

      {/* 3. Photos */}
      <Section id="photos" view={view}>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] border border-dashed border-[var(--line-strong)] p-2 text-center"
            >
              <ImagePlus size={16} aria-hidden className="text-[var(--fg-muted)]" />
              {i === 0 && <span className="text-label text-[var(--fg-muted)]">Add your photos in Psychology Today</span>}
            </div>
          ))}
        </div>
      </Section>

      {/* 4. Free consultation */}
      <Section id="consult" view={view}>
        {consult.minutes > 0 && (
          <p className="rounded-[var(--radius-control)] bg-[var(--status-running-bg)] px-4 py-3 text-body font-semibold text-[var(--status-running-fg)]">
            Free {consult.minutes}-minute consultation
          </p>
        )}
        <NoteCard box={consult.intro} />
      </Section>

      {/* 6. Finances */}
      <Section id="finances" view={view}>
        <Row label="Fees" empty={!finances.fees.length}>
          <ul className="flex flex-col gap-0.5">
            {finances.fees.map((f) => (
              <li key={f.label}>
                {f.label}: {f.amount}
              </li>
            ))}
          </ul>
        </Row>
        <Row label="Sliding scale" empty={finances.slidingScale === null}>
          {finances.slidingScale ? "Yes" : "No"}
        </Row>
        <Row label="Payment methods" empty={!finances.paymentMethods.length}>
          {list(finances.paymentMethods)}
        </Row>
        <Row label="Insurance">{finances.outOfNetwork ? "Out of Network" : list(finances.insurance)}</Row>
        <NoteCard box={finances.note} />
      </Section>

      {/* 7. Qualifications */}
      <Section id="qualifications" view={view}>
        <Row label="License" empty={!qualifications.licenseLine}>
          {qualifications.licenseLine}
        </Row>
        <Row label="Years in practice" empty={qualifications.years === null}>
          {qualifications.years}
        </Row>
        <Row label="Education" empty={!qualifications.education}>
          {qualifications.education}
        </Row>
        <Row label="Additional credentials" empty={!qualifications.extraCredentials}>
          {qualifications.extraCredentials}
        </Row>
        <NoteCard box={qualifications.note} />
      </Section>

      {/* 8. Specialties and Expertise */}
      <Section id="specialties" view={view}>
        <Row label="Top specialties" empty={!specialties.top.length}>
          <ul className="flex flex-col gap-0.5 font-semibold">
            {specialties.top.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Row>
        <Row label="Expertise" empty={!specialties.expertise.length}>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {specialties.expertise.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Row>
        {view.ownLabels.length > 0 && <p className={MUTED}>Not one of Psychology Today&apos;s boxes, type under Other: {list(view.ownLabels)}</p>}
        <NoteCard box={specialties.note} />
      </Section>

      {/* 9. Endorsements */}
      <Section id="endorsements" view={view}>
        <p className={MUTED}>
          Endorsements come from other Psychology Today members. Ask a colleague who knows your work to endorse you from your profile. Aeon never writes one.
        </p>
      </Section>

      {/* 10. Client Focus */}
      <Section id="clientFocus" view={view}>
        <Row label="Age" empty={!clientFocus.ages.length}>
          {list(clientFocus.ages)}
        </Row>
        <Row label="Participants" empty={!clientFocus.participants.length}>
          {list(clientFocus.participants)}
        </Row>
        <Row label="Communities" empty={!clientFocus.communities.length}>
          {list(clientFocus.communities)}
        </Row>
        <Row label="Faith" empty={!clientFocus.faith.length}>
          {list(clientFocus.faith)}
        </Row>
        <Row label="I also speak" empty={!clientFocus.languages}>
          {clientFocus.languages}
        </Row>
      </Section>

      {/* 11. Treatment Approach */}
      <Section id="treatment" view={view}>
        <Row label="Types of therapy" empty={!treatment.types.length}>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {treatment.types.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Row>
        <NoteCard box={treatment.note} />
      </Section>

      {/* 12. Location */}
      <Section id="location" view={view}>
        <Row label="Primary location" empty={!location.primary}>
          {location.primary}
        </Row>
        <Row label="Online" empty={!location.online}>
          {location.online}
        </Row>
        <Row label="Nearby areas" empty={!location.nearby}>
          {location.nearby}
        </Row>
      </Section>
    </section>
  );
}
