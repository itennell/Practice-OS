"use client";

// Documents in the chat: the cards Aeon's document tools found or made (lib/documents),
// drawn with the shared Attachment (UI-023). "Open" goes to the side panel already
// filled in and comes back to this chat when she closes it; "Download PDF" is a plain
// GET link, shown only when the document has one.

import { Download, ExternalLink, PanelRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Attachment, AttachmentList } from "@/components/shared/attachment";
import { KIND_LABEL, type DocumentCard } from "@/lib/documents/card";
import { cn } from "@/lib/utils";

const ACTION =
  "inline-flex h-touch items-center gap-2 rounded-full border border-[var(--line)] px-4 text-small font-medium text-[var(--fg)] transition-colors duration-150 hover:border-[var(--fg-muted)]";

/** The card's link plus where to come back to, so closing the panel returns to this chat. */
function withBack(href: string, back: string): string {
  if (href.includes("#") || !href.startsWith("/admin?")) return href;
  return `${href}&back=${encodeURIComponent(back)}`;
}

function dueText(c: DocumentCard): string | null {
  if (!c.due_on) return null;
  const d = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${c.due_on}T00:00:00Z`));
  return c.kind === "credential_doc" ? `expires ${d}` : `due ${d}`;
}

export function DocumentCards({ cards }: { cards: DocumentCard[] }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const back = `${pathname}${search ? `?${search}` : ""}`;
  if (cards.length === 0) return null;
  return (
    <AttachmentList label={cards.length === 1 ? "Document" : `${cards.length} documents`}>
      {cards.map((c) => {
        const name = `${c.title}${c.is_sample && !c.title.includes("[Sample]") ? " [Sample]" : ""}`;
        return (
          <div key={c.id} className="flex w-[clamp(15rem,78vw,21rem)] max-w-full flex-col gap-2">
            <Attachment
              name={name}
              kind={c.pdf ? "pdf" : "file"}
              details={[c.status, dueText(c)].filter(Boolean).join(" · ")}
              className="w-full!"
            />
            <p className="px-1 text-label text-[var(--fg-muted)]">
              <span className="sr-only">{KIND_LABEL[c.kind]}. </span>
              {c.needs_her ?? c.subtitle}
              {c.held_elsewhere && <span className="block">Kept in {c.held_elsewhere}</span>}
            </p>
            <div className="flex flex-wrap gap-2 px-1">
              {c.open.startsWith("/api/") ? (
                // A file she added: opens in its own tab.
                <a href={c.open} target="_blank" rel="noreferrer" className={ACTION}>
                  <ExternalLink aria-hidden size={16} />
                  Open<span className="sr-only"> {name}</span>
                </a>
              ) : (
                <Link href={withBack(c.open, back)} className={ACTION}>
                  <PanelRight aria-hidden size={16} />
                  Open<span className="sr-only"> {name}</span>
                </Link>
              )}
              {c.pdf && (
                <a href={c.pdf} download className={ACTION}>
                  <Download aria-hidden size={16} />
                  Download PDF<span className="sr-only"> of {name}</span>
                </a>
              )}
              {!c.pdf && c.source && (
                <a href={c.source.href} target="_blank" rel="noreferrer" className={cn(ACTION, "max-w-full")}>
                  <ExternalLink aria-hidden size={16} />
                  Source<span className="sr-only">: {c.source.label}</span>
                </a>
              )}
            </div>
          </div>
        );
      })}
    </AttachmentList>
  );
}

/** Every card a reply's tool runs carried, once each, in the order they came. */
export function cardsOf(steps: { documents?: DocumentCard[] }[] | undefined): DocumentCard[] {
  const seen = new Set<string>();
  return (steps ?? [])
    .flatMap((s) => s.documents ?? [])
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .slice(0, 10);
}
