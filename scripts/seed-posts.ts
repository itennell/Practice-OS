// The [Sample] Instagram posts in db/seed/demo.sql that need a picture. The headlines
// must match the seed; tests/seed-posts.test.ts checks both. Pictures are drawn by
// scripts/make-seed-posts.ts into db/seed/posts/<id>.jpg and loaded by db:reset.
export const SEED_POSTS = [
  {
    id: "00000000-0000-4000-8000-000000000301",
    headline: "[Sample] What happens at a first session",
    picture: { top: "#F4EEE4", bottom: "#E3D9FF" },
  },
  {
    id: "00000000-0000-4000-8000-000000000302",
    headline: "[Sample] Superbills for out-of-network care",
    picture: { top: "#F7EFE6", bottom: "#F1D9E9" },
  },
  // How to book stays an idea: no picture until Aeon writes it.
  { id: "00000000-0000-4000-8000-000000000303", headline: "[Sample] How to book a free consult", picture: null },
] as const satisfies readonly { id: string; headline: string; picture: { top: string; bottom: string } | null }[];
