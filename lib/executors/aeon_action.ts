import type { Executor } from "./types";

// In Manual mode a change Aeon wants to make to her records waits as an
// aeon_action approval (lib/aeon/tools.ts runTool). Approving runs that exact
// tool call once, through the same runner, so the same checks and guard apply.
export const aeonAction: Executor = async (approval) => {
  const { runTool } = await import("../aeon/tools");
  const tool = String(approval.payload.tool ?? "");
  const result = await runTool(tool, approval.payload.args, { by: approval.created_by, approved: true, mode: "manual" });
  const out = result.content.map((c) => c.text).join("\n");
  if (result.isError) throw new Error(out.slice(0, 500));
  return { tool, result: out.slice(0, 2000) };
};
