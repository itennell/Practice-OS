import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";
import { db } from "../db";
import type { DocKind } from "./classify";
import { EXT, type Mime } from "./read";

// Documents she added in the chat: the file on her own computer, in
// PRACTICE_OS_DATA_DIR/documents/<id>.<ext> (owner-only), and one row in
// practice_os.documents (migration 018) so Aeon can find it again. The file is
// named by the row's id, never by her filename.

/** Same folder as lib/local-db.ts dataDir(); repeated here so routes don't load the database binaries. */
export function dataDir(): string {
  return process.env.PRACTICE_OS_DATA_DIR || path.join(process.cwd(), ".data");
}

export type StoredDocument = {
  id: string;
  kind: DocKind;
  title: string;
  mime: Mime;
  size_bytes: number;
  sha256: string;
  stored_as: string;
  summary: string | null;
  payer: string | null;
  status: "kept" | "filed";
  approval_id: string | null;
  created_by: string;
  is_sample: boolean;
  created_at: Date;
};

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function findByHash(hash: string, sql: postgres.Sql = db()): Promise<StoredDocument | null> {
  const [row] = await sql<StoredDocument[]>`select * from practice_os.documents where sha256 = ${hash}`;
  return row ?? null;
}

export async function getStoredDocument(id: string, sql: postgres.Sql = db()): Promise<StoredDocument | null> {
  const [row] = await sql<StoredDocument[]>`select * from practice_os.documents where id = ${id}`;
  return row ?? null;
}

export async function listStoredDocuments(limit = 50, sql: postgres.Sql = db()): Promise<StoredDocument[]> {
  return sql<StoredDocument[]>`select * from practice_os.documents order by created_at desc limit ${limit}`.catch(() => []);
}

/** Writes the file first, then the row; a row never points at a file that isn't there. */
export async function keepDocument(
  input: { bytes: Uint8Array; mime: Mime; kind: DocKind; title: string; summary: string; payer: string | null; createdBy: string },
  sql: postgres.Sql = db(),
): Promise<StoredDocument> {
  const [{ id }] = await sql<{ id: string }[]>`select gen_random_uuid()::text as id`;
  const storedAs = `documents/${id}.${EXT[input.mime]}`;
  const folder = path.join(dataDir(), "documents");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await chmod(folder, 0o700);
  await writeFile(path.join(dataDir(), storedAs), input.bytes, { mode: 0o600, flag: "wx" });
  const [row] = await sql<StoredDocument[]>`
    insert into practice_os.documents (id, kind, title, mime, size_bytes, sha256, stored_as, summary, payer, created_by)
    values (${id}, ${input.kind}, ${input.title}, ${input.mime}, ${input.bytes.length}, ${sha256(input.bytes)}, ${storedAs},
            ${input.summary || null}, ${input.payer}, ${input.createdBy})
    returning *`;
  return row;
}

export async function setApproval(id: string, approvalId: string, sql: postgres.Sql = db()): Promise<void> {
  await sql`update practice_os.documents set approval_id = ${approvalId} where id = ${id}`;
}

/** The kept file's bytes, or null when it is missing on this computer (the Vercel copy has none). */
export async function readStoredFile(doc: Pick<StoredDocument, "stored_as">): Promise<Buffer | null> {
  if (!/^documents\/[0-9a-f-]{36}\.(pdf|docx|txt)$/.test(doc.stored_as)) return null;
  return readFile(path.join(dataDir(), doc.stored_as)).catch(() => null);
}
