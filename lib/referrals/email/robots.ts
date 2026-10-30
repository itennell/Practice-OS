// robots.txt, read the way RFC 9309 says (rfc-editor.org/rfc/rfc9309, checked
// 2026-10-29): our product token "Practice-OS" is matched without caring about
// case and every group that names it is merged; with none, the "*" group; with
// neither, everything is allowed. The longest matching rule wins, Allow wins a
// tie, "*" matches anything and "$" ends a rule. Paths keep their case. Only
// the first 500 KiB is read. A missing robots.txt (4xx) means "no rules"; a
// server error or no answer at all means Aeon stays out.

export const PRODUCT_TOKEN = "Practice-OS";
const MAX_BYTES = 500 * 1024;

export type RobotsRule = { allow: boolean; path: string };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[] };
export type RobotsRules = { groups: RobotsGroup[] };

export type RobotsPolicy = {
  /** rules: a robots.txt was read; none: there isn't one; unreachable: it couldn't be read. */
  mode: "rules" | "none" | "unreachable";
  rules: RobotsRules;
};

export type RobotsDecision = { allowed: boolean; reason: string };

/** Cut to the first 500 KiB (counted in UTF-8 bytes), at a line break. */
function first500KiB(text: string): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= MAX_BYTES) return text;
  const cut = new TextDecoder().decode(bytes.slice(0, MAX_BYTES));
  const lastBreak = cut.lastIndexOf("\n");
  return lastBreak >= 0 ? cut.slice(0, lastBreak) : "";
}

export function parseRobots(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  // A run of user-agent lines opens one group; a user-agent line after rules opens the next.
  let lastWasAgent = false;
  for (const raw of first500KiB(text).split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      // An empty Disallow means "nothing is off limits", so it adds no rule.
      if (!current || !value) continue;
      current.rules.push({ allow: key === "allow", path: value });
    } else {
      // Sitemap, crawl-delay and other lines don't end a run of user-agent lines.
    }
  }
  return { groups };
}

/** The product token in a user-agent line: "Practice-OS/0.1" names "practice-os". */
function agentMatches(line: string, agent: string): boolean {
  const token = line.split(/[\s/]/)[0];
  return token === agent.toLowerCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function ruleMatches(rulePath: string, path: string): boolean {
  const anchored = rulePath.endsWith("$");
  const body = anchored ? rulePath.slice(0, -1) : rulePath;
  const pattern = body.split("*").map(escapeRegex).join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

function rulesFor(rules: RobotsRules, agent: string): RobotsRule[] | null {
  const ours = rules.groups.filter((g) => g.agents.some((a) => agentMatches(a, agent)));
  if (ours.length) return ours.flatMap((g) => g.rules);
  const star = rules.groups.filter((g) => g.agents.includes("*"));
  if (star.length) return star.flatMap((g) => g.rules);
  return null;
}

/** The rule that decides a path, or null when none matches (so it's allowed). */
export function decidingRule(rules: RobotsRules, path: string, agent = PRODUCT_TOKEN): RobotsRule | null {
  const list = rulesFor(rules, agent);
  if (!list) return null;
  let best: RobotsRule | null = null;
  for (const rule of list) {
    if (!ruleMatches(rule.path, path)) continue;
    const longer = !best || rule.path.length > best.path.length;
    const tieAllow = best && rule.path.length === best.path.length && rule.allow && !best.allow;
    if (longer || tieAllow) best = rule;
  }
  return best;
}

export function robotsAllows(rules: RobotsRules, path: string, agent = PRODUCT_TOKEN): boolean {
  if (path === "/robots.txt") return true; // always readable (RFC 9309 §2.2.2)
  const rule = decidingRule(rules, path, agent);
  return rule ? rule.allow : true;
}

/**
 * What a robots.txt answer means: 2xx is read, 4xx means there is no
 * robots.txt (anything goes), 5xx or no answer (status 0 or null) means stay out.
 */
export function robotsDecision(status: number | null, text = ""): RobotsPolicy {
  if (status && status >= 200 && status < 300) return { mode: "rules", rules: parseRobots(text) };
  if (status && status >= 400 && status < 500) return { mode: "none", rules: { groups: [] } };
  return { mode: "unreachable", rules: { groups: [] } };
}

/** May Aeon read this path, and why, in plain words. */
export function robotsCheck(policy: RobotsPolicy, path: string, agent = PRODUCT_TOKEN): RobotsDecision {
  if (policy.mode === "none") return { allowed: true, reason: "the site has no robots.txt" };
  if (policy.mode === "unreachable") {
    return { allowed: false, reason: "the site's robots.txt couldn't be read, so Aeon stays out" };
  }
  const allowed = robotsAllows(policy.rules, path, agent);
  return { allowed, reason: `robots.txt ${allowed ? "allows" : "disallows"} ${path}` };
}
