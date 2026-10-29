import type { Metadata } from "next";
import Link from "next/link";
import { GlassCard, PageHeader } from "@/components/ui";
import { allGuides } from "@/lib/guides";

export const metadata: Metadata = { title: "How do I · Practice-OS" };

export default function GuidesPage() {
  const guides = allGuides();
  return (
    <>
      <PageHeader
        title="How do I…"
        description="Short checklists for the paperwork of running a practice, each with the official page. Steps marked “You do this” are yours; Aeon prepares the rest."
      />
      <GlassCard aria-label="Guides" className="p-3 md:p-4">
        <ul className="flex flex-col">
          {guides.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/admin/how-do-i/${g.slug}`}
                className="flex min-h-touch flex-col gap-1 rounded-[18px] px-4 py-3 hover:bg-[var(--hairline)]"
              >
                <span className="font-semibold text-[var(--link)]">{g.title}</span>
                <span className="text-small text-[var(--fg-muted)]">{g.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      </GlassCard>
    </>
  );
}
