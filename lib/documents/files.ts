import { practiceToday } from "../compliance/store";
import { loadCredentialingProfile } from "../credentialing/store";
import { listEstimates } from "../gfe/store";
import { listPayerApplications } from "../payers/store";
import { listSuperbills } from "../superbill/store";
import { listStoredDocuments } from "../uploads/store";
import { getEstimate } from "../gfe/store";
import { getSuperbill } from "../superbill/store";
import { getStoredDocument } from "../uploads/store";
import { fileKindEnabled } from "../features";
import { SHOWN_GROUPS, sortFiles, toFileEntry, type FileEntry, type FileGroup } from "./file-entry";
import {
  clientFormCards,
  cms855iCard,
  gfeCard,
  listReferralLetters,
  openDocument,
  payerCard,
  referralLetterCard,
  releaseTemplateCards,
  superbillCard,
  uploadedCard,
} from "./index";

// Loads every file for the Files page (/files) from the same cards as the document
// index; the groups, sorting and search are in ./file-entry.ts.

export * from "./file-entry";

/** How many of each source the page reads; a source that fills its cap shows "Showing the newest N". */
export const FILE_CAPS = { uploads: 200, estimates: 100, superbills: 100, letters: 50 } as const;

export type FilesView = {
  entries: FileEntry[];
  /** Groups where a source hit its cap, with the line the page shows. */
  capped: Partial<Record<FileGroup, string>>;
};

/** Every file, newest first. Each source is read on its own, so one that fails leaves the rest. */
export async function listFiles(): Promise<FilesView> {
  const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const [today, uploads, estimates, bills, apps, profile, clientForms, letters] = await Promise.all([
    practiceToday(),
    safe(listStoredDocuments(FILE_CAPS.uploads), []),
    safe(listEstimates(FILE_CAPS.estimates), []),
    safe(listSuperbills(FILE_CAPS.superbills), []),
    safe(listPayerApplications(), []),
    safe(loadCredentialingProfile(), null),
    safe(clientFormCards(), []),
    safe(listReferralLetters(FILE_CAPS.letters), []),
  ]);
  const isSample = profile?.isSample ?? false;
  const entries = [
    ...uploads.map((d) => toFileEntry(uploadedCard(d), d.created_at)),
    ...estimates.map((e) => toFileEntry(gfeCard(e, today), e.created_at)),
    ...bills.map((b) => toFileEntry(superbillCard(b), b.created_at)),
    // An insurance application is a file only when Aeon prepared its form (Medicare's CMS-855I).
    ...apps.filter((a) => a.form === "cms855i").map((a) => toFileEntry(payerCard(a, today), a.created_at ?? null)),
    ...(profile && !apps.some((a) => a.form === "cms855i") ? [toFileEntry(cms855iCard(profile), null)] : []),
    ...clientForms.map((c) => toFileEntry(c, null)),
    ...releaseTemplateCards(isSample).map((c) => toFileEntry(c, null)),
    ...letters.map((l) => toFileEntry(referralLetterCard(l), l.created_at)),
  ];
  const full = (rows: unknown[], cap: number) => rows.length >= cap;
  const capped: FilesView["capped"] = {};
  if (full(uploads, FILE_CAPS.uploads)) capped.uploaded = `Showing the newest ${FILE_CAPS.uploads}.`;
  const money = [full(estimates, FILE_CAPS.estimates) && `${FILE_CAPS.estimates} estimates`, full(bills, FILE_CAPS.superbills) && `${FILE_CAPS.superbills} superbills`].filter(Boolean);
  if (money.length) capped.money = `Showing the newest ${money.join(" and ")}.`;
  if (full(letters, FILE_CAPS.letters)) capped.referrals = `Showing the newest ${FILE_CAPS.letters}.`;
  // A note only for a group the page shows (the referrals-only demo hides most: lib/features.ts).
  for (const g of Object.keys(capped) as (keyof typeof capped)[]) if (!SHOWN_GROUPS.includes(g)) delete capped[g];
  // The referrals-only demo (lib/features.ts) shows only her uploads and referral letters.
  const shown = entries.filter((e): e is FileEntry => e !== null && fileKindEnabled(e.card.kind));
  return { entries: sortFiles(shown), capped };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One file by its card id, for the Open panel: reads only that row. Null when it isn't a file or is gone. */
export async function getFile(id: string): Promise<FileEntry | null> {
  const at = id.indexOf(":");
  const kind = id.slice(0, at);
  const key = id.slice(at + 1);
  const uuid = UUID.test(key);
  if (!fileKindEnabled(kind)) return null; // hidden in the referrals-only demo (lib/features.ts)
  switch (kind) {
    case "uploaded": {
      const d = uuid ? await getStoredDocument(key) : null;
      return d ? toFileEntry(uploadedCard(d), d.created_at) : null;
    }
    case "gfe": {
      const e = uuid ? await getEstimate(key) : null;
      return e ? toFileEntry(gfeCard(e, await practiceToday()), e.created_at) : null;
    }
    case "superbill": {
      const b = uuid ? await getSuperbill(key) : null;
      return b ? toFileEntry(superbillCard(b), b.created_at) : null;
    }
    case "payer_application": {
      const a = uuid ? (await listPayerApplications()).find((x) => x.id === key && x.form === "cms855i") : undefined;
      return a ? toFileEntry(payerCard(a, await practiceToday()), a.created_at ?? null) : null;
    }
    case "referral_letter": {
      const [l] = uuid ? await listReferralLetters(1, key) : [];
      return l ? toFileEntry(referralLetterCard(l), l.created_at) : null;
    }
    case "cms855i":
    case "client_form":
    case "release_form": {
      // Templates and the prepared Medicare form: no row of their own, no date.
      const card = await openDocument(id);
      return card ? toFileEntry(card, null) : null;
    }
    default:
      return null;
  }
}
