import { KIND_LABEL, type DocumentCard, type DocumentKind } from "./card";

// The Files page (/files): every file she added and every one Aeon made, in one list.
// Built from the same cards as the document index (lib/documents/index.ts), so a file
// looks the same here, in the chat and in Admin. Each entry adds only what a list
// needs: its group, the day it was made, who made it and how to download it.
// No client details: a Good Faith Estimate is its reference number, as everywhere.
// Pure (no database), so the page's list can use it in the browser; lib/documents/files.ts loads.

export const FILE_GROUPS = ["uploaded", "forms", "money", "insurance", "referrals", "media"] as const;
export type FileGroup = (typeof FILE_GROUPS)[number];

export const GROUP_LABEL: Record<FileGroup, string> = {
  uploaded: "Uploaded",
  forms: "Forms",
  money: "Estimates & superbills",
  insurance: "Insurance",
  referrals: "Referrals",
  media: "Media",
};

/** Which kinds are files, and where each one sits. Deadlines, guides and checklists aren't files. */
export const GROUP_OF: Partial<Record<DocumentKind, FileGroup>> = {
  uploaded: "uploaded",
  client_form: "forms",
  release_form: "forms",
  gfe: "money",
  superbill: "money",
  payer_application: "insurance",
  cms855i: "insurance",
  referral_letter: "referrals",
  instagram_post: "media",
};

export type FileDownload = { href: string; label: string };

export type FileEntry = {
  card: DocumentCard;
  group: FileGroup;
  /** The day it was added or made (YYYY-MM-DD); null for a template that is always ready. */
  made_on: string | null;
  source: "uploaded" | "aeon";
  download: FileDownload | null;
};

const day = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
};

/** One card as a Files entry, or null when its kind isn't a file. Pure. */
export function toFileEntry(card: DocumentCard, made: Date | string | null | undefined, download?: FileDownload | null): FileEntry | null {
  const group = GROUP_OF[card.kind];
  if (!group) return null;
  const key = card.id.slice(card.id.indexOf(":") + 1);
  const fallback: FileDownload | null =
    card.kind === "uploaded" ? { href: `/api/documents/${key}/file?download=1`, label: "Download" } : card.pdf ? { href: card.pdf, label: "Download PDF" } : null;
  return { card, group, made_on: day(made), source: card.kind === "uploaded" ? "uploaded" : "aeon", download: download === undefined ? fallback : download };
}

/** Newest first; templates with no date after everything dated, by title. Pure. */
export function sortFiles(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.made_on !== b.made_on) return a.made_on === null ? 1 : b.made_on === null ? -1 : b.made_on.localeCompare(a.made_on);
    return a.card.title.localeCompare(b.card.title);
  });
}

/** Her words against a file's title, line, kind and topics. Pure; an empty search matches everything. */
export function matchesSearch(e: FileEntry, query: string, kindLabel: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = [e.card.title, e.card.subtitle, e.card.status, kindLabel, GROUP_LABEL[e.group], ...e.card.topics].join(" ").toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export function niceDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));
}

/** The row's one line: kind, day (or "Template") and who made it. */
export function fileDetail(e: FileEntry): string {
  return [KIND_LABEL[e.card.kind], e.made_on ? niceDay(e.made_on) : "Template", e.source === "uploaded" ? "Uploaded by you" : "Made by Aeon"].join(" · ");
}
