import { connection } from "next/server";
import { Suspense } from "react";
import { GrowStudio, type SavedView } from "@/components/media/grow-studio";
import { draftGoogleAds, draftMetaAds } from "@/lib/growth/ads";
import { renderSiteHtml, draftSite } from "@/lib/growth/site";
import { isReady, latestDrafts, loadGrowthContext, loadPlan, type DraftRow } from "@/lib/growth/store";

export const metadata = { title: "Grow · Media · Practice-OS" };

// Media > Grow: fill the practice in about 3 months. The private-pay plan on top,
// then Google and Meta ad drafts, then her one-page website. Everything is a draft
// she approves; exports unlock after that. Nothing spends money or publishes.
export default function GrowPage() {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-title">Grow your practice</h1>
        <p className="max-w-[62ch] text-[var(--fg-muted)]">
          Aeon works out how many private-pay clients you need, drafts ads and a website to bring them in, and checks every
          word against Google&rsquo;s and Meta&rsquo;s health rules. You approve each draft, then download it. Nothing is
          spent or published.
        </p>
      </header>
      <Suspense fallback={<div aria-hidden className="h-60 animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <Grow />
      </Suspense>
    </>
  );
}

function view(r: DraftRow | undefined): SavedView | null {
  if (!r) return null;
  return {
    id: r.id,
    ready: isReady(r),
    waiting: r.status === "pending_approval" && (r.approval_status === "pending" || r.approval_status === "running"),
    declined: r.approval_status === "rejected",
    hasImage: r.has_image,
  };
}

async function Grow() {
  await connection(); // read the database per request, never at build time
  const ctx = await loadGrowthContext().catch(() => null);
  if (!ctx) return <p className="text-[var(--fg-muted)]">Finish setting up your practice first, so Aeon knows what to write.</p>;
  const [{ plan, input, sample }, saved] = await Promise.all([loadPlan(), latestDrafts()]);
  // A live preview from her facts right now; the saved draft (if any) is what she approves and exports.
  const site = (saved.website?.draft as ReturnType<typeof draftSite> | undefined) ?? draftSite(ctx.facts, ctx.settings, ctx.licenseLine);
  return (
    <GrowStudio
      plan={plan}
      planInput={input}
      planSample={sample}
      isSample={ctx.facts.isSample}
      settings={ctx.settings}
      google={{ draft: (saved.google_ads?.draft as ReturnType<typeof draftGoogleAds> | undefined) ?? draftGoogleAds(ctx.facts, ctx.settings), saved: view(saved.google_ads) }}
      meta={{ draft: (saved.meta_ads?.draft as ReturnType<typeof draftMetaAds> | undefined) ?? draftMetaAds(ctx.facts, ctx.settings), saved: view(saved.meta_ads) }}
      site={{ draft: site, html: renderSiteHtml(site), saved: view(saved.website) }}
      canWrite={!process.env.VERCEL}
    />
  );
}
