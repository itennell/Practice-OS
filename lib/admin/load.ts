import { morningBrief } from "../compliance/brief";
import { practiceToday } from "../compliance/store";
import { loadCredentialingProfile } from "../credentialing/store";
import { db } from "../db";
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

/**
 * Crisis alerts (lib/safety.ts alertCrisis) that could not text her in the last 3 days and
 * were not followed by one that did. Read from audit_log, so no new table.
 */
export async function loadAlertFailures(): Promise<{ id: string; at: string }[]> {
  const rows = await db()<{ id: string; at: Date }[]>`
    select f.id::text as id, f.at
      from practice_os.audit_log f
     where f.action = 'crisis_alert_failed' and f.subject_type in ('chat', 'upload', 'media')
       and f.at > now() - interval '3 days'
       and not exists (select 1 from practice_os.audit_log s where s.action = 'crisis_alert_sent' and s.actor = 'safety' and s.at > f.at)
     order by f.at desc limit 5`;
  return rows.map((r) => ({ id: r.id, at: r.at.toISOString() }));
}

export async function loadNeeds(): Promise<NeedItem[]> {
  const [today, brief, estimates, superbills, profile, alertFailures] = await Promise.all([
    safe(practiceToday, new Date().toISOString().slice(0, 10)),
    safe(morningBrief, null),
    safe(() => listEstimates(), []),
    safe(() => listSuperbills(), []),
    safe(loadCredentialingProfile, null),
    safe(loadAlertFailures, []),
  ]);
  return needsNext({ today, brief, estimates, superbills, profile, alertFailures });
}
