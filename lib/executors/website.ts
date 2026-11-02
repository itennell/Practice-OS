import { growthReady } from "./ads_campaign";
import type { Executor } from "./types";

// She approved her website draft (Media > Grow): re-check it and mark it ready, which
// unlocks the zip and the Squarespace text. Nothing is published or deployed.
export const website: Executor = (approval, { dryRun }) => growthReady(approval, ["website"], dryRun);
