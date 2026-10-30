// npx tsx scripts/check-payer-links.ts: opens every official link in the payer
// catalog (data/payers) and lists the ones that don't load. Many payer sites
// refuse scripts (403) while working in a browser, so those are listed apart
// as "check by hand", not as broken.
import { allPayers, prerequisites } from "../lib/payers/catalog";

const urls = new Map<string, string[]>();
const add = (url: string | null, where: string) => {
  if (url) urls.set(url, [...(urls.get(url) ?? []), where]);
};
for (const p of allPayers()) {
  for (const s of p.steps) {
    add(s.portal_url, `${p.id}/${s.id}`);
    add(s.source.url, `${p.id}/${s.id} source`);
  }
  for (const n of p.networks) add(n.panel.source.url, `${p.id}/${n.id} panel`);
  for (const k of ["requirements", "timeline", "fees", "recredential"] as const) add(p[k].source.url, `${p.id} ${k}`);
}
for (const p of prerequisites()) {
  add(p.portal_url, `prerequisites/${p.id}`);
  add(p.source.url, `prerequisites/${p.id} source`);
}

async function status(url: string): Promise<number | string> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "Mozilla/5.0 (Practice-OS link check)" } });
    return res.status;
  } catch (err) {
    return err instanceof Error ? err.message : "failed";
  }
}

const results = await Promise.all([...urls.keys()].map(async (u) => ({ u, s: await status(u) })));
// A site that drops script connections (Humana) reads as "fetch failed": check those by hand too.
const broken = results.filter((r) => r.s === 404 || r.s === 410);
const blocked = results.filter((r) => typeof r.s === "string" || (r.s >= 400 && r.s !== 404 && r.s !== 410));
console.log(`${results.length} links: ${results.length - broken.length - blocked.length} load, ${blocked.length} refuse scripts (check by hand), ${broken.length} broken.`);
for (const r of blocked) console.log(`  check by hand (${r.s}) ${r.u}`);
for (const r of broken) console.log(`  BROKEN (${r.s}) ${r.u}  <- ${urls.get(r.u)!.join(", ")}`);
process.exit(broken.length ? 1 : 0);
