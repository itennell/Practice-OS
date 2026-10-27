import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatDate } from "@/components/deadline-card";
import { GlassCard } from "@/components/ui";
import { getGuide, guideSlugs } from "@/lib/guides";

export function generateStaticParams() {
  return guideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/how-do-i/[slug]">): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  return { title: `${guide?.title ?? "How do I"} · Practice-OS` };
}

export default function GuidePage({ params }: PageProps<"/how-do-i/[slug]">) {
  return (
    <Suspense fallback={<GuideSkeleton />}>
      <GuideBody params={params} />
    </Suspense>
  );
}

function GuideSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <div className="h-10 w-80 max-w-full animate-pulse rounded-full bg-[var(--glass-strong)]" />
      {[0, 1].map((i) => (
        <div key={i} className="h-48 animate-pulse rounded-[20px] bg-[var(--glass-strong)]" />
      ))}
    </div>
  );
}

async function GuideBody({ params }: { params: PageProps<"/how-do-i/[slug]">["params"] }) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-small">
        <Link href="/how-do-i" className="inline-flex h-touch items-center text-[var(--link)] underline underline-offset-2">
          All how-do-i guides
        </Link>
      </nav>
      <header className="flex flex-col gap-2">
        <h1 className="text-title">{guide.title}</h1>
        <p className="max-w-[65ch] text-[var(--fg-muted)]">{guide.summary}</p>
        <p className="text-small text-[var(--fg-muted)]">
          Official page:{" "}
          <a href={guide.official_url} target="_blank" rel="noreferrer" className="text-[var(--link)] underline underline-offset-2">
            {new URL(guide.official_url).hostname}
          </a>{" "}
          · checked {formatDate(guide.last_verified, false)}
        </p>
      </header>

      {guide.sections.map((section) => {
        const List = section.ordered ? "ol" : "ul";
        const id = `section-${section.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        return (
          <GlassCard key={section.heading} aria-labelledby={id} className="flex flex-col gap-4 p-6 md:p-8">
            <h2 id={id} className="text-section font-semibold">
              {section.heading}
            </h2>
            <List className={`flex flex-col gap-3 ${section.ordered ? "list-decimal" : "list-disc"} pl-6 marker:font-semibold`}>
              {section.items.map((item, i) => (
                <li key={i} className="max-w-[65ch] pl-1">
                  {item.you && (
                    <span
                      className="mr-2 inline-flex h-6 items-center rounded-full px-2.5 align-[1px] text-label font-semibold"
                      style={{ color: "var(--status-pending-fg)", background: "var(--status-pending-bg)" }}
                    >
                      You do this
                    </span>
                  )}
                  {item.text}
                </li>
              ))}
            </List>
          </GlassCard>
        );
      })}

      <GlassCard aria-labelledby="sources-heading" className="flex flex-col gap-3 p-6 md:p-8">
        <h2 id="sources-heading" className="text-section font-semibold">
          Sources
        </h2>
        <ul className="flex flex-col gap-1">
          {guide.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex min-h-touch items-center text-[var(--link)] underline underline-offset-2">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="max-w-[65ch] text-small text-[var(--fg-muted)]">
          Aeon prepares forms and reminders. It never signs, attests or submits for you, and this isn’t legal or tax advice.
        </p>
      </GlassCard>
    </>
  );
}
