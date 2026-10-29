import { connection } from "next/server";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui";
import { instagramDeclined } from "@/lib/instagram/onboarding";
import InstagramPage from "../../instagram/page";

// The Instagram tab is the Instagram page itself (app/(app)/instagram, owned by the
// Instagram studio work); /instagram redirects here so old links keep working.
// If she said Instagram isn't for her, a short note takes its place, with the way back:
// the same onboarding question, where she can change her answer.
export { metadata } from "../../instagram/page";

export default function MediaInstagram() {
  return (
    <Suspense fallback={<div aria-hidden className="h-40 animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
      <InstagramOrNote />
    </Suspense>
  );
}

async function InstagramOrNote() {
  await connection(); // read the database per request, never at build time
  if (!(await instagramDeclined().catch(() => false))) return <InstagramPage />;
  return (
    <section aria-labelledby="ig-off-heading" className="flex flex-col items-start gap-4 rounded-[24px] border border-[var(--hairline)] bg-[var(--color-card)] p-6 dark:bg-[var(--color-dark-card)]">
      <h1 id="ig-off-heading" className="text-title">
        Instagram
      </h1>
      <p className="max-w-[52ch]">You said Instagram isn&rsquo;t for you, so Aeon leaves it out.</p>
      <ButtonLink variant="quiet" href={`/onboarding?q=${encodeURIComponent("instagram:account")}`}>
        Turn Instagram back on
      </ButtonLink>
    </section>
  );
}
