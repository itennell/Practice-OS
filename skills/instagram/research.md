# Instagram research (tiny helpers)

Before Aeon writes a post about a topic she names, it looks at what other therapists post about it. This is how it works, for any agent using the same tools (`research_post_topic` in chat and over MCP).

1. **Topic gate (plain code, no model).** Advice, client stories, reviews and promised results are never researched or written. She gets the plain reason and the nearest logistics angle ("What a first session for anxiety looks like"). Suicide or self-harm is a hard stop with the 988 line.
2. **Three helpers at once.** Each is one small Muse Spark call with web search (`searchGrounded`, low effort, low context), logged to `model_calls`:
   - `instagram.research.posts`: what therapists in private practice post about the topic
   - `instagram.research.hooks`: which opening lines work, and why
   - `instagram.research.formats`: single picture, carousel or reel, and why
   Each is told: practice logistics only, and do not search or cite instagram.com, facebook.com or threads.net. Aeon never scrapes Instagram (its terms forbid it).
3. **Merge.** One Muse call (`instagram.research.angles`) turns the notes into a two-sentence summary and 2-3 angles (title, hook, format, why, pillar, source numbers).
4. **Plain code decides.** Only links the searches really returned are kept, and never Instagram, Facebook or Threads pages. Every angle and the summary pass the post critic. Fewer than two safe angles means fixed logistics angles, and the page says they aren't from the web.
5. **Saved for a week** in `practice_os.post_research`. The same topic within 7 days reuses it. A post written from an angle keeps `posts.research_id`.

Code: `lib/instagram/research.ts`, `lib/instagram/topic-gate.ts`. Tests: `tests/instagram-research.test.ts`, `tests/instagram-topic-gate.test.ts`.
