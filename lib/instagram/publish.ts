import { captionProblems, InstagramApiError, LIMITS, type ContainerStatus, type InstagramGraph } from "./graph";
import { checkInstagramJpeg } from "./image";
import type { RelayClient } from "./relay";

// Publishing one image post: host the JPEG on the relay for an hour, make a
// media container, wait until Meta has fetched it, then publish. Each step's
// id is saved as soon as Meta returns it, so a second run never posts twice:
// it picks up from the saved container or stops at the saved media id.

export type PublishInput = { jpeg: Buffer; caption: string; altText: string; aiGenerated: boolean };
export type PublishProgress = { containerId: string | null; mediaId: string | null; permalink: string | null };

export type PublishDeps = {
  graph: Pick<InstagramGraph, "createImageContainer" | "containerStatus" | "publish" | "permalink" | "publishingLimit">;
  relay: Pick<RelayClient, "uploadJpeg" | "deleteImage">;
  token: string;
  igUserId: string;
  /** Persists each id the moment Meta returns it. */
  save: (progress: PublishProgress) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  /** Meta: poll status no more than 5 minutes. */
  maxWaitMs?: number;
};

export type PublishResult = PublishProgress & { resumed: boolean; checks: number };

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Checks the inputs against Meta's rules before anything leaves the computer. */
export async function publishProblems(input: PublishInput): Promise<string[]> {
  const problems = [...captionProblems(input.caption), ...(await checkInstagramJpeg(input.jpeg))];
  if (!input.altText.trim()) problems.push("The image needs a description (alt text) for people using screen readers.");
  if (input.altText.length > LIMITS.altTextChars) problems.push(`The image description is over ${LIMITS.altTextChars} characters.`);
  return problems;
}

export async function publishImagePost(input: PublishInput, prior: PublishProgress, deps: PublishDeps): Promise<PublishResult> {
  const sleep = deps.sleep ?? wait;
  const maxWaitMs = deps.maxWaitMs ?? 5 * 60_000;
  const progress: PublishProgress = { ...prior };
  let checks = 0;

  if (progress.mediaId) return { ...progress, resumed: true, checks };

  let status: ContainerStatus | null = null;
  if (progress.containerId) {
    status = (await deps.graph.containerStatus(progress.containerId)).status_code;
    checks++;
    if (status === "PUBLISHED") {
      // Published by an earlier run that stopped before saving the media id.
      throw new Error("This post is already on Instagram from an earlier try, so it was not posted again. Check the account to see it.");
    }
    if (status === "EXPIRED" || status === "ERROR") {
      progress.containerId = null;
      status = null;
    }
  }
  const resumed = progress.containerId !== null;

  let hosted: { id: string } | null = null;
  if (!progress.containerId) {
    const problems = await publishProblems(input);
    if (problems.length) throw new Error(problems.join(" "));
    const quota = await deps.graph.publishingLimit(deps.igUserId);
    if (quota.used >= quota.total) {
      throw new Error(`Instagram's limit of ${quota.total} posts a day is used up. Try again tomorrow.`);
    }
    const image = await deps.relay.uploadJpeg(input.jpeg, deps.token);
    hosted = image;
    const container = await deps.graph.createImageContainer(deps.igUserId, {
      imageUrl: image.url,
      caption: input.caption,
      altText: input.altText,
      aiGenerated: input.aiGenerated,
    });
    progress.containerId = container.id;
    await deps.save(progress);
  }

  {
    // First look after 2 s (images are usually ready), then back off to Meta's once a minute.
    let delay = 2_000;
    let waited = 0;
    while (status !== "FINISHED") {
      if (waited >= maxWaitMs) throw new Error("Instagram took more than 5 minutes to get the image ready. Try again later.");
      await sleep(delay);
      waited += delay;
      delay = Math.min(delay * 2, 60_000);
      status = (await deps.graph.containerStatus(progress.containerId!)).status_code;
      checks++;
      if (status === "ERROR") throw new Error("Instagram could not use the image. Aeon will make a new one.");
      if (status === "EXPIRED") throw new Error("The prepared post expired before it was published. Try again.");
      if (status === "PUBLISHED") break;
    }

    if (status !== "PUBLISHED") {
      const media = await deps.graph.publish(deps.igUserId, progress.containerId!);
      progress.mediaId = media.id;
      await deps.save(progress);
    }
    if (progress.mediaId) {
      try {
        progress.permalink = (await deps.graph.permalink(progress.mediaId)).permalink;
        await deps.save(progress);
      } catch (err) {
        // The post is live; a missing link is not a failure.
        if (err instanceof InstagramApiError && err.tokenInvalid) throw err;
      }
    }
  }
  // Only once it is live: a run that stops early may still need the hosted copy.
  if (hosted) await deps.relay.deleteImage(hosted.id, deps.token);
  return { ...progress, resumed, checks };
}
