"use client";

// The Files page's list (/files): every file she added and every one Aeon made, from
// lib/documents/files.ts. Filter chips by group and a search box, both on her screen
// only; each row opens the side panel (?open=<id>) or downloads the file. One list
// card per group, hairline rows (UI-033), the shared empty state (UI-034).

import { Download, FileText, FolderOpen, Image as ImageIcon, Mail, PanelRight, Receipt, SearchX, ShieldCheck, Upload, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ListCard, ListRow } from "@/components/shared/list-card";
import { TextField } from "@/components/shared/settings-controls";
import { ButtonLink, buttonClass, chipClass } from "@/components/ui";
import { KIND_LABEL } from "@/lib/documents/card";
import { FILE_GROUPS, GROUP_LABEL, fileDetail, matchesSearch, type FileEntry, type FileGroup } from "@/lib/documents/file-entry";

type Filter = "all" | FileGroup;

const ICON: Record<FileGroup, LucideIcon> = { uploaded: Upload, forms: FileText, money: Receipt, insurance: ShieldCheck, referrals: Mail, media: ImageIcon };

const EMPTY_TITLE: Record<Filter, string> = {
  all: "No files yet",
  uploaded: "Nothing uploaded yet",
  forms: "No forms yet",
  money: "No estimates or superbills yet",
  insurance: "No insurance forms yet",
  referrals: "No referral letters yet",
  media: "No posts yet",
};

const EMPTY_LINE: Record<Filter, string> = {
  all: "Add your first one with the + in the chat box, or ask Aeon to make a form, a Good Faith Estimate or a superbill.",
  uploaded: "Files you add with the + in the chat box show up here: a payer contract, a W-9, a CE certificate.",
  forms: "Client forms show up here once your practice details are filled in. Ask Aeon for one in the chat.",
  money: "Ask Aeon in the chat to draft a Good Faith Estimate or a superbill; it shows up here.",
  insurance: "When Aeon prepares an insurance form, like Medicare's CMS-855I, it shows up here.",
  referrals: "Intro letters Aeon drafts for your referral sources show up here.",
  media: "Instagram posts Aeon writes with you show up here, with their pictures.",
};

const ACTION = "h-touch! px-4! text-small!";

const nameOf = (e: FileEntry) => `${e.card.title}${e.card.is_sample && !e.card.title.includes("[Sample]") ? " [Sample]" : ""}`;

function FileRow({ entry }: { entry: FileEntry }) {
  const Icon = ICON[entry.group];
  const name = nameOf(entry);
  return (
    <ListRow
      icon={<Icon size={16} strokeWidth={1.75} />}
      accent={entry.card.status === "Waiting for you"}
      title={name}
      detail={fileDetail(entry)}
      wrapEnd
      end={
        <>
          <Link href={`/files?open=${encodeURIComponent(entry.card.id)}`} scroll={false} className={buttonClass("quiet", ACTION)}>
            <PanelRight aria-hidden size={16} />
            Open<span className="sr-only"> {name}</span>
          </Link>
          {entry.download && (
            <a href={entry.download.href} download className={buttonClass("quiet", ACTION)}>
              <Download aria-hidden size={16} />
              {entry.download.label}
              <span className="sr-only"> of {name}</span>
            </a>
          )}
        </>
      }
    />
  );
}

export function FilesList({ entries, capped = {} }: { entries: FileEntry[]; capped?: Partial<Record<FileGroup, string>> }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const shown = entries.filter((e) => (filter === "all" || e.group === filter) && matchesSearch(e, query.trim(), KIND_LABEL[e.card.kind]));
  const groups = (filter === "all" ? FILE_GROUPS : [filter]).map((g) => ({ g, rows: shown.filter((e) => e.group === g) })).filter((x) => x.rows.length > 0);
  const count = (f: Filter) => (f === "all" ? entries.length : entries.filter((e) => e.group === f).length);

  if (entries.length === 0) {
    return (
      <div className="rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]">
        <EmptyState icon={<FolderOpen size={18} strokeWidth={1.75} />} title={EMPTY_TITLE.all} action={<ButtonLink href="/" variant="quiet">Go to the chat</ButtonLink>}>
          {EMPTY_LINE.all}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {(["all", ...FILE_GROUPS] as Filter[]).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={chipClass(filter === f, true)}>
              {f === "all" ? "All" : GROUP_LABEL[f]}
              <span className="ml-2 tabular-nums">{count(f)}</span>
            </button>
          ))}
        </div>
        <TextField label="Search files" hideLabel type="search" placeholder="Search files" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {groups.length === 0 ? (
        <div className="rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]">
          {query.trim() ? (
            <EmptyState icon={<SearchX size={18} strokeWidth={1.75} />} title="Nothing matches">
              No file matches “{query.trim()}”{filter === "all" ? "" : ` in ${GROUP_LABEL[filter]}`}. Try another word, or ask Aeon in the chat.
            </EmptyState>
          ) : (
            <EmptyState icon={<FolderOpen size={18} strokeWidth={1.75} />} title={EMPTY_TITLE[filter]}>
              {EMPTY_LINE[filter]}
            </EmptyState>
          )}
        </div>
      ) : (
        groups.map(({ g, rows }) => (
          <ListCard key={g} id={`files-${g}`} label={`${GROUP_LABEL[g]} · ${rows.length}`}>
            {rows.map((e) => (
              <FileRow key={e.card.id} entry={e} />
            ))}
            {capped[g] && (
              <li className="border-t border-[var(--line)] px-4 py-3 text-small text-[var(--fg-muted)]">
                {capped[g]} Ask Aeon in the chat to find an older one.
              </li>
            )}
          </ListCard>
        ))
      )}
    </div>
  );
}
