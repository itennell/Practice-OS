// Runs before `npm run dev`, `npm run build` and `npm start` (package.json pre-scripts).
// After a merge that adds a package, every page broke until someone ran npm install
// (Oct 29: mammoth and unpdf). This compares package-lock.json with node_modules and
// stops with a plain message. Plain Node on purpose: it must work when node_modules
// is empty. Then, with everything installed, it checks the database (check-migrations.ts).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Direct dependencies missing from node_modules or at a different version than the lock file. */
export function installProblems(root = process.cwd()) {
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
  const problems = [];
  for (const name of names) {
    const wanted = lock.packages?.[`node_modules/${name}`]?.version;
    if (!wanted) continue; // not in the lock yet: npm install adds it, nothing to compare
    const file = path.join(root, "node_modules", name, "package.json");
    const found = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")).version ?? null) : null;
    if (found !== wanted) problems.push({ name, wanted, found });
  }
  return problems;
}

export function describeProblems(problems) {
  const list = problems
    .slice(0, 8)
    .map((p) => `  - ${p.name}: ${p.found ? `has ${p.found}, needs ${p.wanted}` : `missing (needs ${p.wanted})`}`)
    .join("\n");
  const more = problems.length > 8 ? `\n  ...and ${problems.length - 8} more` : "";
  return `Practice-OS needs an update before it can start: some packages are missing or out of date.\n${list}${more}\nRun this, then start the app again:\n  npm install`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = installProblems();
  if (problems.length) {
    console.error(describeProblems(problems));
    process.exit(1);
  }
  if (!process.env.VERCEL) spawnSync("npx", ["tsx", "scripts/check-migrations.ts"], { stdio: "inherit" });
}
