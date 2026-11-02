import { lstat, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { MAX_BYTES } from "./read";
import { dataDir, sha256 } from "./store";

// `npm run db:reset` empties practice_os.documents; this removes the files those
// rows pointed at, so a tester's upload doesn't stay on disk. It only ever
// touches two folders: <data dir>/documents (the file named by the row's id)
// and <data dir>/inbox (a file there whose bytes match a removed row). Never
// anything else, never a link's target, and a missing file is fine.

const STORED = /^documents\/[0-9a-f-]{36}\.(pdf|docx|txt)$/;

export type RemovedDocument = { stored_as: string; sha256: string };

export async function removeDocumentFiles(rows: RemovedDocument[], dir: string = dataDir()): Promise<{ documents: number; inbox: number }> {
  const documentsDir = path.join(dir, "documents");
  const inboxDir = path.join(dir, "inbox");
  let documents = 0;
  let inbox = 0;

  for (const row of rows) {
    if (!STORED.test(row.stored_as)) continue;
    const file = path.join(dir, row.stored_as);
    if (path.dirname(file) !== documentsDir) continue;
    const info = await lstat(file).catch(() => null);
    if (!info || !(info.isFile() || info.isSymbolicLink())) continue;
    if (await unlink(file).then(() => true, () => false)) documents++;
  }

  const hashes = new Set(rows.map((r) => r.sha256));
  if (hashes.size) {
    const entries = await readdir(inboxDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile()) continue; // not links, not folders
      const file = path.join(inboxDir, entry.name);
      const info = await lstat(file).catch(() => null);
      if (!info?.isFile() || info.size > MAX_BYTES) continue;
      const bytes = await readFile(file).catch(() => null);
      if (!bytes || !hashes.has(sha256(bytes))) continue;
      if (await unlink(file).then(() => true, () => false)) inbox++;
    }
  }
  return { documents, inbox };
}
