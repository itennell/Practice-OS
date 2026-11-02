import { practiceToday } from "../compliance/store";
import { loadCredentialingProfile } from "../credentialing/store";
import { listEstimates } from "../gfe/store";
import { listPayerApplications } from "../payers/store";
import { listSuperbills } from "../superbill/store";
import { listStoredDocuments } from "../uploads/store";
import { sortFiles, toFileEntry, type FileEntry } from "./file-entry";
import {
  clientFormCards,
  cms855iCard,
  gfeCard,
  instagramPostCard,
  listInstagramPosts,
  listReferralLetters,
  payerCard,
  referralLetterCard,
  releaseTemplateCards,
  superbillCard,
  uploadedCard,
} from "./index";

// Loads every file for the Files page (/files) from the same cards as the document
// index; the groups, sorting and search are in ./file-entry.ts.

export * from "./file-entry";

/** Every file, newest first. Each source is read on its own, so one that fails leaves the rest. */
export async function listFiles(): Promise<FileEntry[]> {
  const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const [today, uploads, estimates, bills, apps, profile, clientForms, letters, posts] = await Promise.all([
    practiceToday(),
    safe(listStoredDocuments(200), []),
    safe(listEstimates(100), []),
    safe(listSuperbills(100), []),
    safe(listPayerApplications(), []),
    safe(loadCredentialingProfile(), null),
    safe(clientFormCards(), []),
    safe(listReferralLetters(50), []),
    safe(listInstagramPosts(50), []),
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
    ...posts.map((p) =>
      toFileEntry(instagramPostCard(p), p.created_at, p.has_image ? { href: `/api/instagram/posts/${p.id}/image?download=1`, label: "Download picture" } : null),
    ),
  ];
  return sortFiles(entries.filter((e): e is FileEntry => e !== null));
}

/** One file by its card id, for the Open panel; null when it isn't a file or is gone. */
export async function getFile(id: string): Promise<FileEntry | null> {
  return (await listFiles()).find((e) => e.card.id === id) ?? null;
}
