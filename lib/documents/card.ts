import { z } from "zod";

// A document as the chat, the MCP server and Admin all see it: one shape for every
// kind of paperwork Practice-OS holds or can make. Built by lib/documents/index.ts,
// returned by the find_documents / open_document / create_document tools, saved
// with the chat message (chat_messages.steps) and drawn by components/document-cards.tsx.
// No bytes and no client details: a card points at where the document lives.

export const DOCUMENT_KINDS = [
  "deadline",
  "gfe",
  "superbill",
  "release_form",
  "payer_application",
  "cms855i",
  "credentialing_profile",
  "credential_doc",
  "caqh_checklist",
  "guide",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const KIND_LABEL: Record<DocumentKind, string> = {
  deadline: "Deadline",
  gfe: "Good Faith Estimate",
  superbill: "Superbill",
  release_form: "Release of information",
  payer_application: "Insurance application",
  cms855i: "Medicare enrollment form",
  credentialing_profile: "Credentialing profile",
  credential_doc: "Credentialing document",
  caqh_checklist: "CAQH checklist",
  guide: "How-do-I guide",
};

/** A link inside the app: one leading slash, never "//" (another site) or a backslash. */
const appPath = z
  .string()
  .max(300)
  .regex(/^\/(?![/\\])[^\s\\]*$/, "an app path");

export const documentCardSchema = z.object({
  /** "<kind>:<key>", for open_document. */
  id: z.string().min(3).max(120),
  kind: z.enum(DOCUMENT_KINDS),
  title: z.string().max(160),
  /** One line under the title: dates, status, reference. */
  subtitle: z.string().max(240),
  status: z.string().max(60),
  due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  payer: z.string().max(120).nullable(),
  /** Words find_documents matches on. */
  topics: z.array(z.string().max(60)).max(20),
  /** Where it opens in the app, already filled in (an Admin side panel, the Deadlines page or a guide). */
  open: appPath,
  /** A GET link that downloads the PDF, when there is one. */
  pdf: appPath.nullable(),
  /** The official page a deadline or guide comes from. */
  // https:// only (never javascript: or another scheme), or a path inside the app.
  source: z.object({ label: z.string().max(160), href: z.union([z.string().url().max(500).regex(/^https:\/\//, "https only"), appPath]) }).nullable(),
  /** What only she can do with it, in plain words. */
  needs_her: z.string().max(300).nullable(),
  /** Practice-OS tracks it but doesn't hold the file: where the real one lives. */
  held_elsewhere: z.string().max(160).nullable(),
  is_sample: z.boolean(),
});
export type DocumentCard = z.infer<typeof documentCardSchema>;

export const documentCardsSchema = z.array(documentCardSchema).max(20);

/** Cards from a tool's structured result, or none. Anything malformed is dropped, never drawn. */
export function cardsFrom(structured: unknown): DocumentCard[] {
  const raw = (structured as { documents?: unknown } | null | undefined)?.documents;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c) => {
    const parsed = documentCardSchema.safeParse(c);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The fields Muse reads in a tool's text result: enough to talk about a card, not its whole shape. */
export function forModel(c: DocumentCard) {
  return {
    id: c.id,
    kind: c.kind,
    title: c.title,
    subtitle: c.subtitle,
    status: c.status,
    due_on: c.due_on,
    opens_at: c.open,
    has_pdf: c.pdf !== null,
    needs_her: c.needs_her,
    held_elsewhere: c.held_elsewhere,
    sample: c.is_sample,
  };
}
