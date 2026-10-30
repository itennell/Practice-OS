// Her video files stay in her browser: the Origin Private File System (a private
// folder only this app can see, navigator.storage.getDirectory). The studio
// document keeps only the key. Nothing here sends the bytes anywhere. If the
// browser has no private folder, the file is kept in memory for this visit only.

const DIR = "studio-clips";
const memory = new Map<string, File>();

export type SaveResult = { key: string; kept: "browser" | "memory" };

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

/** Keeps the file in her browser under a new random key. */
export async function saveClip(file: File): Promise<SaveResult> {
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
