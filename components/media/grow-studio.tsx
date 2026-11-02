"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Globe, Megaphone, Search, TrendingUp } from "lucide-react";
import { ListCard, ListRow } from "@/components/shared/list-card";
import { TextField } from "@/components/shared/settings-controls";
import { StatusPill } from "@/components/shared/status-mark";
import { notify } from "@/components/shared/toaster";
import { Button, ButtonLink } from "@/components/ui";
import { GOOGLE_BUDGET_NOTE, type GoogleAdsDraft, type GrowthSettings, type MetaAdsDraft } from "@/lib/growth/ads";
import type { PlanInput, PrivatePayPlan } from "@/lib/growth/plan";
import type { PolicyCheck } from "@/lib/growth/policy";
import type { SiteDraft } from "@/lib/growth/site";

// Media > Grow. Top: the private-pay plan. Then the ad drafts (Google, Meta) and the
// website, each with its policy check, a button to queue it for approval, and the
// downloads, which stay locked until she approves it in Approvals.

export type SavedView = { id: string; ready: boolean; waiting: boolean; declined: boolean; hasImage: boolean };
type Kind = "google_ads" | "meta_ads" | "website";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

async function post(body: unknown) {
  const res = await fetch("/api/growth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "That didn't work. Try again.");
  return data;
}

function Card({ id, title, icon, status, children }: { id: string; title: string; icon: React.ReactNode; status?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="flex size-8 items-center justify-center rounded-[10px] border border-[var(--line)] text-[var(--fg-muted)]">
          {icon}
        </span>
        <h2 id={id} className="text-section min-w-[12rem] flex-1">
          {title}
        </h2>
        {status}
      </div>
      {children}
    </section>
  );
}

function PolicyLine({ check }: { check: PolicyCheck }) {
  const blocks = check.findings.filter((f) => f.severity === "block");
  const warns = check.findings.filter((f) => f.severity === "warn");
  return (
    <div className="flex flex-col gap-1">
      <StatusPill status={check.ok ? "done" : "failed"}>{check.ok ? "Policy check passed" : `Policy check: ${blocks.length} to fix`}</StatusPill>
      {[...blocks, ...warns].map((f, i) => (
        <p key={i} className="text-small text-[var(--fg-muted)]">
          {f.severity === "block" ? "Fix" : "Note"}: {f.where}: {f.message}
        </p>
      ))}
    </div>
  );
}

function ApprovalState({ saved }: { saved: SavedView | null }) {
  if (!saved) return <StatusPill status="pending">Not queued yet</StatusPill>;
  if (saved.ready) return <StatusPill status="done">Approved, ready to download</StatusPill>;
  if (saved.declined) return <StatusPill status="declined">Declined</StatusPill>;
  return <StatusPill status="running">Waiting for your approval</StatusPill>;
}

/** Queue / approvals link / downloads. Downloads stay off until she approves the draft. */
function Actions({ kind, saved, ok, canWrite, exports, sample }: { kind: Kind; saved: SavedView | null; ok: boolean; canWrite: boolean; exports: { as: string; label: string }[]; sample: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const queue = async () => {
    setBusy(true);
    try {
      await post({ action: "draft", kind });
      notify.success("Queued for your approval", { description: "Approve it in Approvals, then download it here." });
      router.refresh();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const canQueue = canWrite && ok && (!saved || saved.declined || saved.ready);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(!saved || saved.declined || saved.ready) && (
          <Button type="button" variant="primary" disabled={!canQueue || busy} onClick={queue}>
            {saved?.ready ? "Draft a new version" : "Queue for approval"}
          </Button>
        )}
        {saved?.waiting && (
          <ButtonLink href="/approvals" variant="accent">
            Review in Approvals
          </ButtonLink>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {exports.map((x) =>
          saved?.ready ? (
            <ButtonLink key={x.as} href={`/api/growth/drafts/${saved.id}/export?as=${x.as}`} variant="quiet" download>
              <Download aria-hidden className="size-4" />
              {x.label}
            </ButtonLink>
          ) : (
            <Button key={x.as} type="button" variant="quiet" disabled aria-describedby={`${kind}-locked`}>
              <Download aria-hidden className="size-4" />
              {x.label}
            </Button>
          ),
        )}
      </div>
      {!saved?.ready && (
        <p id={`${kind}-locked`} className="text-small text-[var(--fg-muted)]">
          Downloads unlock after you approve this draft.{sample ? " [Sample] fictional demo practice." : ""}
        </p>
      )}
    </div>
  );
}

function num(v: string): number | null {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return v.trim() && Number.isFinite(n) ? n : null;
}

function PlanEditor({ input, canWrite, onDone }: { input: PlanInput; canWrite: boolean; onDone: () => void }) {
  const router = useRouter();
  // [Sample] numbers are never put in her boxes: those start empty with the sample as a hint, and
  // a sample panel or number she leaves alone stays [Sample] when she saves.
  const sampleFields = new Set(input.sample_fields ?? []);
  const own = (v: string, isSample: boolean) => (isSample ? "" : v);
  const [panels, setPanels] = useState(
    input.panels.map((p) => ({
      ...p,
      sessions: own(p.weekly_sessions?.toString() ?? "", Boolean(p.sample)),
      rate: own(p.rate_cents === null ? "" : (p.rate_cents / 100).toString(), Boolean(p.sample)),
    })),
  );
  const [weekly, setWeekly] = useState(own(input.target_weekly_sessions?.toString() ?? "", sampleFields.has("target_weekly_sessions")));
  const [income, setIncome] = useState(own(input.target_monthly_income_cents === null ? "" : (input.target_monthly_income_cents / 100).toString(), sampleFields.has("target_monthly_income_cents")));
  const [current, setCurrent] = useState(own((input.current_private_weekly ?? 0).toString(), sampleFields.has("current_private_weekly")));
  const hint = (isSample: boolean, v: number | null | undefined) => (isSample && v !== null && v !== undefined ? `[Sample] ${v}` : undefined);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await post({
        action: "plan",
        plan: {
          panels: panels.map(({ sessions, rate, ...p }) =>
            p.sample && !sessions.trim() && !rate.trim()
              ? p // untouched [Sample] panel: stays labelled
              : { ...p, sample: false, weekly_sessions: num(sessions), rate_cents: num(rate) === null ? null : Math.round(num(rate)! * 100) },
          ),
          current_private_weekly: sampleFields.has("current_private_weekly") && !current.trim() ? input.current_private_weekly : (num(current) ?? 0),
          target_weekly_sessions: sampleFields.has("target_weekly_sessions") && !weekly.trim() ? input.target_weekly_sessions : num(weekly),
          target_monthly_income_cents:
            sampleFields.has("target_monthly_income_cents") && !income.trim() ? input.target_monthly_income_cents : num(income) === null ? null : Math.round(num(income)! * 100),
          sample_fields: [
            ...(sampleFields.has("current_private_weekly") && !current.trim() ? ["current_private_weekly"] : []),
            ...(sampleFields.has("target_weekly_sessions") && !weekly.trim() ? ["target_weekly_sessions"] : []),
            ...(sampleFields.has("target_monthly_income_cents") && !income.trim() ? ["target_monthly_income_cents"] : []),
          ],
          ...(input.private_fee_cents !== undefined ? { private_fee_cents: input.private_fee_cents } : {}),
        },
      });
      notify.success("Saved your numbers");
      onDone();
      router.refresh();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4">
      <p className="text-small text-[var(--fg-muted)]">Leave a box empty if you don&rsquo;t know it; Aeon asks instead of guessing.</p>
      {panels.map((p, i) => (
        <fieldset key={p.payer} className="grid gap-x-4 sm:grid-cols-2">
          <legend className="text-small font-semibold">{p.sample ? `[Sample] ${p.payer}` : p.payer}</legend>
          <TextField compact label="Sessions a week" inputMode="decimal" placeholder={hint(Boolean(p.sample), p.weekly_sessions)} value={p.sessions} onChange={(e) => setPanels(panels.map((x, j) => (j === i ? { ...x, sessions: e.target.value } : x)))} />
          <TextField compact label="Pays per session ($)" inputMode="decimal" placeholder={hint(Boolean(p.sample), p.rate_cents === null ? null : p.rate_cents / 100)} value={p.rate} onChange={(e) => setPanels(panels.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))} />
        </fieldset>
      ))}
      <div className="grid gap-x-4 sm:grid-cols-3">
        <TextField compact label="Private-pay sessions a week now" inputMode="decimal" placeholder={hint(sampleFields.has("current_private_weekly"), input.current_private_weekly)} value={current} onChange={(e) => setCurrent(e.target.value)} />
        <TextField compact label="Sessions a week when full" inputMode="decimal" placeholder={hint(sampleFields.has("target_weekly_sessions"), input.target_weekly_sessions)} value={weekly} onChange={(e) => setWeekly(e.target.value)} />
        <TextField compact label="Monthly income goal ($)" inputMode="decimal" placeholder={hint(sampleFields.has("target_monthly_income_cents"), input.target_monthly_income_cents === null ? null : input.target_monthly_income_cents / 100)} value={income} onChange={(e) => setIncome(e.target.value)} />
      </div>
      <Button type="button" variant="primary" className="w-fit" disabled={!canWrite || busy} onClick={save}>
        Save my numbers
      </Button>
    </div>
  );
}

function PlanCard({ plan, input, sample, canWrite }: { plan: PrivatePayPlan; input: PlanInput; sample: boolean; canWrite: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <Card id="plan-h" title="Your private-pay plan" icon={<TrendingUp className="size-4" />} status={sample ? <span className="text-small text-[var(--fg-muted)]">[Sample] numbers</span> : undefined}>
      <p className="text-section font-semibold sm:text-title" data-testid="plan-headline">
        {plan.headline}
      </p>
      {plan.dropFirst && <p className="text-[var(--fg-muted)]">{plan.dropFirst.why} Keep insurance as your floor while private pay grows, then replace one panel at a time.</p>}
      {plan.asks.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="font-semibold">Aeon needs to know:</p>
          <ul className="list-disc pl-5 text-[var(--fg-muted)]">
            {plan.asks.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {plan.panels.length > 0 && (
        <ListCard id="panels-h" label="Your insurance panels">
          {plan.panels.map((p) => (
            <ListRow
              key={p.payer}
              title={p.sample ? `[Sample] ${p.payer}` : p.payer}
              accent={plan.dropFirst?.payer === p.payer}
              detail={`${p.weeklySessions} sessions a week · ${p.rateCents === null ? "rate unknown" : `${usd(p.rateCents)} a session`}${p.hourlyCents === null ? "" : ` · about ${usd(p.hourlyCents)} an hour with admin`}`}
              end={<span className="text-small font-semibold">{p.clientsToReplace === null ? "?" : `${p.clientsToReplace} clients to replace`}</span>}
            />
          ))}
        </ListCard>
      )}
      {plan.weeks.length > 0 && (
        <div tabIndex={0} role="region" aria-label="12-week plan table" className="overflow-x-auto rounded-[16px] border border-[var(--line)] focus-visible:outline-2 focus-visible:outline-[var(--accent-fg)]">
          <table className="w-full min-w-[520px] text-small">
            <caption className="sr-only">12-week fill plan</caption>
            <thead>
              <tr className="text-left text-[var(--fg-muted)]">
                <th scope="col" className="px-3 py-2 font-medium">Week</th>
                <th scope="col" className="px-3 py-2 font-medium">Consults to book</th>
                <th scope="col" className="px-3 py-2 font-medium">New clients</th>
                <th scope="col" className="px-3 py-2 font-medium">Private-pay clients</th>
                <th scope="col" className="px-3 py-2 font-medium">Focus</th>
              </tr>
            </thead>
            <tbody>
              {plan.weeks.map((w) => (
                <tr key={w.week} className="border-t border-[var(--line)]">
                  <th scope="row" className="px-3 py-2 font-semibold">{w.week}</th>
                  <td className="px-3 py-2">{w.consults}</td>
                  <td className="px-3 py-2">{w.newClients}</td>
                  <td className="px-3 py-2">{w.totalPrivateClients}</td>
                  <td className="px-3 py-2 text-[var(--fg-muted)]">{w.focus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {plan.checkpoints.length > 0 && (
        <ListCard id="checkpoints-h" label="Checkpoints">
          {plan.checkpoints.map((c) => (
            <ListRow key={c.week} title={`Week ${c.week}: ${c.title}`} detail={c.check} />
          ))}
        </ListCard>
      )}
      {plan.notes.map((n) => (
        <p key={n} className="text-small text-[var(--fg-muted)]">{n}</p>
      ))}
      <details className="text-small text-[var(--fg-muted)]">
        <summary className="cursor-pointer py-2">How Aeon worked this out</summary>
        <ul className="list-disc pl-5">
          {plan.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
      {editing ? (
        <PlanEditor input={input} canWrite={canWrite} onDone={() => setEditing(false)} />
      ) : (
        <Button type="button" variant="quiet" className="w-fit" disabled={!canWrite} onClick={() => setEditing(true)}>
          Use my own numbers
        </Button>
      )}
    </Card>
  );
}

function AdSettings({ settings, canWrite }: { settings: GrowthSettings; canWrite: boolean }) {
  const router = useRouter();
  const [cap, setCap] = useState(settings.monthlyCapCents === null || settings.capIsSample ? "" : (settings.monthlyCapCents / 100).toString());
  const [radius, setRadius] = useState(settings.radiusMiles.toString());
  const [site, setSite] = useState(settings.siteUrl ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card-sm)] border border-[var(--line)] p-4">
      <div className="grid gap-x-4 sm:grid-cols-3">
        <TextField compact label="Hard monthly cap ($)" description="Ads never spend past this. At least $150." inputMode="decimal" placeholder={settings.capIsSample && settings.monthlyCapCents ? `[Sample] ${settings.monthlyCapCents / 100}` : undefined} value={cap} onChange={(e) => setCap(e.target.value)} />
        <TextField compact label="Miles from your office" inputMode="decimal" value={radius} onChange={(e) => setRadius(e.target.value)} />
        <TextField compact label="Your website address" placeholder="https://" value={site} onChange={(e) => setSite(e.target.value)} />
      </div>
      <Button
        type="button"
        variant="quiet"
        className="w-fit"
        disabled={!canWrite || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await post({ action: "settings", monthly_cap_dollars: settings.capIsSample && !cap.trim() ? undefined : num(cap), radius_miles: num(radius) ?? undefined, site_url: site.trim() });
            notify.success("Saved");
            router.refresh();
          } catch (err) {
            notify.error(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        Save ad settings
      </Button>
    </div>
  );
}

export function GrowStudio({
  plan,
  planInput,
  planSample,
  isSample,
  settings,
  google,
  meta,
  site,
  canWrite,
}: {
  plan: PrivatePayPlan;
  planInput: PlanInput;
  planSample: boolean;
  isSample: boolean;
  settings: GrowthSettings;
  google: { draft: GoogleAdsDraft; saved: SavedView | null };
  meta: { draft: MetaAdsDraft; saved: SavedView | null };
  site: { draft: SiteDraft; html: string; saved: SavedView | null };
  canWrite: boolean;
}) {
  const g = google.draft;
  const m = meta.draft;
  return (
    <div className="flex flex-col gap-6">
      <PlanCard plan={plan} input={planInput} sample={planSample} canWrite={canWrite} />

      <div className="flex flex-col gap-3">
        <h2 className="text-section">Ads</h2>
        <p className="max-w-[62ch] text-[var(--fg-muted)]">
          Location and keywords only: no remarketing, no customer lists, no health or interest audiences. Every campaign downloads
          paused, so nothing runs until you turn it on in your own account.
        </p>
        <AdSettings settings={settings} canWrite={canWrite} />
      </div>

      <Card id="google-h" title="Google Search ads" icon={<Search className="size-4" />} status={<ApprovalState saved={google.saved} />}>
        <PolicyLine check={g.check} />
        <p className="text-small text-[var(--fg-muted)]">
          {g.campaign.location.label}, {g.campaign.location.radiusMiles} miles ·{" "}
          {g.campaign.monthlyCapCents ? `${settings.capIsSample ? "[Sample] " : ""}cap ${usd(g.campaign.monthlyCapCents)} a month (${usd(g.campaign.dailyBudgetCents!)} a day)` : "no cap set yet"}
        </p>
        <p className="text-small text-[var(--fg-muted)]">{GOOGLE_BUDGET_NOTE}</p>
        <div className="flex flex-col gap-1">
          <p className="text-small font-semibold">Headlines</p>
          <ul className="flex flex-wrap gap-2">
            {g.ad.headlines.map((h) => (
              <li key={h} className="rounded-full border border-[var(--line)] px-3 py-1 text-small">{h}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-small font-semibold">Descriptions</p>
          {g.ad.descriptions.map((d) => (
            <p key={d} className="text-small">{d}</p>
          ))}
        </div>
        <p className="text-small text-[var(--fg-muted)]">
          Keywords: {g.adGroup.keywords.map((k) => k.text).join(", ")}. Left out: {g.negatives.slice(0, 6).join(", ")} and more.
        </p>
        <Actions kind="google_ads" saved={google.saved} ok={g.check.ok} canWrite={canWrite} sample={isSample} exports={[{ as: "csv", label: "Google Ads Editor file" }]} />
      </Card>

      <Card id="meta-h" title="Facebook and Instagram ads" icon={<Megaphone className="size-4" />} status={<ApprovalState saved={meta.saved} />}>
        <PolicyLine check={m.check} />
        <p className="text-small text-[var(--fg-muted)]">
          {m.adSet.location.label}, {m.adSet.location.radiusMiles} miles · adults 18 to 65+ · no interest targeting
        </p>
        <p className="text-small text-[var(--fg-muted)]">
          {m.campaign.lifetimeBudgetCents
            ? `${settings.capIsSample ? "[Sample] " : ""}Lifetime budget ${usd(m.campaign.lifetimeBudgetCents)}, ${m.campaign.startDate} to ${m.campaign.endDate}. Meta stops spending when it is used up.`
            : "No cap set yet."}
          {m.image.fallback ? ` ${m.image.fallback}` : ""}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {m.ads.map((a, i) => (
            <figure key={a.name} className="flex flex-col overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--glass)]">
              {i === 0 && meta.saved?.hasImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/growth/drafts/${meta.saved.id}/image`} alt={m.image.alt} className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-[var(--hairline)] p-6 text-center text-small text-[var(--fg-muted)]">
                  {i === 0 ? "Aeon makes the picture (an empty office, no people) when you queue this." : "Uses the same picture."}
                </div>
              )}
              <figcaption className="flex flex-col gap-1 p-3">
                <p className="text-small">{a.primaryText}</p>
                <p className="font-semibold">{a.headline}</p>
                <span className="w-fit rounded-full border border-[var(--line)] px-3 py-1 text-small">{a.ctaLabel}</span>
              </figcaption>
            </figure>
          ))}
        </div>
        <Actions
          kind="meta_ads"
          saved={meta.saved}
          ok={m.check.ok}
          canWrite={canWrite}
          sample={isSample}
          exports={[
            { as: "json", label: "Ads Manager spec" },
            { as: "image", label: "Ad picture" },
          ]}
        />
      </Card>

      <Card id="site-h" title="Your one-page website" icon={<Globe className="size-4" />} status={<ApprovalState saved={site.saved} />}>
        <PolicyLine check={site.draft.check} />
        <p className="text-small text-[var(--fg-muted)]">
          No tracking or analytics, no contact form, no testimonials. Includes the practice details block for Google, llms.txt and a sitemap.
        </p>
        <iframe title="Website preview" sandbox="" srcDoc={site.html} className="h-[560px] w-full rounded-[16px] border border-[var(--line)] bg-[var(--glass)]" />
        <Actions
          kind="website"
          saved={site.saved}
          ok={site.draft.check.ok}
          canWrite={canWrite}
          sample={isSample}
          exports={[
            { as: "zip", label: "Website files (zip)" },
            { as: "squarespace", label: "Text for Squarespace" },
          ]}
        />
      </Card>
    </div>
  );
}
