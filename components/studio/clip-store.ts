// Her video files stay in her browser: the Origin Private File System (a private
// folder only this app can see, navigator.storage.getDirectory). The studio
// document keeps only the key. Nothing here sends the bytes anywhere. If the
// browser has no private folder, the file is kept in memory for this visit only.

const DIR = "studio-clips";
/** Her clips may keep this much of her browser's storage; more is refused with plain words. */
export const MAX_CLIP_BYTES = 500 * 1024 * 1024;
const memory = new Map<string, File>();

export type SaveResult = { key: string; kept: "browser" | "memory" };

/** Pure check, tested on its own: the new file must fit under the cap. */
export function fitsCap(usedBytes: number, incomingBytes: number, cap: number = MAX_CLIP_BYTES): boolean {
  return usedBytes + incomingBytes <= cap;
}

async function folder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(DIR, { create: true });
  } catch {
    return null;
  }
}

function newKey(name: string): string {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] ?? "mp4").toLowerCase();
  return `${crypto.randomUUID()}.${ext}`;
}

/** How much of her browser storage her clips already use, when the browser can say. */
async function usedBytes(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return typeof estimate?.usage === "number" ? estimate.usage : null;
  } catch {
    return null;
  }
}

/** Keeps the file in her browser under a new random key. Refuses when it would pass the storage cap. */
export async function saveClip(file: File): Promise<SaveResult> {
  const used = await usedBytes();
  if (used !== null && !fitsCap(used, file.size)) {
    throw new Error("That video doesn't fit in the clips storage (500 MB). Remove a clip first, then add it again.");
  }
  const key = newKey(file.name);
  const dir = await folder();
  if (dir) {
    try {
      const handle = await dir.getFileHandle(key, { create: true });
      const w = await handle.createWritable();
      await w.write(file);
      await w.close();
      memory.set(key, file);
      return { key, kept: "browser" };
    } catch {
      await dir.removeEntry(key).catch(() => {});
    }
  }
  memory.set(key, file);
  return { key, kept: "memory" };
}

/**
 * Forgets in-memory copies of files no clip uses any more, so a long visit
 * doesn't hold every removed clip in RAM. The private-folder copy stays: Undo
 * and the version list can bring a removed clip back, and the missing-clip
 * notice already covers files the browser cleared on its own.
 */
export function evictUnreferenced(keepKeys: readonly string[]): void {
  const keep = new Set(keepKeys);
  for (const key of [...memory.keys()]) if (!keep.has(key)) memory.delete(key);
}

/** The file for a key, or null when it's on another computer or was cleared. */
export async function loadClip(key: string): Promise<File | null> {
  const hit = memory.get(key);
  if (hit) return hit;
  const dir = await folder();
  if (!dir) return null;
  try {
    const file = await (await dir.getFileHandle(key)).getFile();
    memory.set(key, file);
    return file;
  } catch {
    return null;
  }
}
