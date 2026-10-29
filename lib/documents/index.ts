import { daysBetween, type ISODate } from "../compliance/dates";
import { practiceToday } from "../compliance/store";
import { deadlinesView, type ObligationView } from "../compliance/view";
import { currentCaqhPrep } from "../credentialing/actions";
import { CAQH_URL, niceDate } from "../credentialing/checklist";
import type { CredentialingProfile } from "../credentialing/profile";
import { loadCredentialingProfile } from "../credentialing/store";
import { money } from "../gfe/build";
import { SERVICE_KINDS, estimateStatus, getEstimate, listEstimates, type EstimateRow } from "../gfe/store";
import { allGuides, getGuide, type Guide } from "../guides";
import { CMS855I_SOURCE, LEFT_FOR_YOU } from "../payers/cms855i";
import { STATUS_LABEL, listPayerApplications, type PayerApplication } from "../payers/store";
import { getReleaseDraft } from "../release/drafts";
import type { ReleaseFields } from "../release/fields";
import { getSuperbill, listSuperbills, summarize, type SuperbillRow } from "../superbill/store";
import { DOCUMENT_KINDS, KIND_LABEL, type DocumentCard, type DocumentKind } from "./card";

// The document index: every kind of paperwork Admin holds or can make, read from its
// own store and turned into one DocumentCard shape. Nothing here is stored twice;
// each card is built from the live row when asked for. Admin side panels take
// ?focus=<id> to open on that item; Deadlines cards have #obligation-<id> anchors.

const card = (c: Omit<DocumentCard, "topics" | "source" | "needs_her" | "held_elsewhere" | "payer" | "due_on" | "pdf"> & Partial<DocumentCard>): DocumentCard => ({
  topics: [],
  source: null,
  needs_her: null,
  held_elsewhere: null,
  payer: null,
  due_on: null,
  pdf: null,
  ...c,
});

const words = (...parts: (string | null | undefined)[]) =>
  [...new Set(parts.filter(Boolean).join(" ").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1))].slice(0, 20);

function dueLine(due: ISODate | null, today: ISODate): string {
  if (!due) return "";
  const left = daysBetween(today, due);
  const when = left < 0 ? `${-left} days overdue` : left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`;
  return `Due ${niceDate(due)} (${when})`;
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function deadlineCard(o: ObligationView, today: ISODate): DocumentCard {
  return card({
    id: `deadline:${o.id}`,
    kind: "deadline",
    title: o.title,
    subtitle: [dueLine(o.due_on, today), o.what_to_do].filter(Boolean).join(" · ").slice(0, 240),
    status: o.urgency === "overdue" ? "Overdue" : o.urgency === "red" ? "Urgent" : o.due_on ? "Coming up" : "No date yet",
    due_on: o.due_on,
    topics: words(o.title, o.category, o.rule_id, o.jurisdiction, "deadline due"),
    open: `/admin/deadlines#obligation-${o.id}`,
    source: o.source_url ? { label: o.citation ?? host(o.source_url), href: o.source_url } : null,
    needs_her: o.you_must,
    is_sample: o.is_sample,
  });
}

export function gfeCard(e: EstimateRow, today: ISODate): DocumentCard {
  return card({
    id: `gfe:${e.id}`,
    kind: "gfe",
    title: `${e.reference}: ${SERVICE_KINDS[e.service_kind].toLowerCase()}, ${money(e.total_cents)}`,
    subtitle: [e.due_on && !e.issued_on ? dueLine(e.due_on, today) : null, e.issued_on ? `Issued ${niceDate(e.issued_on)}` : null]
      .filter(Boolean)
      .join(" · ") || "Good Faith Estimate",
    status: estimateStatus(e),
    due_on: e.issued_on ? null : e.due_on,
    topics: words(e.reference, "good faith estimate gfe self pay no surprises", e.service_kind),
    open: `/admin?panel=gfe&focus=${e.id}`,
    // The PDF carries the client's name, which she types in the panel; it has no plain link.
    needs_her: e.approval_status === "pending" ? "Approve it in Approvals, then type the client's details in the panel to make the PDF." : "Type the client's details in the panel to make the PDF.",
    is_sample: e.is_sample,
  });
}

export function superbillCard(b: SuperbillRow): DocumentCard {
  return card({
    id: `superbill:${b.id}`,
    kind: "superbill",
    title: `${b.reference}: ${b.lines.length} ${b.lines.length === 1 ? "session" : "sessions"}, ${money(b.total_cents)}`,
    subtitle: `${summarize(b.lines)} · Paid ${money(b.paid_cents)}`.slice(0, 240),
    status: b.issued_on ? "Given to client" : "Ready for you",
    topics: words(b.reference, "superbill out of network reimbursement statement"),
    open: `/admin?panel=superbill&focus=${b.id}`,
    pdf: `/api/superbills/${b.id}/pdf`,
    needs_her: b.issued_on ? null : "Fill in the client's name, birth date, address and diagnosis codes, sign it, then give it to them.",
    is_sample: b.is_sample,
  });
}

/** A release form Aeon filled in the chat: its boxes wait in memory for 30 minutes. */
export function releaseDraftCard(draftId: string, fields: ReleaseFields, isSample: boolean): DocumentCard {
  return card({
    id: `release_form:draft:${draftId}`,
    kind: "release_form",
    title: "Release of information (filled)",
    subtitle: [fields.recipient && `To ${fields.recipient}`, `Ends ${niceDate(fields.expires_on)}`].filter(Boolean).join(" · ").slice(0, 240),
    status: "Ready for you",
    topics: words("release of information roi consent illinois form", fields.recipient),
    open: `/admin?panel=release&draft=${draftId}`,
    pdf: `/api/release-forms/pdf?draft=${draftId}`,
    needs_her: "Type the client's name and birth date, then have it signed. Keep a copy in the client's record.",
    is_sample: isSample,
  });
}

function releaseTemplateCards(isSample: boolean): DocumentCard[] {
  return [
    card({
      id: "release_form:blank",
      kind: "release_form",
      title: "Release of information (blank)",
      subtitle: "Illinois consent to release mental health information (740 ILCS 110/5)",
      status: "Template",
      topics: words("release of information roi consent illinois blank form template"),
      open: "/admin?panel=release",
      pdf: "/api/release-forms/pdf?kind=blank",
      is_sample: isSample,
    }),
    card({
      id: "release_form:revocation",
      kind: "release_form",
      title: "Revocation of consent",
      subtitle: "For a client who wants to take back a release",
      status: "Template",
      topics: words("revocation revoke consent release form template"),
      open: "/admin?panel=release",
      pdf: "/api/release-forms/pdf?kind=revocation",
      is_sample: isSample,
    }),
  ];
}

export function payerCard(a: PayerApplication, today: ISODate): DocumentCard {
  const next = a.follow_up_on ?? a.recredential_on;
  return card({
    id: `payer_application:${a.id}`,
    kind: "payer_application",
    title: `${a.payer} application`,
    subtitle: [STATUS_LABEL[a.status], a.reference, next ? dueLine(next, today).replace("Due", a.follow_up_on ? "Follow up" : "Recredential") : null]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 240),
    status: STATUS_LABEL[a.status],
    due_on: next,
    payer: a.payer,
    topics: words(a.payer, a.reference, a.status, "insurance payer application credentialing enrollment", a.form === "cms855i" ? "medicare cms 855i pecos" : null),
    open: "/admin?panel=insurance",
    pdf: a.form === "cms855i" ? "/api/payers/cms855i" : null,
    needs_her: a.follow_up_on ? `Call ${a.payer} or check their portal${a.reference ? ` with reference ${a.reference}` : ""}.` : null,
    is_sample: a.is_sample,
  });
}

export function cms855iCard(p: CredentialingProfile): DocumentCard {
  return card({
    id: "cms855i:prepared",
    kind: "cms855i",
    title: "Medicare CMS-855I (prepared)",
    subtitle: "Filled from your credentialing profile. You finish, sign and submit it, or apply in PECOS.",
    status: "Ready for you",
    payer: "Medicare",
    topics: words("medicare cms 855i enrollment pecos payer form application"),
    open: "/admin?panel=insurance",
    pdf: "/api/payers/cms855i",
    source: { label: "CMS-855I on cms.gov", href: CMS855I_SOURCE },
    needs_her: `Left for you: ${LEFT_FOR_YOU.slice(0, 4).join("; ")}.`.slice(0, 300),
    is_sample: p.isSample,
  });
}

export function credentialingCards(p: CredentialingProfile, today: ISODate): DocumentCard[] {
  const profile = card({
    id: "credentialing_profile:main",
    kind: "credentialing_profile",
    title: "Credentialing profile",
    subtitle: `${p.identity.name}, ${p.identity.credential} · ${p.identity.practiceName}`.slice(0, 240),
    status: "On file",
    topics: words("credentialing profile caqh proview npi tax id malpractice work history"),
    open: "/admin?panel=credentialing",
    is_sample: p.isSample,
  });
  const docs = p.documents.map((d) => {
    const expiring = d.expiresOn !== null && daysBetween(today, d.expiresOn) <= 60;
    return card({
      id: `credential_doc:${d.id}`,
      kind: "credential_doc",
      title: d.label,
      subtitle: [d.onFile ? "On file" : "Missing", d.expiresOn ? `Expires ${niceDate(d.expiresOn)}` : null].filter(Boolean).join(" · "),
      status: !d.onFile ? "Missing" : expiring ? "Expiring" : "On file",
      due_on: d.expiresOn,
      topics: words(d.id, d.label, "credentialing document file"),
      open: "/admin?panel=credentialing",
      needs_her: !d.onFile ? `Upload ${d.upload} in CAQH ProView.` : expiring ? `Upload ${d.upload} in CAQH ProView before it expires.` : null,
      // Practice-OS keeps only whether it's on file; the file itself is in CAQH ProView.
      held_elsewhere: `CAQH ProView (${host(CAQH_URL)})`,
      is_sample: p.isSample,
    });
  });
  return [profile, ...docs];
}

export async function caqhCard(): Promise<DocumentCard | null> {
  const caqh = await currentCaqhPrep();
  if (!caqh) return null;
  const left = caqh.prep.items.filter((i) => !i.done);
  return card({
    id: "caqh_checklist:current",
    kind: "caqh_checklist",
    title: "CAQH re-attestation checklist",
    subtitle: [caqh.prep.attestBy ? `Attest by ${niceDate(caqh.prep.attestBy)}` : null, `${left.length} ${left.length === 1 ? "thing" : "things"} to fix first`]
      .filter(Boolean)
      .join(" · "),
    status: left.length ? "Needs you" : "Ready to attest",
    due_on: caqh.prep.attestBy,
    topics: words("caqh proview reattest re-attest attestation checklist credentialing"),
    open: "/admin?panel=credentialing",
    source: { label: "CAQH ProView", href: CAQH_URL },
    needs_her: caqh.prep.finalStep,
    is_sample: caqh.isSample,
  });
}

export function guideCard(g: Guide): DocumentCard {
  return card({
    id: `guide:${g.slug}`,
    kind: "guide",
    title: g.title,
    subtitle: g.summary.slice(0, 240),
    status: "Guide",
    topics: words(g.slug, g.title, "how do i guide steps"),
    open: `/admin/how-do-i/${g.slug}`,
    source: { label: host(g.official_url), href: g.official_url },
    is_sample: false,
  });
}

/** Every document Practice-OS holds or can make, built from the live rows. */
export async function allDocuments(): Promise<DocumentCard[]> {
  const today = await practiceToday();
  const [deadlines, estimates, bills, apps, profile, caqh] = await Promise.all([
    deadlinesView(365),
    listEstimates(20),
    listSuperbills(20).catch(() => []),
    listPayerApplications(),
    loadCredentialingProfile(),
    caqhCard(),
  ]);
  return [
    ...deadlines.due.map((o) => deadlineCard(o, today)),
    ...apps.map((a) => payerCard(a, today)),
    ...(caqh ? [caqh] : []),
    ...(profile ? credentialingCards(profile, today) : []),
    ...(profile && !apps.some((a) => a.form === "cms855i") ? [cms855iCard(profile)] : []),
    ...estimates.map((e) => gfeCard(e, today)),
    ...bills.map(superbillCard),
    ...releaseTemplateCards(profile?.isSample ?? false),
    ...allGuides().map(guideCard),
  ];
}

// Words she might use for a kind, so "the Medicare form" or "insurance" finds it.
const KIND_WORDS: Record<DocumentKind, string[]> = {
  deadline: ["deadline", "deadlines", "due", "week", "renewal", "renew"],
  gfe: ["gfe", "estimate", "estimates", "faith"],
  superbill: ["superbill", "superbills", "bill", "reimbursement"],
  release_form: ["release", "roi", "consent", "revocation"],
  payer_application: ["payer", "insurance", "application", "applications", "insurer", "enrollment", "credentialing"],
  cms855i: ["medicare", "855i", "cms", "pecos", "form"],
  credentialing_profile: ["credentialing", "profile", "caqh"],
  credential_doc: ["document", "documents", "caqh", "malpractice", "w9", "license", "cv", "diploma", "credentialing"],
  caqh_checklist: ["caqh", "attest", "reattest", "attestation", "checklist"],
  guide: ["how", "guide", "steps"],
};

export type FindQuery = { query?: string; kind?: DocumentKind; payer?: string; due_within_days?: number };

const NEEDS_HER = new Set(["Missing", "Expiring", "Needs you", "Urgent", "Overdue", "Waiting for you"]);

// Words in her question that say nothing about which document she means.
const STOPWORDS = new Set(
  "the a an and or of for to in on at by my me i we you it is are be do can could would will please need needs show pull up find get see give all any some this that these those what which where here there chat with from about have has".split(" "),
);
// "Show me the documents" names no document in particular: answer it like an empty search.
const GENERIC = new Set(["document", "documents", "docs", "doc", "forms", "paperwork", "files", "file", "papers"]);

/** Plain-code ranking: word matches first, then the soonest date. No model call. */
export function rankDocuments(docs: DocumentCard[], q: FindQuery, today: ISODate, limit = 8): DocumentCard[] {
  const terms = words(q.query).filter((t) => !STOPWORDS.has(t) && !GENERIC.has(t));
  const payer = q.payer?.toLowerCase().replace(/[^a-z0-9]/g, "");
  const scored = docs
    .filter((d) => !q.kind || d.kind === q.kind)
    .filter((d) => {
      if (!payer) return true;
      const p = (d.payer ?? d.title).toLowerCase().replace(/[^a-z0-9]/g, "");
      return p.includes(payer) || payer.includes(p.slice(0, Math.max(4, payer.length)));
    })
    .filter((d) => q.due_within_days === undefined || (d.due_on !== null && daysBetween(today, d.due_on) <= q.due_within_days))
    .map((d) => {
      const hay = [...new Set([...d.topics, ...words(d.title, d.subtitle, d.payer)])];
      // "bcbs" finds "bcbsil": a word of 4 or more letters matches the start of a longer one.
      const hit = (t: string) => hay.some((w) => w === t || (t.length >= 4 && w.startsWith(t)));
      const matched = terms.reduce((n, t) => n + (hit(t) ? 2 : 0) + (KIND_WORDS[d.kind].includes(t) ? 1 : 0), 0);
      // Among matches, what needs her comes first: a missing file before one on file.
      return { d, score: matched > 0 && NEEDS_HER.has(d.status) ? matched + 1 : matched };
    })
    .filter(({ score }) => terms.length === 0 || score > 0);
  const soon = (d: DocumentCard) => (d.due_on ? daysBetween(today, d.due_on) : Number.MAX_SAFE_INTEGER);
  // At most 3 of one kind unless she asked for that kind, so five credentialing files can't hide the CAQH checklist.
  const perKind = new Map<DocumentKind, number>();
  return scored
    .sort((a, b) => b.score - a.score || soon(a.d) - soon(b.d))
    .filter(({ d }) => {
      const n = perKind.get(d.kind) ?? 0;
      perKind.set(d.kind, n + 1);
      return Boolean(q.kind) || n < 3;
    })
    .slice(0, limit)
    .map(({ d }) => d);
}

/** Her search; when her words match nothing (a typo, say), what's coming up soonest instead, marked matched: false. */
export async function findDocuments(q: FindQuery, limit = 8): Promise<{ cards: DocumentCard[]; matched: boolean }> {
  const [docs, today] = await Promise.all([allDocuments(), practiceToday()]);
  const cards = rankDocuments(docs, q, today, limit);
  if (cards.length || !q.query) return { cards, matched: true };
  return { cards: rankDocuments(docs, { ...q, query: undefined }, today, limit), matched: false };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One card by its id ("superbill:<uuid>", "guide:caqh-reattestation"), or null. */
export async function openDocument(id: string): Promise<DocumentCard | null> {
  const [kind, ...rest] = id.split(":");
  const key = rest.join(":");
  if (!(DOCUMENT_KINDS as readonly string[]).includes(kind)) return null;
  const today = await practiceToday();
  switch (kind as DocumentKind) {
    case "gfe": {
      const e = UUID.test(key) ? await getEstimate(key) : null;
      return e ? gfeCard(e, today) : null;
    }
    case "superbill": {
      const b = UUID.test(key) ? await getSuperbill(key) : null;
      return b ? superbillCard(b) : null;
    }
    case "release_form": {
      if (key.startsWith("draft:")) {
        const draftId = key.slice("draft:".length);
        const fields = getReleaseDraft(draftId);
        const profile = fields ? await loadCredentialingProfile() : null;
        return fields ? releaseDraftCard(draftId, fields, profile?.isSample ?? false) : null;
      }
      const profile = await loadCredentialingProfile();
      return releaseTemplateCards(profile?.isSample ?? false).find((c) => c.id === id) ?? null;
    }
    case "guide": {
      const g = /^[a-z0-9-]+$/.test(key) ? getGuide(key) : null;
      return g ? guideCard(g) : null;
    }
    default:
      return (await allDocuments()).find((c) => c.id === id) ?? null;
  }
}

export { KIND_LABEL };
