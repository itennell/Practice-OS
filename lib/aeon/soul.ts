import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// aeon/SOUL.md: who Aeon is and the rules it never breaks (AGENTS.md > Aeon's memory).
// Read once per process; it goes into every Aeon model call.
export const SOUL_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../aeon/SOUL.md");

let cached: string | null = null;

export function soul(): string {
  cached ??= readFileSync(SOUL_PATH, "utf8");
  return cached;
}
