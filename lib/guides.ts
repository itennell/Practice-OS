import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// How-do-i guides live as skill reference pages in skills/admin/references/*.md
// so any agent can read the same files the app renders. The format is small on
// purpose: frontmatter, "## " sections, and "1. " steps or "- " bullets. A step
// that starts with "[You]" is one only the clinician can do.

export const GUIDES_DIR = path.join(process.cwd(), "skills", "admin", "references");

export type GuideItem = { you: boolean; text: string };
export type GuideSection = { heading: string; ordered: boolean; items: GuideItem[] };
export type Guide = {
  slug: string;
  title: string;
  summary: string;
  official_url: string;
  last_verified: string;
  sources: { label: string; url: string }[];
  sections: GuideSection[];
};

export function parseGuide(slug: string, text: string): Guide {
  const fail = (msg: string): never => {
    throw new Error(`Guide ${slug}: ${msg}`);
  };
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return fail("missing frontmatter");
  const meta: Record<string, string> = {};
  const sources: Guide["sources"] = [];
  for (const line of m[1].split("\n")) {
    const src = line.match(/^\s+- (.+?) \| (https:\/\/\S+)$/);
    if (src) sources.push({ label: src[1], url: src[2] });
    else if (/^sources:\s*$/.test(line)) continue;
    else {
      const kv = line.match(/^([a-z_]+): (.+)$/);
      if (!kv) fail(`unreadable frontmatter line: ${line}`);
      else meta[kv[1]] = kv[2];
    }
  }
  for (const key of ["title", "summary", "official_url", "last_verified"]) if (!meta[key]) fail(`missing ${key}`);
  if (!meta.official_url.startsWith("https://")) fail("official_url must be https");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.last_verified)) fail("last_verified must be YYYY-MM-DD");
  if (sources.length === 0) fail("needs at least one source");

  const sections: GuideSection[] = [];
  for (const raw of m[2].split("\n")) {
    const line = raw.trimEnd();
    if (line === "") continue;
    const heading = line.match(/^## (.+)$/);
    const step = line.match(/^\d+\. (.+)$/);
    const bullet = line.match(/^- (.+)$/);
    if (heading) {
      sections.push({ heading: heading[1], ordered: false, items: [] });
      continue;
    }
    const current = sections.at(-1) ?? fail(`text before the first section: ${line}`);
    const body = step?.[1] ?? bullet?.[1] ?? fail(`unreadable line: ${line}`);
    if (step) current.ordered = true;
    const you = body.startsWith("[You] ");
    current.items.push({ you, text: you ? body.slice(6) : body });
  }
  if (!sections.some((s) => s.ordered)) fail("needs a numbered steps section");

  return {
    slug,
    title: meta.title,
    summary: meta.summary,
    official_url: meta.official_url,
    last_verified: meta.last_verified,
    sources,
    sections,
  };
}

export function guideSlugs(): string[] {
  return readdirSync(GUIDES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .sort();
}

export function getGuide(slug: string): Guide | null {
  if (!guideSlugs().includes(slug)) return null;
  return parseGuide(slug, readFileSync(path.join(GUIDES_DIR, `${slug}.md`), "utf8"));
}

export function allGuides(): Guide[] {
  return guideSlugs().map((s) => getGuide(s) as Guide);
}
