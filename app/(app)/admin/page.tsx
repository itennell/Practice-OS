import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { CheckCheck, ChevronRight } from "lucide-react";
import { Insurance } from "@/components/admin/insurance-panel";
import { Credentialing, GoodFaithEstimates, ReleaseForms, Superbills } from "@/components/admin/panels";
import { ClientForms } from "@/components/admin/client-forms";
import { SidePanel } from "@/components/admin/side-panel";
import { EmptyState } from "@/components/shared/empty-state";
import { OfficeSettings } from "@/components/office-settings";
import { ButtonLink, GlassCard, Orb, PageHeader } from "@/components/ui";
import { loadNeeds } from "@/lib/admin/load";
import { MAX_NEEDS, type AdminPanel, type NeedAction, type NeedItem } from "@/lib/admin/needs-next";
import { deadlinesView } from "@/lib/compliance/view";
import { loadCredentialingProfile } from "@/lib/credentialing/store";
import { listEstimates, loadPracticeSettings } from "@/lib/gfe/store";
import { allGuides } from "@/lib/guides";
import { WAITING, listPayerApplications } from "@/lib/payers/store";
import { listSuperbills } from "@/lib/superbill/store";

export const metadata: Metadata = { title: "Admin · Practice-OS" };

// One Admin place where Aeon leads (redesign PR 3). The top is Aeon's ranked list of what
// the practice needs next (lib/admin/needs-next.ts, plain code); under it, everything else
// as six cards. Forms open in a side panel (?panel=...), filled with what Aeon knows.

const PANELS: Record<AdminPanel, { title: string; description: string }> = {
  forms: { title: "Client forms", description: "Every form your practice uses, filled with your practice. Client boxes stay blank." },
  gfe: { title: "Good Faith Estimates", description: "For self-pay clients. Aeon fills in your fees and today's date." },
  superbill: { title: "Superbills", description: "Aeon fills in your practice, codes and fees. Client details stay blank." },
  release: { title: "Release of information", description: "The Illinois consent form. Nothing is saved here." },
  credentialing: { title: "Credentialing", description: "Your profile in CAQH ProView's order, and what to fix before you re-attest." },
  insurance: { title: "Insurance", description: "Where you are with each payer, and the Medicare form Aeon prepares." },
  hours: { title: "Office hours and fees", description: "Estimates and superbills count your open days and use these fees." },
};

const isPanel = (v: unknown): v is AdminPanel => typeof v === "string" && v in PANELS;

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <>
      <PageHeader
        title="Admin"
        description="Aeon keeps the business side moving. Here’s what needs you, in order. Aeon prepares; you send, sign and attest."
      />
      <Suspense fallback={<div aria-hidden className="h-72 animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <NeedsNext />
      </Suspense>
      <Suspense fallback={<div aria-hidden className="h-64 animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <Cards />
      </Suspense>
      <Suspense>
        <Panel searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function actionHref(a: NeedAction): string {
  if ("panel" in a) return `/admin?panel=${a.panel}`;
  if ("ask" in a) return `/?ask=${encodeURIComponent(a.ask)}`;
  return a.href;
}

function NeedRow({ item }: { item: NeedItem }) {
  return (
    <li aria-label={item.title} className="flex flex-col gap-3 border-t border-[var(--hairline)] py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-semibold">{item.title}</p>
        <p className="text-small text-[var(--fg-muted)]">{item.why}</p>
      </div>
      <ButtonLink variant="quiet" href={actionHref(item.action)} className="shrink-0 self-start sm:self-auto">
        {item.action.label}
        <span className="sr-only">: {item.title}</span>
      </ButtonLink>
    </li>
  );
}

async function NeedsNext() {
  await connection(); // read the database per request, never at build time
  const needs = await loadNeeds();
  const first = needs.slice(0, MAX_NEEDS);
  const rest = needs.slice(MAX_NEEDS);
  return (
    <GlassCard aria-labelledby="needs-heading" className="flex flex-col gap-2 p-5 md:p-6">
      <div className="flex items-center gap-3">
        <Orb size={28} />
        <h2 id="needs-heading" className="text-section font-semibold">
          What your practice needs next
        </h2>
      </div>
      {needs.length === 0 ? (
        <EmptyState icon={<CheckCheck size={18} strokeWidth={1.75} />} title="Nothing needs you right now">
          Aeon is keeping watch and will put anything new here.
        </EmptyState>
      ) : (
        <>
          <ol className="flex flex-col">
            {first.map((n) => (
              <NeedRow key={n.id} item={n} />
            ))}
          </ol>
          {rest.length > 0 && (
            <details className="group">
              <summary className="flex min-h-touch cursor-pointer items-center font-medium text-[var(--link)]">
                {rest.length} more, when you have time
              </summary>
              <ol className="flex flex-col">
                {rest.map((n) => (
                  <NeedRow key={n.id} item={n} />
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </GlassCard>
  );
}

function Card({ title, summary, href, children }: { title: string; summary: string; href?: string; children?: ReactNode }) {
  return (
    <li className="tile relative flex flex-col gap-1 p-5 hover:shadow-[var(--tile-shadow-hover)]">
      <h3 className="font-semibold">
        {href ? (
          <Link href={href} scroll={false} className="flex items-center justify-between gap-2 after:absolute after:inset-0 after:rounded-[var(--radius-card-sm)] after:content-['']">
            {title}
            <ChevronRight aria-hidden size={18} className="text-[var(--fg-muted)]" />
          </Link>
        ) : (
          title
        )}
      </h3>
      <p className="text-small text-[var(--fg-muted)]">{summary}</p>
      {children}
    </li>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function Cards() {
  await connection(); // read the database per request, never at build time
  const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const [view, estimates, bills, profile, apps, settings] = await Promise.all([
    safe(deadlinesView(30), null),
    safe(listEstimates(), []),
    safe(listSuperbills(), []),
    safe(loadCredentialingProfile(), null),
    safe(listPayerApplications(), []),
    safe(loadPracticeSettings(), null),
  ]);
  const notGiven = bills.filter((b) => !b.issued_on).length;
  const waitingGfe = estimates.filter((e) => !e.issued_on && e.approval_status === "pending").length;
  const missing = profile ? [!profile.npi.number && "NPI", !profile.tin && "tax ID"].filter(Boolean) : [];
  const pending = apps.filter((a) => WAITING.includes(a.status)).length;
  const started = apps.filter((a) => a.status !== "not_started").length;
  const days = settings?.hours.weekdays.map((d) => WEEKDAY[d]).join(", ");

  return (
    <section aria-labelledby="everything-heading" className="flex flex-col gap-3">
      <h2 id="everything-heading" className="text-section font-semibold">
        Everything, when you want it
      </h2>
      <ul className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Deadlines" href="/admin/deadlines" summary={view ? `${plural(view.due.length, "deadline")} in the next 30 days` : "Your compliance calendar"} />
        <Card title="Client forms" summary={`Estimates, superbills, release forms · ${plural(waitingGfe, "estimate")} waiting, ${plural(notGiven, "superbill")} not given`}>
          <div className="relative mt-2 flex flex-wrap gap-2">
            <ButtonLink variant="quiet" href="/admin?panel=forms" className="px-4! text-small!">
              All client forms
            </ButtonLink>
            <ButtonLink variant="quiet" href="/admin?panel=gfe" className="px-4! text-small!">
              Good Faith Estimate
            </ButtonLink>
            <ButtonLink variant="quiet" href="/admin?panel=superbill" className="px-4! text-small!">
              Superbill
            </ButtonLink>
            <ButtonLink variant="quiet" href="/admin?panel=release" className="px-4! text-small!">
              Release form
            </ButtonLink>
          </div>
        </Card>
        <Card
          title="Credentialing"
          href="/admin?panel=credentialing"
          summary={!profile ? "Set up your profile" : missing.length ? `Missing your ${missing.join(" and ")}` : "NPI and tax ID on file · CAQH prep"}
        />
        <Card title="Insurance" href="/admin?panel=insurance" summary={started ? `${plural(started, "application")} · ${pending} waiting to hear back` : "Every insurer you can join, step by step"} />
        <Card title="How do I" href="/admin/how-do-i" summary={`${plural(allGuides().length, "step-by-step guide")}`} />
        <Card
          title="Office hours and fees"
          href="/admin?panel=hours"
          summary={settings ? `Open ${days} · ${plural(settings.fees.length, "fee")}` : "Your open days and fee list"}
        />
      </ul>
    </section>
  );
}

async function Panel({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const params = await searchParams;
  if (!isPanel(params.panel)) return null;
  const which = params.panel;
  const draft = typeof params.draft === "string" ? params.draft : undefined;
  // A document card in the chat opens the panel on one item (lib/documents).
  const focus = typeof params.focus === "string" && /^[0-9a-f-]{36}$/i.test(params.focus) ? params.focus : undefined;
  return (
    <SidePanel key={which} title={PANELS[which].title} description={PANELS[which].description}>
      <Suspense fallback={<div aria-hidden className="h-96 animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        {which === "forms" ? (
          <ClientForms form={typeof params.form === "string" ? params.form : undefined} />
        ) : which === "gfe" ? (
          <GoodFaithEstimates focus={focus} />
        ) : which === "superbill" ? (
          <Superbills focus={focus} />
        ) : which === "release" ? (
          <ReleaseForms draft={draft} />
        ) : which === "credentialing" ? (
          <Credentialing />
        ) : which === "insurance" ? (
          <Insurance />
        ) : (
          <Hours />
        )}
      </Suspense>
    </SidePanel>
  );
}

async function Hours() {
  await connection(); // read the database per request, never at build time
  const { hours, fees } = await loadPracticeSettings();
  return <OfficeSettings initialHours={hours} initialFees={fees} />;
}
