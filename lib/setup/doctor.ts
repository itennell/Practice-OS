// `npm run doctor`: one plain-English line per piece of setup, the same facts
// INSTALL.md and the guided Connect cards check. Pure code here so every state
// is tested; scripts/doctor.ts gathers the facts. Never holds or prints a value
// of any key, only whether it is there.

export type CheckState = "ok" | "todo" | "later" | "problem";

export type SetupCheck = {
  id: string;
  label: string;
  state: CheckState;
  /** One plain sentence about where it stands. */
  say: string;
  /** What to do next, when there is something to do. */
  fix?: string;
  /** The app can't start (or Aeon can't answer) without it. */
  required: boolean;
};

export function nodeCheck(version: string): SetupCheck {
  const major = Number(/^v?(\d+)/.exec(version)?.[1] ?? 0);
  return major >= 20
    ? { id: "node", label: "Node", state: "ok", say: `Node ${version.replace(/^v/, "")} is installed.`, required: true }
    : {
        id: "node",
        label: "Node",
        state: "problem",
        say: major ? `Node ${version.replace(/^v/, "")} is too old.` : "Node isn't installed.",
        fix: "Install Node 20 or newer from nodejs.org (the LTS button), then run npm install again.",
        required: true,
      };
}

export function envFileCheck(exists: boolean): SetupCheck {
  return exists
    ? { id: "env", label: "Settings file", state: "ok", say: "The .env settings file is there.", required: true }
    : { id: "env", label: "Settings file", state: "problem", say: "There is no .env settings file yet.", fix: "Run: cp .env.example .env", required: true };
}

export type DatabaseFacts = { kind: "built-in" | "supabase"; reachable: boolean; error?: string };

export function databaseCheck(f: DatabaseFacts): SetupCheck {
  const label = "Database";
  if (f.reachable) {
    const where = f.kind === "built-in" ? "The built-in database on this computer" : "Your Supabase database";
    return { id: "database", label, state: "ok", say: `${where} is answering.`, required: true };
  }
  if (f.kind === "built-in") {
    return { id: "database", label, state: "todo", say: "The built-in database starts with the app.", fix: "Run npm run dev, then check again.", required: true };
  }
  return { id: "database", label, state: "problem", say: "Your Supabase database isn't answering.", fix: "Check DATABASE_URL in .env (use the Transaction pooler address).", required: true };
}

export function privacyModelCheck(present: boolean): SetupCheck {
  return present
    ? { id: "privacy-model", label: "Privacy checker", state: "ok", say: "The privacy checker that keeps client names out of Aeon is downloaded.", required: true }
    : {
        id: "privacy-model",
        label: "Privacy checker",
        state: "todo",
        say: "The privacy checker isn't downloaded yet, so Aeon's chat stays closed.",
        fix: "Run npm run models:download (about 108 MB, once).",
        required: true,
      };
}

/** A Connect card's state, from getConnectionStatus (null when the database isn't up yet). */
export type ConnectFacts = { connected: boolean; accountLabel?: string } | null;

export function museCheck(fromEnv: boolean, saved: ConnectFacts): SetupCheck {
  const base = { id: "muse", label: "Aeon's Muse key", required: true };
  if (fromEnv) return { ...base, state: "ok", say: "A Muse key is set in .env." };
  if (saved?.connected) return { ...base, state: "ok", say: `Her Muse key is saved${saved.accountLabel ? ` (${saved.accountLabel})` : ""}.` };
  return { ...base, state: "todo", say: "No Muse key yet, so Aeon can't answer.", fix: "In the app: Settings › Connections › Aeon (Meta Muse). See docs/self-hosting/muse.md." };
}

export function calcomCheck(saved: ConnectFacts): SetupCheck {
  const base = { id: "calcom", label: "Cal.com (consult times)", required: false };
  if (saved?.connected) return { ...base, state: "ok", say: `Cal.com is connected${saved.accountLabel ? ` (${saved.accountLabel})` : ""}.` };
  return { ...base, state: "later", say: "Cal.com isn't connected. Only Front Desk needs it.", fix: "Settings › Connections › Cal.com. See docs/self-hosting/calcom.md." };
}

export function phoneCheck(saved: ConnectFacts): SetupCheck {
  const base = { id: "phone", label: "Practice phone", required: false };
  if (saved?.connected) return { ...base, state: "ok", say: `The practice phone is connected${saved.accountLabel ? ` (${saved.accountLabel})` : ""}.` };
  return { ...base, state: "later", say: "No practice phone yet. Only Front Desk needs it.", fix: "See docs/self-hosting/phone.md." };
}

export function dryRunCheck(dryRun: boolean): SetupCheck {
  return dryRun
    ? { id: "dry-run", label: "Test mode", state: "ok", say: "Test mode is on: nothing is really sent, posted or booked.", required: false }
    : { id: "dry-run", label: "Test mode", state: "ok", say: "Test mode is off: approved items really go out.", required: false };
}

const MARK: Record<CheckState, string> = { ok: "✓", todo: "→", later: "·", problem: "✗" };

/** Plain lines for a person, one per check, then a one-line verdict. */
export function formatReport(checks: SetupCheck[]): string {
  const lines = checks.map((c) => `${MARK[c.state]} ${c.label}: ${c.say}${c.fix && c.state !== "ok" ? `\n    ${c.fix}` : ""}`);
  return [...lines, "", verdict(checks)].join("\n");
}

export function verdict(checks: SetupCheck[]): string {
  const blocking = checks.filter((c) => c.required && c.state !== "ok");
  if (blocking.length === 0) return "Ready: the app can run and Aeon can answer. Anything marked · can be set up later from inside the app.";
  return `Not ready yet: ${blocking.map((c) => c.label).join(", ")}.`;
}

/** Exit code: 0 when everything required is ok. */
export function exitCode(checks: SetupCheck[]): number {
  return checks.some((c) => c.required && c.state !== "ok") ? 1 : 0;
}
