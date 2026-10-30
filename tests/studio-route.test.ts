// The studio's make route: a failure reaches the browser as one plain sentence (the
// details go to the server log), and the stream always ends, even when the browser
// has gone away mid-way.
import { afterEach, describe, expect, it, vi } from "vitest";

const make = vi.hoisted(() => ({ fn: async (...args: unknown[]): Promise<unknown> => args.length && null }));
vi.mock("@/lib/studio/store", () => ({ listProjects: async () => [], makeProject: (...args: unknown[]) => make.fn(...args) }));

const { POST } = await import("../app/api/studio/route");

const request = () =>
  new Request("http://127.0.0.1:3000/api/studio", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", "sec-fetch-site": "same-origin", "content-type": "application/json" },
    body: JSON.stringify({ request: "make a reel about booking" }),
  });

afterEach(() => vi.restoreAllMocks());

describe("studio make route", () => {
  it("sends a plain error, never the server's message, and always ends", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    make.fn = async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432 password=secret");
    };
    const res = await POST(request());
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toEqual([{ type: "error", why: "Aeon couldn't make that. Try again." }, { type: "end" }]);
    expect(logged).toHaveBeenCalled();
  });

  it("keeps going quietly when the browser has gone away", async () => {
    let finished = false;
    make.fn = async (_by, _req, emit) => {
      for (let i = 0; i < 3; i++) {
        (emit as (e: unknown) => void)({ type: "reply", text: `step ${i}` });
        await new Promise((r) => setTimeout(r, 5));
      }
      finished = true;
      return null;
    };
    const res = await POST(request());
    await res.body!.cancel();
    await new Promise((r) => setTimeout(r, 50));
    expect(finished).toBe(true);
  });
});
