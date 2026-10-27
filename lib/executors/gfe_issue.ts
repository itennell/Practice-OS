import { audit } from "../audit";
import { practiceToday } from "../compliance/store";
import { db } from "../db";
import type { Executor } from "./types";

// She approved a Good Faith Estimate: its fees are confirmed and it counts as
// issued today. Nothing is sent; she gives the PDF to the client herself. It
// acts only inside our own database, so it runs the same with or without DRY_RUN.
export const gfeIssue: Executor = async (approval, { dryRun }) => {
  const estimateId = (approval.payload as { estimate_id?: unknown }).estimate_id;
  if (typeof estimateId !== "string") throw new Error("This approval has no estimate.");
  const today = await practiceToday();
  const [row] = await db()<{ reference: string; due_on: Date | null; on_time: boolean }[]>`
    update practice_os.good_faith_estimates
       set issued_on = ${today}
     where id = ${estimateId} and approval_id = ${approval.id} and issued_on is null
    returning reference, due_on, on_time`;
  if (!row) throw new Error("That estimate is already issued or no longer matches this approval.");
  await audit({
    actor: "executor",
    action: "gfe_issued",
    approvalId: approval.id,
    subjectType: "good_faith_estimate",
    subjectId: estimateId,
    details: { reference: row.reference, issued_on: today, on_time: row.on_time, dryRun },
  });
  return { reference: row.reference, issued_on: today, on_time: row.on_time };
};
