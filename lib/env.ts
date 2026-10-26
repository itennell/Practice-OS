import path from "node:path";
import { config } from "dotenv";

// Next.js loads .env on its own. Scripts and the MCP server call this instead.
// quiet: true keeps dotenv off stdout, which the MCP stdio protocol owns.
export function loadEnv(root: string = process.cwd()) {
  config({ path: path.join(root, ".env"), quiet: true });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Add it to .env (see .env.example).`);
  }
  return value;
}

// Executors log instead of acting unless DRY_RUN is explicitly "false".
export function isDryRun(): boolean {
  return process.env.DRY_RUN !== "false";
}
