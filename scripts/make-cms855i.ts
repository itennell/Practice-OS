import { mkdir, writeFile } from "node:fs/promises";
import { DANA_PROFILE } from "../lib/credentialing/demo";
import { fillCms855i } from "../lib/payers/cms855i";

// Writes the [Sample] CMS-855I prepared from Dana's demo profile to test/ (gitignored).
const dir = process.argv[2] ?? "test";
await mkdir(dir, { recursive: true });
const r = await fillCms855i(DANA_PROFILE);
await writeFile(`${dir}/cms855i-sample.pdf`, r.bytes);
console.log(`Wrote ${dir}/cms855i-sample.pdf: ${r.filled.length} filled, ${r.skipped.length} skipped${r.skipped.length ? ` (${r.skipped.join(", ")})` : ""}`);
