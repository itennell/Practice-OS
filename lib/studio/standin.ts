// Tests only (PLAYWRIGHT_STUDIO_STANDIN=1, like the research and image stand-ins):
// fixed model answers and a plain background, so the end-to-end specs can make a
// reel with no Muse key and no network. Refused on Vercel.
import sharp from "sharp";
import type { ChatFn } from "../instagram/critic";
import type { MakeDeps } from "./store";

const reply = (obj: unknown) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });

export function standInDeps(): MakeDeps {
  if (process.env.VERCEL) throw new Error("PLAYWRIGHT_STUDIO_STANDIN is for tests only.");
  const chat = (async (feature: string, params: { messages: { content: unknown }[] }) => {
    const ask = String(params.messages.at(-1)?.content ?? "");
    if (feature === "instagram.research.angles")
      return reply({
        summary: "Therapists keep these posts plain: what happens, what it costs and how to book.",
        angles: [
          { title: "How booking works, step by step", hook: "Booking takes two steps.", format: "reel", why: "A short how-to shows the next step.", pillar: "how_to_book", source_numbers: [1] },
          { title: "What your first session looks like", hook: "Nervous about a first session? Here's what happens.", format: "carousel", why: "Answers the first question people ask.", pillar: "first_session", source_numbers: [2] },
        ],
      });
    if (feature === "instagram.write") {
      const pillar = ["how_to_book", "first_session", "fees_superbills", "meet_the_clinician", "office_telehealth"].find((p) => ask.includes(`"${p}"`)) ?? "how_to_book";
      return reply({
        posts: [{ pillar, headline: "[Sample] How booking works", body: "[Sample] Pick a time that works for you on the booking page. We talk for 15 minutes first, free. Link in bio.", alt_text: "A calm booking page" }],
      });
    }
    if (feature === "instagram.reel") return reply({ points: ["Pick a time that works for you on the booking page", "We talk for 15 minutes first, free"], book: "Book a free call. Link in bio." });
    if (feature === "instagram.critic") return reply({ breaks: [] });
    if (feature === "instagram.graphic_check") return reply({ ok: true, problems: [] });
    throw new Error(`No stand-in for ${feature}.`);
  }) as unknown as ChatFn;
  return {
    chat,
    graphic: {
      cutout: async () => null,
      background: () => sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#EDE7F6" } }).png().toBuffer(),
    },
  };
}
