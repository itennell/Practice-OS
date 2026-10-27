import { mkdir, writeFile } from "node:fs/promises";
import { sampleGfe } from "../lib/gfe/demo";
import { renderGfePdf } from "../lib/gfe/pdf";

// Writes the [Sample] Good Faith Estimate to test/gfe-sample.pdf (test/ is gitignored).
const dir = process.argv[2] ?? "test";
await mkdir(dir, { recursive: true });
const path = `${dir}/gfe-sample.pdf`;
await writeFile(path, await renderGfePdf(sampleGfe()));
console.log(`Wrote ${path}`);
