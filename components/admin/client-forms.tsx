import Link from "next/link";
import { connection } from "next/server";
import { CircleCheck, CircleAlert, FileText, ShieldCheck } from "lucide-react";
import { ClientFormEditor, PolicyEditor } from "@/components/admin/client-form-editor";
import { ListCard, ListRow } from "@/components/shared/list-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink, GlassCard } from "@/components/ui";
import { formList, getForm, prepare } from "@/lib/client-forms";
import { blocksFor } from "@/lib/client-forms/render";
import { loadFacts, loadOverrides } from "@/lib/client-forms/store";
import { GROUP_LABEL, isFormId, type Block, type FormDef, type FormGroup, type PracticeFacts } from "@/lib/client-forms/types";

// Admin › Client forms: every form a therapy practice uses, as a template filled
// with her practice facts and blank boxes for the client. Preview, edit her
// wording, download or print. Templates only: a client's answers never come back
// here. GFE, superbill and release of information keep their own panels.

const GROUPS: FormGroup[] = ["law", "ethics", "practice", "screener"];
const pdfHref = (id: string) => `/api/client-forms/${id}/pdf`;

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
  return def ? <OneForm def={def} facts={loaded.facts} /> : <Library facts={loaded.facts} />;
}

function Library({ facts }: { facts: PracticeFacts }) {
  const forms = formList();
  // One block: the side panel's scroll area is a flex column, and its overflow-hidden list cards would shrink to fit it.
  return (
    <div className="flex flex-col gap-6">
      <TemplatesOnlyNote />
      {GROUPS.map((g) => {
        const inGroup = forms.filter((f) => f.group === g);
        if (!inGroup.length) return null;
        return (
          <ListCard key={g} id={`forms-${g}`} label={GROUP_LABEL[g]}>
            {inGroup.map((f) => (
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
                  <ButtonLink variant="quiet" href={pdfHref(f.id)} className="h-10! px-4! text-small!" aria-label={`Download ${f.title} PDF`}>
                    PDF
                  </ButtonLink>
                }
              />
            ))}
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
          <p className="max-w-[65ch] text-small text-[var(--fg-muted)]">Every form uses these. Change them once here.</p>
        </div>
        <PolicyEditor initial={facts.policies} />
      </GlassCard>
    </div>
  );
}

async function OneForm({ def, facts }: { def: FormDef; facts: PracticeFacts }) {
  const overrides = await loadOverrides(def.id);
  const { check } = prepare(def, facts, overrides);
  const blocks = blocksFor(def, facts, overrides);
  const editable = def.build(facts).flatMap((b) => (b.kind === "clause" && b.editable ? [{ id: b.id, text: b.text }] : []));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin?panel=forms" className="text-small text-[var(--accent-fg)] underline-offset-4 hover:underline">
          All client forms
        </Link>
        <h2 className="text-section font-semibold">{def.title}</h2>
        <p className="max-w-[65ch] text-[var(--fg-muted)]">{def.summary}</p>
        <p className="text-small">
          <span className="font-medium">Who needs it:</span> {def.appliesTo}
        </p>
        {def.note && <p className="text-small font-medium">{def.note}</p>}
      </div>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href={pdfHref(def.id)} download>
          Download PDF
        </ButtonLink>
        <ButtonLink variant="quiet" href={`${pdfHref(def.id)}?inline=1`} target="_blank" rel="noopener">
          Open to print
        </ButtonLink>
      </div>
      <TemplatesOnlyNote />

      <ListCard id="form-check" label={check.ok ? `Checked: all ${def.elements.length} required parts are on the form` : "Something the form must say is missing"}>
        {def.elements.map((e) => {
          const missing = check.missing.some((m) => m.id === e.id);
          return (
            <ListRow
              key={e.id}
              accent={missing}
              icon={missing ? <CircleAlert size={16} /> : <CircleCheck size={16} />}
              title={e.label}
              detail={
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                  {e.citation}
                </a>
              }
            />
          );
        })}
        <li className="border-t border-[var(--line)] px-4 py-2.5 text-small text-[var(--fg-muted)]">
          Reading level: about grade {Math.max(1, Math.round(check.grade))}. Attorney-review line: {check.disclaimer ? "on the form" : "missing"}.
        </li>
      </ListCard>

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
            refuses client names or details.
          </p>
        </div>
        <ClientFormEditor form={def.id} clauses={editable} saved={overrides} />
      </GlassCard>
    </div>
  );
}

function PreviewBlock({ b }: { b: Block }) {
  switch (b.kind) {
    case "heading":
      return <h3 className="mt-2 font-semibold text-[var(--accent-fg)]">{b.text}</h3>;
    case "clause":
      return <p className={b.small ? "text-[var(--fg-muted)]" : undefined}>{b.text}</p>;
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
