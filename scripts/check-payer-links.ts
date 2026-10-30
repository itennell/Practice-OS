// npx tsx scripts/check-payer-links.ts: a MANUAL check (it opens real payer
// sites, so it never runs in CI or npm test). For every official link in the
// payer catalog (data/payers) it lists the ones that don't load, and for every
// sourced fact it looks for the fact's quote in the fetched page text
// (normalized: tags stripped, entities decoded, quotes, dashes and spaces
// folded, case ignored). A fact marked verified whose quote isn't on its page is
// reported as a mismatch: set its verified to false (or fix the quote) before it
// ships. The script only reports; it never marks anything verified. Many payer
// sites refuse scripts (403) while working in a browser, so those are listed
// apart as "check by hand", not as broken.
import { allPayers, prerequisites, stateLicenses, taxonomyFor, type Source } from "../lib/payers/catalog";
import { CREDENTIALS } from "../lib/compliance/types";

const urls = new Map<string, string[]>();
const add = (url: string | null, where: string) => {
  if (url) urls.set(url, [...(urls.get(url) ?? []), where]);
};
/** Every sourced fact, with where it lives, so its quote can be looked for on its page. */
const facts: { where: string; source: Source }[] = [];
const fact = (source: Source | null, where: string) => {
  if (!source) return;
  facts.push({ where, source });
  add(source.url, where);
};

for (const p of allPayers()) {
  for (const s of p.steps) {
    add(s.portal_url, `${p.id}/${s.id}`);
    fact(s.source, `${p.id}/${s.id} source`);
  }
  for (const n of p.networks) fact(n.panel.source, `${p.id}/${n.id} panel`);
  for (const k of ["requirements", "timeline", "fees", "recredential"] as const) fact(p[k].source, `${p.id} ${k}`);
  for (const c of CREDENTIALS) fact(p.eligibility[c].source, `${p.id} eligibility ${c}`);
  p.notes.forEach((n, i) => fact(n.source, `${p.id} note ${i + 1}`));
}
for (const p of prerequisites()) {
  add(p.portal_url, `prerequisites/${p.id}`);
  fact(p.source, `prerequisites/${p.id} source`);
}
for (const c of CREDENTIALS) fact(taxonomyFor(c).source, `taxonomy ${c}`);
for (const r of stateLicenses()) fact(r.source, `state license ${r.state} ${r.license}`);

/** Lowercase plain words: what both the page and the quote are compared as. */
export function normalizeText(s: string): string {
  return s
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;|&#8217;|&#8216;/gi, "'")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/gi, '"')
    .replace(/&ndash;|&mdash;|&#8211;|&#8212;/gi, "-")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/ /g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9$%'"-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Page = { status: number | string; text: string | null };

async function open(url: string): Promise<Page> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Mozilla/5.0 (Practice-OS link check)" } });
    if (!res.ok) return { status: res.status, text: null };
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
      const { text } = await extractText(pdf, { mergePages: true });
      return { status: res.status, text: normalizeText(text) };
    }
    return { status: res.status, text: normalizeText(await res.text()) };
  } catch (err) {
    return { status: err instanceof Error ? err.message : "failed", text: null };
  }
}

const pages = new Map(await Promise.all([...urls.keys()].map(async (u) => [u, await open(u)] as const)));
const results = [...pages].map(([u, p]) => ({ u, s: p.status }));
// A site that drops script connections (Humana) reads as "fetch failed": check those by hand too.
const broken = results.filter((r) => r.s === 404 || r.s === 410);
const blocked = results.filter((r) => typeof r.s === "string" || (r.s >= 400 && r.s !== 404 && r.s !== 410));
console.log(`${results.length} links: ${results.length - broken.length - blocked.length} load, ${blocked.length} refuse scripts (check by hand), ${broken.length} broken.`);
for (const r of blocked) console.log(`  check by hand (${r.s}) ${r.u}`);
for (const r of broken) console.log(`  BROKEN (${r.s}) ${r.u}  <- ${urls.get(r.u)!.join(", ")}`);

// Quotes: a verified fact must have its quote on the page it cites.
const mismatched: string[] = [];
const unread: string[] = [];
let found = 0;
for (const f of facts.filter((x) => x.source.quote)) {
  const page = pages.get(f.source.url);
  if (!page?.text) {
    if (f.source.verified) unread.push(`${f.where}: ${f.source.url}`);
    continue;
  }
  if (page.text.includes(normalizeText(f.source.quote))) found++;
  else if (f.source.verified) mismatched.push(`${f.where}: "${f.source.quote}" not on ${f.source.url}`);
}
console.log(`Quotes: ${found} found on their page, ${mismatched.length} verified but NOT found, ${unread.length} verified on pages the script couldn't read (check by hand).`);
for (const m of mismatched) console.log(`  MISMATCH ${m}  -> set verified: false or fix the quote`);
for (const m of unread) console.log(`  check quote by hand ${m}`);
process.exit(broken.length || mismatched.length ? 1 : 0);
