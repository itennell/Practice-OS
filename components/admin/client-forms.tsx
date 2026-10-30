import Link from "next/link";
import { connection } from "next/server";
import { CircleCheck, CircleAlert, ExternalLink, FileText, Scale, ShieldCheck } from "lucide-react";
import { ClientFormEditor, PolicyEditor } from "@/components/admin/client-form-editor";
import { ListCard, ListRow } from "@/components/shared/list-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink, GlassCard } from "@/components/ui";
import { POLICIES_MESSAGE, STATE_MESSAGE, formList, getForm, prepare, reviewItems } from "@/lib/client-forms";
import { isIllinois } from "@/lib/client-forms/facts";
import { loadAllOverrides, loadFacts } from "@/lib/client-forms/store";
import type { Overrides } from "@/lib/client-forms/render";
import { GROUP_LABEL, isFormId, type Block, type FormDef, type FormGroup, type PracticeFacts } from "@/lib/client-forms/types";

// Admin › Client forms: every form a therapy practice uses, as a template filled
// with her practice facts and blank boxes for the client. Preview, edit her
// wording, download or print. Templates only: a client's answers never come back
// here. GFE, superbill and release of information keep their own panels.
// A form downloads only when the check passes on what would print; otherwise the
// panel says why in plain words (lib/client-forms/index.ts › prepare).

const GROUPS: FormGroup[] = ["law", "ethics", "practice", "screener"];
const pdfHref = (id: string) => `/api/client-forms/${id}/pdf`;

/** The visible and spoken cue on every link that opens a new tab. */
function NewTab() {
  return (
    <>
      <ExternalLink aria-hidden size={12} className="ml-1 inline align-[-1px]" />
      <span className="sr-only"> (opens in a new tab)</span>
    </>
  );
}

export function TemplatesOnlyNote() {
  return (
    <p className="flex max-w-[65ch] items-start gap-2 text-small text-[var(--fg-muted)]">
      <ShieldCheck aria-hidden size={16} className="mt-0.5 shrink-0" />
      <span>
        Templates only. Aeon fills in your practice and leaves every client box blank. A client&rsquo;s filled-in form is never saved in
        Practice-OS: keep it in your own records. These are templates, not legal advice; have your own attorney review them once.
      </span>
    </p>
  );
}

export async function ClientForms({ form }: { form?: string }) {
  await connection(); // read the database per request, never at build time
  const loaded = await loadFacts();
  if (!loaded)
    return (
      <EmptyState
        icon={<FileText size={20} />}
        title="Add your practice details first"
        action={<ButtonLink href="/admin?panel=credentialing">Open credentialing</ButtonLink>}
      >
        Client forms use your practice name, address and phone from your credentialing profile.
      </EmptyState>
    );
  const def = isFormId(form) ? getForm(form) : undefined;
  const overrides = await loadAllOverrides();
  return def ? <OneForm def={def} facts={loaded.facts} overrides={overrides[def.id] ?? {}} /> : <Library facts={loaded.facts} overrides={overrides} />;
}

/** Why nothing downloads yet, said once at the top of the library. */
function LibraryNotice({ facts }: { facts: PracticeFacts }) {
  const lines = [!isIllinois(facts) && STATE_MESSAGE, !facts.policiesSaved && POLICIES_MESSAGE].filter(Boolean) as string[];
  if (!lines.length) return null;
  return (
    <div role="status" className="flex max-w-[65ch] items-start gap-2 rounded-[16px] border border-[var(--line)] bg-[var(--glass-strong)] p-4 text-small">
      <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0 text-[var(--accent-fg)]" />
      <div className="flex flex-col gap-1">
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
    </div>
  );
}

function Library({ facts, overrides }: { facts: PracticeFacts; overrides: Partial<Record<string, Overrides>> }) {
  const forms = formList();
  // One block: the side panel's scroll area is a flex column, and its overflow-hidden list cards would shrink to fit it.
  return (
    <div className="flex flex-col gap-6">
      <TemplatesOnlyNote />
      <LibraryNotice facts={facts} />
      {GROUPS.map((g) => {
        const inGroup = forms.filter((f) => f.group === g);
        if (!inGroup.length) return null;
        return (
          <ListCard key={g} id={`forms-${g}`} label={GROUP_LABEL[g]}>
            {inGroup.map((f) => {
              const ready = prepare(f, facts, overrides[f.id] ?? {}).blockers.length === 0;
              return (
                <ListRow
                  key={f.id}
                  icon={<FileText size={16} />}
                  title={
                    <Link href={`/admin?panel=forms&form=${f.id}`} className="font-medium underline-offset-4 hover:underline">
                      {f.title}
                    </Link>
                  }
                  detail={f.appliesTo}
                  end={
                    ready ? (
                      <ButtonLink variant="quiet" href={pdfHref(f.id)} className="px-4! text-small!" aria-label={`Download ${f.title} PDF`}>
                        PDF
                      </ButtonLink>
                    ) : (
                      <ButtonLink variant="quiet" href={`/admin?panel=forms&form=${f.id}`} className="px-4! text-small!" aria-label={`${f.title}: not ready to download, see why`}>
                        Not ready
                      </ButtonLink>
                    )
                  }
                />
              );
            })}
          </ListCard>
        );
      })}
      <ListCard id="forms-own" label="With their own panels">
        <ListRow icon={<FileText size={16} />} title={<Link href="/admin?panel=gfe">Good Faith Estimate</Link>} detail="No Surprises Act, self-pay clients" />
        <ListRow icon={<FileText size={16} />} title={<Link href="/admin?panel=superbill">Superbill</Link>} detail="For clients who file with their own insurance" />
        <ListRow icon={<FileText size={16} />} title={<Link href="/admin?panel=release">Release of information</Link>} detail="Illinois consent to release (740 ILCS 110/5)" />
      </ListCard>
      <GlassCard aria-labelledby="policies-heading" className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="policies-heading" className="text-section font-semibold">
            Your policies
          </h2>
          <p className="max-w-[65ch] text-small text-[var(--fg-muted)]">
            Every form uses these. Change them once here. Aeon assumes none of them: anything you leave unset prints as [fill in], and forms
            download after you save once.
          </p>
        </div>
        <PolicyEditor initial={facts.policies} />
      </GlassCard>
    </div>
  );
}

function OneForm({ def, facts, overrides }: { def: FormDef; facts: PracticeFacts; overrides: Overrides }) {
  const { check, blocks, blockers, wrongState } = prepare(def, facts, overrides);
  const review = reviewItems(def, facts);
  const editable = def.build(facts).flatMap((b) => (b.kind === "clause" && b.editable ? [{ id: b.id, label: b.label ?? clauseName(def, b.id), text: b.text }] : []));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin?panel=forms" className="inline-flex min-h-touch items-center self-start text-small text-[var(--accent-fg)] underline-offset-4 hover:underline">
          All client forms
        </Link>
        <h2 className="text-section font-semibold">{def.title}</h2>
        <p className="max-w-[65ch] text-[var(--fg-muted)]">{def.summary}</p>
        <p className="text-small">
          <span className="font-medium">Who needs it:</span> {def.appliesTo}
        </p>
        {def.note && <p className="text-small font-medium">{def.note}</p>}
      </div>
      {blockers.length ? (
        <section aria-labelledby="not-ready-heading" className="flex max-w-[65ch] flex-col gap-2 rounded-[16px] border border-[var(--line)] bg-[var(--glass-strong)] p-4 text-small">
          <h3 id="not-ready-heading" className="flex items-center gap-2 font-semibold">
            <CircleAlert aria-hidden size={16} className="text-[var(--accent-fg)]" />
            Not ready to download yet
          </h3>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={pdfHref(def.id)} download>
            Download PDF
          </ButtonLink>
          <ButtonLink variant="quiet" href={`${pdfHref(def.id)}?inline=1`} target="_blank" rel="noopener">
            Open to print
            <NewTab />
          </ButtonLink>
        </div>
      )}
      <TemplatesOnlyNote />

      {wrongState ? (
        // Illinois wording only for an Illinois practice: elsewhere the form isn't shown at all.
        <p className="max-w-[65ch] font-medium">{STATE_MESSAGE}</p>
      ) : (
        <>
          <ListCard
            id="form-check"
            label={check.ok ? `Checked: all ${def.elements.length} required parts are on the form` : `${check.missing.length} required ${check.missing.length === 1 ? "part is" : "parts are"} missing`}
          >
            {def.elements.map((e) => {
              const missing = check.missing.some((m) => m.id === e.id);
              return (
                <ListRow
                  key={e.id}
                  accent={missing}
                  icon={missing ? <CircleAlert size={16} /> : <CircleCheck size={16} />}
                  title={
                    <>
                      <span className={missing ? "text-[var(--danger-fg)]" : "text-[var(--status-done-fg)]"}>{missing ? "Missing: " : "On the form: "}</span>
                      {e.label}
                    </>
                  }
                  detail={
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                      {e.citation}
                      <NewTab />
                    </a>
                  }
                />
              );
            })}
            <li className="border-t border-[var(--line)] px-4 py-2.5 text-small text-[var(--fg-muted)]">
              Reading level: about grade {Math.max(1, Math.round(check.grade))}. Attorney-review line: {check.disclaimer ? "on the form" : "missing"}.
            </li>
          </ListCard>

          {review.length > 0 && (
            <ListCard id="form-review" label="Needs your attorney's review">
              {review.map((r) => (
                <ListRow key={r} icon={<Scale size={16} />} title={<span className="font-normal">{r}</span>} />
              ))}
              <li className="border-t border-[var(--line)] px-4 py-2.5 text-small text-[var(--fg-muted)]">
                The research could not settle these. They are not settled law; ask your attorney before you rely on them.
              </li>
            </ListCard>
          )}

          <GlassCard aria-labelledby="preview-heading" className="flex flex-col gap-3 p-5 md:p-6">
            <h2 id="preview-heading" className="text-section font-semibold">
              Preview
            </h2>
            <div className="flex flex-col gap-2 rounded-[16px] border border-[var(--line)] bg-[var(--glass-strong)] p-4 text-small">
              <p className="text-body font-semibold">
                {facts.practiceName}
                {facts.isSample ? " (fictional demo practice)" : ""}
              </p>
              {blocks.map((b, i) => (
                <PreviewBlock key={i} b={b} />
              ))}
            </div>
          </GlassCard>

          <GlassCard aria-labelledby="edit-heading" className="flex flex-col gap-4 p-5 md:p-6">
            <div className="flex flex-col gap-1">
              <h2 id="edit-heading" className="text-section font-semibold">
                Edit your wording
              </h2>
              <p className="max-w-[65ch] text-small text-[var(--fg-muted)]">
                Change the parts that are yours to word, or add a paragraph. Aeon checks every edit still says what the form must say, and
                refuses what looks like a client name or detail. The rest is fixed wording.
              </p>
            </div>
            <ClientFormEditor form={def.id} clauses={editable} saved={overrides} />
          </GlassCard>
        </>
      )}
    </div>
  );
}

/** The clause's name for the editor: its own label, else the required element it carries. */
function clauseName(def: FormDef, id: string): string {
  return def.elements.find((e) => e.id === id)?.label ?? id.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function PreviewBlock({ b }: { b: Block }) {
  switch (b.kind) {
    case "heading":
      return <h3 className="mt-2 font-semibold text-[var(--accent-fg)]">{b.text}</h3>;
    case "clause":
      return (
        <p className={b.small ? "text-[var(--fg-muted)]" : undefined}>
          {b.text}
          {b.review && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 text-[0.75rem] font-medium text-[var(--accent-fg)]">
              <Scale aria-hidden size={12} />
              Needs your attorney&rsquo;s review
            </span>
          )}
        </p>
      );
    case "practice":
      return (
        <p>
          <span className="font-medium">{b.label}:</span> {b.value}
        </p>
      );
    case "field":
      return (
        <p className="flex items-end gap-2">
          <span className="font-medium">{b.label}</span>
          <span aria-hidden className="h-5 flex-1 border-b border-[var(--line)]" />
        </p>
      );
    case "check":
      return (
        <p className="flex gap-2">
          <span aria-hidden>☐</span>
          {b.label}
        </p>
      );
    case "scale":
      return (
        <p>
          {b.item} <span className="text-[var(--fg-muted)]">({b.options.join(" · ")})</span>
        </p>
      );
    case "signature":
      return <p className="mt-3 border-t border-[var(--fg-muted)] pt-1 text-[var(--fg-muted)]">{b.caption}</p>;
  }
}
