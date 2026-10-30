// The Media helper's field schema, read from the research file so the limits live
// in one place (docs/research/media-presence.json, docs/research.md > Media presence).
import research from "../../docs/research/media-presence.json";

export type PtField = {
  id: string;
  label: string;
  section: string;
  kind: "text" | "facts" | "pick" | "toggle" | "media" | "others";
  limit: number | null;
  limitSource?: string;
  showsOnSearchCard: boolean;
  drivesFilter: boolean;
  draft: "aeon" | "facts" | "her" | "none";
  pasteWhere?: string;
  note?: string;
  count?: number;
};

export type Directory = {
  id: string;
  name: string;
  cost: string;
  forWho: string;
  api: string;
  descriptionLimit: number | null;
  rules?: string[];
  sources: string[];
  reuse: string[];
  difference: string;
};

export const PT_FIELDS = research.psychologyToday.fields as PtField[];
export const PT_TEXT_FIELDS = PT_FIELDS.filter((f) => f.kind === "text" && f.limit !== null) as (PtField & { limit: number })[];
export type PtTextId = "statement_help" | "statement_approach" | "statement_about" | "intro" | "note_finance" | "note_credentials" | "note_top_specialties" | "note_therapy_types";
export const TEXT_IDS = PT_TEXT_FIELDS.map((f) => f.id) as PtTextId[];

export const LIMIT: Record<PtTextId, number> = Object.fromEntries(PT_TEXT_FIELDS.map((f) => [f.id, f.limit])) as Record<PtTextId, number>;

/** How much of the first box shows on the search results card. */
export const HOOK_CHARS = research.psychologyToday.searchCard.hookChars;

export const DIRECTORIES = research.directories as Directory[];
export const PT_PRICE = research.psychologyToday.price.text;
export const PT_TERMS_URL = research.psychologyToday.terms.source;

export type ChecklistItem = { id: string; label: string; source?: string };
export const WEBSITE = research.website as {
  default: { id: string; name: string; cost: string; why: string; sources: string[] };
  alreadyHasOne: string;
  doneForYou: { name: string; cost: string; source: string };
  doItYourself: { name: string; cost: string; why: string; sources: string[] };
  meta: { hasSiteBuilder: boolean; note: string; source: string };
  hipaa: string;
  pages: string[];
  checklist: ChecklistItem[];
};

export type PtListId = "specialties" | "therapyTypes" | "ages" | "participants" | "communities" | "faith" | "paymentMethods" | "sessionFormat";
type PtList = { confidence: string; sources: string[]; options: string[]; note?: string };
/** Psychology Today's pick-list wording, so her chips match its search filters. */
export const PT_LISTS = research.psychologyToday.pickLists.lists as Record<PtListId, PtList>;
export const PT_LISTS_CHECKED = research.psychologyToday.pickLists.checked;
