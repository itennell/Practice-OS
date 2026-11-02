import type { Metadata } from "next";
import { Download } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { SidePanel } from "@/components/admin/side-panel";
import { DocumentCards } from "@/components/document-cards";
import { FilesList } from "@/components/files-list";
import { ButtonLink, PageHeader } from "@/components/ui";
import { KIND_LABEL } from "@/lib/documents/card";
import { fileDetail, getFile, listFiles } from "@/lib/documents/files";

export const metadata: Metadata = { title: "Files · Practice-OS" };

// Everything in one place: the files she added in the chat and every file Aeon made
// (client forms, estimates and superbills, insurance forms, referral letters, Instagram
// posts), from the document index (lib/documents). Open shows the file in a side panel
// (?open=<card id>), the same panel Admin uses; closing it comes back here.

export default function FilesPage({ searchParams }: PageProps<"/files">) {
  return (
    <>
      <PageHeader title="Files" description="Everything you added and everything Aeon made, newest first. Client details are never saved here." />
      <Suspense fallback={<div aria-hidden className="h-72 animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <AllFiles />
      </Suspense>
      <Suspense>
        <Panel searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function AllFiles() {
  await connection(); // read the database per request, never at build time
  return <FilesList entries={await listFiles()} />;
}

async function Panel({ searchParams }: { searchParams: PageProps<"/files">["searchParams"] }) {
  const { open } = await searchParams;
  if (typeof open !== "string" || open.length > 120) return null;
  await connection();
  const entry = await getFile(open);
  if (!entry) return null;
  return (
    <SidePanel key={open} home="/files" title={entry.card.title} description={KIND_LABEL[entry.card.kind]}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-small">
        <dt className="text-[var(--fg-muted)]">About</dt>
        <dd>{fileDetail(entry)}</dd>
        <dt className="text-[var(--fg-muted)]">Status</dt>
        <dd>{entry.card.status}</dd>
        {entry.card.subtitle && (
          <>
            <dt className="text-[var(--fg-muted)]">Details</dt>
            <dd>{entry.card.subtitle}</dd>
          </>
        )}
      </dl>
      <DocumentCards cards={[entry.card]} />
      {/* The card downloads a PDF; anything else (a Word file, a post's picture) downloads here. */}
      {entry.download && entry.card.pdf === null && (
        <ButtonLink href={entry.download.href} download variant="quiet" className="self-start">
          <Download aria-hidden size={16} />
          {entry.download.label}
        </ButtonLink>
      )}
    </SidePanel>
  );
}
