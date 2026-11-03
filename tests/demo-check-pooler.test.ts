// demo:check hung forever on Supabase's transaction pooler (port 6543), printing nothing.
// Root cause: its own client (max: 1) let postgres.js pipeline suppressedList()'s second
// read behind the first; the pooler hands the server connection back after the first
// reply, so the second reply never arrives. These tests put a small stand-in for that
// pooler in front of the built-in database: it forwards everything, but after each
// ReadyForQuery it drops server replies until the client sends something new, the way a
// query pipelined behind another is lost on the real pooler.
import net from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { loadEnv } from "../lib/env";
import { checkDemo, checkTimeoutMessage } from "../lib/demo-check";
import { projectRefOf } from "../lib/demo-reset";
import { poolerSafeClient } from "../lib/db";

loadEnv();
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const local = Boolean(dbUrl && ["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) && projectRefOf(dbUrl.toString()) === "local");

const READY_FOR_QUERY = "Z".charCodeAt(0);

function fakeTransactionPooler(upstream: URL): Promise<{ url: string; close: () => Promise<void> }> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((client) => {
    const pg = net.connect(Number(upstream.port || 5432), upstream.hostname);
    sockets.add(client).add(pg);
    let dropping = false;
    let buf = Buffer.alloc(0);
    client.on("data", (d) => {
      dropping = false; // a new question from the client gets a server again
      pg.write(d);
    });
    pg.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 5) {
        const len = buf.readInt32BE(1);
        if (buf.length < 1 + len) break;
        const msg = buf.subarray(0, 1 + len);
        buf = buf.subarray(1 + len);
        if (!dropping) client.write(msg);
        if (msg[0] === READY_FOR_QUERY) dropping = true; // the server connection goes back to the pool
      }
    });
    const end = () => {
      client.destroy();
      pg.destroy();
    };
    client.on("close", end).on("error", end);
    pg.on("close", end).on("error", end);
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const url = new URL(upstream.toString());
      url.hostname = "127.0.0.1";
      url.port = String((server.address() as net.AddressInfo).port);
      resolve({
        url: url.toString(),
        close: () =>
          new Promise<void>((r) => {
            for (const s of sockets) s.destroy();
            server.close(() => r());
          }),
      });
    }),
  );
}

describe.skipIf(!local)("demo:check behind a transaction pooler", () => {
  let pooler: Awaited<ReturnType<typeof fakeTransactionPooler>>;
  beforeAll(async () => {
    pooler = await fakeTransactionPooler(dbUrl!);
  });
  afterAll(async () => {
    await pooler?.close();
  });

  it("the stand-in really loses a query pipelined behind another (the old client)", async () => {
    const sql = postgres(pooler.url, { max: 1, prepare: false, onnotice: () => {} });
    try {
      await sql`select 0 as warm`; // connected, so the next two go out together
      const both = Promise.all([sql`select 1 as a`, sql`select 2 as b`]);
      both.catch(() => {});
      const hung = await Promise.race([both.then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), 1_500))]);
      expect(hung).toBe(true);
    } finally {
      await sql.end({ timeout: 0 });
    }
  });

  it("the pooler-safe client answers both", async () => {
    const sql = poolerSafeClient(pooler.url, { max: 1 });
    try {
      await sql`select 0 as warm`;
      const [[a], [b]] = await Promise.all([sql<{ a: number }[]>`select 1 as a`, sql<{ b: number }[]>`select 2 as b`]);
      expect([a.a, b.b]).toEqual([1, 2]);
    } finally {
      await sql.end();
    }
  });

  it("demo:check finishes through it", async () => {
    const lines = await checkDemo({ url: pooler.url, expectedRef: "local", timeoutMs: 15_000 });
    expect(lines.length).toBeGreaterThan(5);
  });

  it("with a client that pipelines, demo:check stops at its timeout with a plain message instead of hanging", async () => {
    const started = Date.now();
    await expect(
      checkDemo({ url: pooler.url, expectedRef: "local", timeoutMs: 1_500, client: (url) => postgres(url, { max: 1, prepare: false, onnotice: () => {} }) }),
    ).rejects.toThrow(checkTimeoutMessage(1_500));
    expect(Date.now() - started).toBeLessThan(8_000);
  });
});

describe("demo:check's timeout message", () => {
  it("says what happened and what to do, in plain words", () => {
    expect(checkTimeoutMessage()).toBe(
      "demo:check stopped after 60 seconds without an answer from the database, so the demo wasn't checked. The check only reads, so it changed nothing. Make sure the database is reachable, then run npm run demo:check again.",
    );
  });
});
