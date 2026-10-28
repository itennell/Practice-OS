import { morningBrief } from "../compliance/brief";
import { practiceToday } from "../compliance/store";
import { loadCredentialingProfile } from "../credentialing/store";
import { listEstimates } from "../gfe/store";
import { listSuperbills } from "../superbill/store";
import { needsNext, type NeedItem } from "./needs-next";

// Reads everything "What your practice needs next" ranks. Each read falls back to
// empty, so one missing table (a migration not run yet) never blanks the whole list.

const safe = async <T>(read: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await read();
  } catch {
    return fallback;
  }
};

export async function loadNeeds(): Promise<NeedItem[]> {
  const [today, brief, estimates, superbills, profile] = await Promise.all([
    safe(practiceToday, new Date().toISOString().slice(0, 10)),
    safe(morningBrief, null),
    safe(() => listEstimates(), []),
    safe(() => listSuperbills(), []),
    safe(loadCredentialingProfile, null),
  ]);
  return needsNext({ today, brief, estimates, superbills, profile });
}
