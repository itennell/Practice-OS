import { connection } from "next/server";
import { Suspense } from "react";
import { PtStudio } from "@/components/media/pt-studio";
import { loadMediaFacts, place } from "@/lib/media/facts";
import { assemble, directoryVersions, finish, loadProfileDraft } from "@/lib/media/profile";
import { buildProfileView, interviewState } from "@/lib/media/pt-profile";
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
            Aeon asks a few short questions, section by section, and shows your whole Psychology Today profile ({PT_PRICE})
            as it will read. You make the words yours and paste them in, then use the same words for other listings.
            Nothing is sent anywhere.
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
    <PtStudio
      who={{ name: f.name, credential: f.credential, place: place(f), sample: f.isSample }}
      state={interviewState(f)}
      view={buildProfileView(f, draft)}
      draft={draft}
      directories={directoryVersions(draft ?? finish(f, assemble(f, null).fields, "template"))}
      canWrite={!process.env.VERCEL}
    />
  );
}
