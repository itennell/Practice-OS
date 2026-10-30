import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LIMIT, makeTestVideo, watchNetwork } from "./video-fixture";

// The studio's video editor on its test page (/ui-lab/studio-video: an
// in-memory document run through the real applyOps, no database). A short test
// video is made right here, added from "her computer", trimmed, given words,
// and made into an MP4 in the browser; ffprobe checks the file. The video's
// bytes must never be sent anywhere.

async function axe(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => v.id + ": " + v.nodes.map((n) => n.target.join(" ")).join(", "))).toEqual([]);
}

async function axeBothThemes(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await axe(page);
  }
}

const PROBE_ARGS = ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration", "-of", "json"];

function probe(file: string) {
  return JSON.parse(execFileSync("ffprobe", [...PROBE_ARGS, file], { encoding: "utf8" })) as {
    streams: { codec_type: string; codec_name: string; width?: number; height?: number }[];
    format: { duration: string };
  };
}

const hasFfprobe = (() => {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/** Plays the downloaded MP4 in a video element in the page (from memory, not the network) and returns how far it got. */
async function playsInPage(page: Page, file: string): Promise<number> {
  const b64 = readFileSync(file).toString("base64");
  return page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const v = document.createElement("video");
    v.muted = true;
    v.src = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
    document.body.append(v);
    await v.play();
    await new Promise((r) => setTimeout(r, 1200));
    const t = v.currentTime;
    v.pause();
    v.remove();
    return t;
  }, b64);
}

const docOf = async (page: Page) => JSON.parse((await page.getByTestId("doc").textContent()) ?? "{}");

function describeProbe(p: ReturnType<typeof probe>): string {
  const v = p.streams.find((s) => s.codec_type === "video")!;
  const a = p.streams.find((s) => s.codec_type === "audio");
  return v.codec_name + " " + v.width + "x" + v.height + ", " + Number(p.format.duration).toFixed(3) + " s, audio " + (a?.codec_name ?? "none");
}

test("Add her own video, cut the first second, add words, download a real 1080x1920 MP4; the video never leaves the browser", async ({ page }, info) => {
  test.setTimeout(240_000);
  const sent = watchNetwork(page);
  await page.goto("/ui-lab/studio-video");
  await expect(page.getByRole("heading", { name: "Video editor" })).toBeVisible();
  await axeBothThemes(page);

  const dir = mkdtempSync(path.join(tmpdir(), "studio-video-"));
  const clipFile = path.join(dir, "office-tour.mp4");
  writeFileSync(clipFile, await makeTestVideo(page, 4));

  await page.getByLabel("Choose a video from your computer").setInputFiles(clipFile);
  await expect(page.getByRole("button", { name: /^Clip 1: office-tour\.mp4, 4 seconds/ })).toBeVisible({ timeout: 20_000 });
  let doc = await docOf(page);
  expect(doc.clips[0]).toMatchObject({ name: "office-tour.mp4", in: 0, out: 4 });
  // Only a key into the browser's private folder is in the document.
  expect(doc.clips[0].source).toMatch(/^[0-9a-f-]{36}\.mp4/);
  await expect(page.getByText("be here after you reload")).toHaveCount(0);

  // Cut the first second: exact number in "Starts at".
  const starts = page.getByLabel("Starts at (seconds)");
  await starts.fill("1");
  await starts.press("Enter");
  await expect(page.getByRole("button", { name: /^Clip 1: office-tour\.mp4, 3 seconds/ })).toBeVisible();
  doc = await docOf(page);
  expect(doc.clips[0]).toMatchObject({ in: 1, out: 4 });
  await expect(page.getByRole("slider", { name: "Start of clip 1" })).toHaveAttribute("aria-valuetext", "1 second");

  // Words at the start of the video.
  await page.getByRole("slider", { name: "Time" }).focus();
  await page.keyboard.press("Home");
  await page.getByLabel("New words").fill("[Sample] Free 15-minute call");
  await page.getByRole("button", { name: "Add at 0:00.0" }).click();
  await expect(page.getByLabel("Words 1", { exact: true })).toHaveValue("[Sample] Free 15-minute call");
  doc = await docOf(page);
  expect(doc.overlays[0]).toMatchObject({ text: "[Sample] Free 15-minute call", start: 0, end: 3 });

  // The preview draws the frame (not just black).
  const preview = page.getByRole("img", { name: /^Preview of your video/ });
  const lit = () =>
    preview.evaluate((c) => {
      const canvas = c as HTMLCanvasElement;
      const d = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 40) if (d[i] + d[i + 1] + d[i + 2] > 90) n++;
      return n / (d.length / 40);
    });
  await expect.poll(lit, { timeout: 5_000 }).toBeGreaterThan(0.3);
  if (process.env.STUDIO_SHOT) await page.screenshot({ path: process.env.STUDIO_SHOT + "-" + info.project.name + ".png", fullPage: true });

  // The preview plays the edited timeline.
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("slider", { name: "Time" })).not.toHaveAttribute("aria-valuetext", /^0:00\.0 of/, { timeout: 5_000 });
  await page.getByRole("button", { name: "Pause" }).click();

  await axeBothThemes(page);

  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 180_000 }), page.getByRole("button", { name: "Download video" }).click()]);
  expect(download.suggestedFilename()).toBe("sample-office-tour.mp4");
  const out = path.join(dir, "export-" + info.project.name + ".mp4");
  await download.saveAs(out);
  await expect(page.getByText("Your video is saved in Downloads.")).toBeVisible();

  if (hasFfprobe) {
    const p = probe(out);
    console.log("ffprobe: " + describeProbe(p));
    expect(p.streams.find((s) => s.codec_type === "video")).toMatchObject({ codec_name: "h264", width: 1080, height: 1920 });
    expect(Math.abs(Number(p.format.duration) - 3)).toBeLessThan(0.2);
    expect(p.streams.some((s) => s.codec_type === "audio")).toBe(true);
  }
  expect(await playsInPage(page, out)).toBeGreaterThan(0.3);

  // Nothing big left the browser, and no request carried an MP4.
  expect(sent.filter((s) => s.bytes > LIMIT || s.mp4)).toEqual([]);
});

// A landscape 1280x720 picture stored with a 90-degree turn: it shows as 720x1280, like a phone held upright.
const PHONE_ARGS = ["-y", "-v", "error", "-display_rotation:v:0", "90", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "4", "-c:v", "libx265", "-tag:v", "hvc1", "-c:a", "aac"];

test("A phone clip (HEVC .mov with a rotation flag) makes a 1080x1920 H.264 MP4", async ({ page }, info) => {
  test.setTimeout(240_000);
  test.skip(!hasFfprobe, "ffmpeg is not installed here");
  const dir = mkdtempSync(path.join(tmpdir(), "studio-phone-"));
  const mov = path.join(dir, "phone.mov");
  try {
    execFileSync("ffmpeg", [...PHONE_ARGS, mov], { stdio: "ignore" });
  } catch {
    test.skip(true, "ffmpeg cannot make an HEVC file here");
  }
  const sent = watchNetwork(page);
  await page.goto("/ui-lab/studio-video");
  await page.getByLabel("Choose a video from your computer").setInputFiles(mov);
  const added = page.getByRole("button", { name: /^Clip 1: phone\.mov/ });
  const cannot = page.getByText("play that kind of video");
  await expect(added.or(cannot)).toBeVisible({ timeout: 20_000 });
  test.skip(await cannot.isVisible(), "This browser cannot decode HEVC");
  await expect(page.getByRole("button", { name: /^Clip 1: phone\.mov, 4 seconds/ })).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 180_000 }), page.getByRole("button", { name: "Download video" }).click()]);
  const out = path.join(dir, "phone-" + info.project.name + ".mp4");
  await download.saveAs(out);
  const p = probe(out);
  console.log("ffprobe (phone): " + describeProbe(p));
  expect(p.streams.find((s) => s.codec_type === "video")).toMatchObject({ codec_name: "h264", width: 1080, height: 1920 });
  expect(Math.abs(Number(p.format.duration) - 4)).toBeLessThan(0.2);
  expect(sent.filter((s) => s.bytes > LIMIT || s.mp4)).toEqual([]);
});
