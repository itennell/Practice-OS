import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { describeProblems, installProblems } from "../scripts/check-install.mjs";

function project(installed: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "check-install-"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { mammoth: "1.12.3", unpdf: "1.8.1" }, devDependencies: { tsx: "4.23.15" } }));
  writeFileSync(
    path.join(root, "package-lock.json"),
    JSON.stringify({ packages: { "node_modules/mammoth": { version: "1.12.3" }, "node_modules/unpdf": { version: "1.8.1" }, "node_modules/tsx": { version: "4.23.15" } } }),
  );
  for (const [name, version] of Object.entries(installed)) {
    mkdirSync(path.join(root, "node_modules", name), { recursive: true });
    writeFileSync(path.join(root, "node_modules", name, "package.json"), JSON.stringify({ name, version }));
  }
  return root;
}

describe("check-install", () => {
  it("passes when node_modules matches the lock file", () => {
    expect(installProblems(project({ mammoth: "1.12.3", unpdf: "1.8.1", tsx: "4.23.15" }))).toEqual([]);
  });

  it("names a package a merge added but npm install never fetched (the Oct 29 break)", () => {
    const problems = installProblems(project({ tsx: "4.23.15", mammoth: "1.11.0" }));
    expect(problems).toEqual([
      { name: "mammoth", wanted: "1.12.3", found: "1.11.0" },
      { name: "unpdf", wanted: "1.8.1", found: null },
    ]);
    expect(describeProblems(problems)).toMatch(/unpdf: missing[\s\S]*npm install/);
  });

  it("passes on this repo's own install", () => {
    expect(installProblems()).toEqual([]);
  });
});
