// Prints the WCAG contrast table for every Caseload token pair, light and dark.
// Exits 1 if any pair is below AA. Run: npx tsx scripts/contrast.ts
import { readFileSync } from "node:fs";
import { checkAll } from "../lib/ui/contrast";

const results = checkAll(readFileSync(new URL("../app/globals.css", import.meta.url), "utf8"));
for (const r of results) {
  const mark = r.pass ? "pass" : "FAIL";
  console.log(`${mark}  ${r.theme.padEnd(5)}  ${r.ratio.toFixed(2).padStart(5)}:1  (min ${r.min})  ${r.label}`);
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} pairs meet WCAG AA.`);
process.exit(failed.length ? 1 : 0);
