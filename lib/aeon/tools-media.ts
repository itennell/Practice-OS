// Media tools for the chat and MCP (spread into TOOLS in tools.ts): making a reel,
// carousel or post in the studio from a chat message, and changing a post that's
// already waiting for her approval instead of drafting a new one. Both reuse the
// studio and Instagram code paths, so the same checks run (crisis check, PHI guard,
// topic gate, facts lint, critic) and nothing is posted: she approves, downloads
// and posts it herself.
import { z } from "zod";
import { revisePost } from "../instagram/revise";
import { makeProject, type MakeEvent } from "../studio/store";
import type { AeonTool, ToolContext, ToolResult } from "./tools";

const text = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });

/** Where the studio lives; it opens on her newest project, the one just made. */
export const STUDIO_PAGE = "/media/instagram";

function tool<I extends z.ZodRawShape>(
  def: Omit<AeonTool, "run" | "input"> & { input: I; run: (input: z.infer<z.ZodObject<I>>, ctx: ToolContext) => Promise<ToolResult> },
): AeonTool {
  return def as unknown as AeonTool;
}

/** Her request with the kind she asked for spelled out, so the studio makes that kind. */
export function studioRequest(request: string, kind?: "post" | "carousel" | "reel"): string {
  if (!kind || new RegExp(`\\b${kind}s?\\b`, "i").test(request)) return request;
  return `Make a ${kind} about ${request.replace(/^\s*(?:make|create|do)\s+(?:a|an|me a)?\s*/i, "")}`.slice(0, 600);
}

export const MEDIA_TOOLS: AeonTool[] = [
  tool({
    name: "make_studio_post",
    title: "Make a reel, carousel or post in the studio",
    description:
      "Makes a reel, a carousel (swipe slides) or a single-picture post in the Instagram studio from what she asked in chat, e.g. 'make a reel about how booking works'. " +
      "You CAN make reels and carousels: never say you can't. It looks at what therapists post about the topic (web research), writes the words from her saved facts, draws the picture and lays out the slides; " +
      "the post waits in Approvals and she changes it in chat or on the canvas. Takes a minute or two. Practice logistics only; an advice or client topic comes back with logistics angles to offer instead. " +
      "Then tell her the title and that the studio (the link) shows it ready to change. A video from her own footage starts on the studio page itself.",
    input: {
      request: z.string().trim().min(3).max(600).describe("What she asked for, in her words."),
      kind: z.enum(["post", "carousel", "reel"]).optional().describe("Only if she named one."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
    label: "Made it in the studio",
    changesData: true,
    run: async ({ request, kind }, ctx) => {
      const events: MakeEvent[] = [];
      const project = await makeProject(ctx.by, studioRequest(request, kind), (e) => events.push(e), { chat: ctx.chat });
      const stop = events.find((e) => e.type === "stop");
      const redirect = events.find((e) => e.type === "redirect");
      if (redirect?.type === "redirect") return text({ made: false, why: redirect.why, offer_instead: redirect.angles.map((a) => a.label) });
      if (!project) return text({ made: false, why: stop?.type === "stop" ? stop.why : "Aeon couldn't make that. Try again." });
      const research = events.find((e) => e.type === "research");
      const doc = project.doc;
      return text({
        made: true,
        kind: doc.kind,
        title: doc.title,
        slides: doc.slides.filter((s) => s.kind !== "picture").map((s) => s.text),
        caption: doc.caption,
        what_therapists_post: research?.type === "research" ? research.summary : undefined,
        approval_id: project.approvalId,
        open: STUDIO_PAGE,
        next: "It's in the studio, ready to change, and waiting in Approvals. Nothing is posted; she approves it, downloads it and posts it herself.",
      });
    },
  }),

  tool({
    name: "revise_instagram_post",
    title: "Change a post that's waiting for her",
    description:
      "Changes the Instagram post that's waiting for her approval when she asks for an edit ('make it shorter', 'change it to Wednesday', 'say the fee is $175'). " +
      "Use this, NOT draft_instagram_post, for any change to a post she already has: it updates that post and its pending approval in place, so no second approval piles up. " +
      "A post made in the studio changes there too (slides and caption together). Omit post_id for her newest waiting post. If it says nothing is waiting, draft a new one.",
    input: {
      change: z.string().trim().min(2).max(400).describe("Her change, in her words."),
      post_id: z.string().uuid().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
    label: "Changed the post",
    changesData: true,
    run: async ({ change, post_id }, ctx) => {
      const r = await revisePost(ctx.by, change, { postId: post_id, chat: ctx.chat });
      if (r.outcome === "none") return text({ revised: false, why: "No post is waiting for her approval. Use draft_instagram_post for a new one." });
      if (r.outcome !== "revised") return text({ revised: false, why: r.why });
      return text({ revised: true, headline: r.headline, approval_id: r.approvalId, same_approval: true, ...(r.via === "studio" ? { open: STUDIO_PAGE } : { see: "/media/instagram" }) });
    },
  }),
];

/** Media tools that only save drafts waiting for her approval, so they never wait for a tap themselves. */
export const MEDIA_ALWAYS_RUNS = MEDIA_TOOLS.map((t) => t.name);
