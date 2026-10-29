import { connection } from "next/server";
import { Suspense } from "react";
import { WebsiteHelper } from "@/components/media/website-helper";
import { loadMediaFacts } from "@/lib/media/facts";
import { WEBSITE } from "@/lib/media/schema";
import { loadChecklist, loadSiteCopy, SETUP_STEPS } from "@/lib/media/website";

export const metadata = { title: "Website · Media · Practice-OS" };

// Media > Website (docs/research.md > Media presence, section 7).
export default function WebsitePage() {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-title">Your website</h1>
        <p className="max-w-[60ch] text-[var(--fg-muted)]">
          Already have one? Check it against a short list. Don&rsquo;t have one? Here&rsquo;s the simplest way, and Aeon
          writes the words for each page.
        </p>
      </header>
      <Suspense fallback={<div aria-hidden className="h-40 animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <Helper />
      </Suspense>
    </>
  );
}

async function Helper() {
  await connection();
  const f = await loadMediaFacts().catch(() => null);
  if (!f) return <p className="text-[var(--fg-muted)]">Finish setting up your practice first, so Aeon knows what to write.</p>;
  const [site, done] = await Promise.all([loadSiteCopy(), loadChecklist()]);
  return (
    <WebsiteHelper
      url={f.website}
      status={f.websiteStatus}
      checklist={WEBSITE.checklist}
      done={done}
      steps={SETUP_STEPS}
      rec={{ name: WEBSITE.default.name, cost: WEBSITE.default.cost, why: WEBSITE.default.why, source: WEBSITE.default.sources[0] }}
      metaNote={WEBSITE.meta.note}
      hipaa={WEBSITE.hipaa}
      site={site}
      canWrite={!process.env.VERCEL}
    />
  );
}
