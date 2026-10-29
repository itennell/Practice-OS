import { connection } from "next/server";
import { Suspense } from "react";
import { ProfileBuilder } from "@/components/media/profile-builder";
import { loadMediaFacts, missingAnswers, place, QUESTIONS } from "@/lib/media/facts";
import { directoryVersions, loadProfileDraft } from "@/lib/media/profile";
import { PT_PRICE } from "@/lib/media/schema";

export const metadata = { title: "Media · Practice-OS" };

// Media > Psychology Today and directories (docs/research.md > Media presence):
// Aeon writes each profile box from her facts and her own words; she pastes it in.
export default function MediaPage() {
  return (
    <>
      <header className="flex items-start gap-4">
        <span aria-hidden className="orb-instagram mt-1 inline-block size-10 shrink-0" />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-title break-words">Psychology Today and directories</h1>
          <p className="max-w-[60ch] text-[var(--fg-muted)]">
            Aeon writes every box of your Psychology Today profile ({PT_PRICE}) to fit its limit, then the same words for
            other listings. You read each one, make it yours, and paste it in. Nothing is sent anywhere.
          </p>
        </div>
      </header>
      <Suspense fallback={<div aria-hidden className="h-40 animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <Builder />
      </Suspense>
    </>
  );
}

async function Builder() {
  await connection(); // read the database per request, never at build time
  const f = await loadMediaFacts().catch(() => null);
  if (!f) return <p className="text-[var(--fg-muted)]">Finish setting up your practice first, so Aeon knows what to write.</p>;
  const draft = await loadProfileDraft();
  return (
    <ProfileBuilder
      who={{ name: f.name, credential: f.credential, place: place(f), sample: f.isSample }}
      questions={QUESTIONS}
      answers={f.answers}
      missing={missingAnswers(f.answers)}
      draft={draft}
      directories={draft ? directoryVersions(draft) : []}
      canWrite={!process.env.VERCEL}
    />
  );
}
