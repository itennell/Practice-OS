import { checkGoogleDraft, checkMetaDraft, type GoogleAdsDraft, type MetaAdsDraft } from "../growth/ads";
import { checkSite, type SiteDraft } from "../growth/site";
import { getDraft, markReady } from "../growth/store";
import { loadMediaFacts } from "../media/facts";
import type { Executor } from "./types";

// She approved an ad or website draft (Media > Grow). These executors never call
// Google Ads, Meta or any host, never spend and never publish, with or without
// DRY_RUN: they re-run the policy check on the saved draft and mark it ready, which
// unlocks the downloads. She imports the ads (paused) and publishes the site herself.

export async function growthReady(approval: Parameters<Executor>[0], kinds: string[], dryRun: boolean) {
  const draftId = (approval.payload as { draft_id?: unknown }).draft_id;
  if (typeof draftId !== "string") throw new Error("This approval has no draft.");
  const row = await getDraft(draftId);
  if (!row || !kinds.includes(row.kind)) throw new Error("That draft is no longer in Practice-OS.");
  // Fails closed: without her saved facts the check can't run, so nothing is marked ready.
  const facts = await loadMediaFacts().catch(() => {
    throw new Error("Couldn't load your practice details to re-check this draft. Nothing was marked ready; try again.");
  });
  const check =
    row.kind === "google_ads"
      ? checkGoogleDraft(row.draft as GoogleAdsDraft, facts)
      : row.kind === "meta_ads"
        ? checkMetaDraft(row.draft as MetaAdsDraft, facts)
        : checkSite(row.draft as SiteDraft, facts);
  if (!check.ok) throw new Error(`The policy check no longer passes: ${check.findings.filter((f) => f.severity === "block").map((f) => `${f.where}: ${f.message}`).join(" ")}`);
  await markReady(row.id, approval.id);
  return {
    draft_id: row.id,
    ready: true,
    spent: 0,
    published: false,
    sent_to_ad_platform: false,
    ...(dryRun ? { dryRun: true } : {}),
    next: row.kind === "website" ? "Download the site from Media > Grow, then put it on your own host." : "Download the files from Media > Grow, import them paused, and turn them on yourself.",
  };
}

export const adsCampaign: Executor = (approval, { dryRun }) => growthReady(approval, ["google_ads", "meta_ads"], dryRun);
