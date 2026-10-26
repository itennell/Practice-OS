export type ApprovalRow = {
  id: string;
  kind: string;
  title: string;
  preview: Record<string, unknown>;
  payload: Record<string, unknown>;
  status: "pending" | "running" | "done" | "failed" | "rejected";
  created_by: string;
  created_at: Date;
  decided_at: Date | null;
  decided_by: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  is_sample: boolean;
};

export type ExecutorContext = { dryRun: boolean };

/**
 * Executors are the only code that sends, posts or books (AGENTS.md).
 * They return a small JSON result, or throw; the throw message becomes the
 * approval's error.
 */
export type Executor = (approval: ApprovalRow, ctx: ExecutorContext) => Promise<Record<string, unknown>>;
