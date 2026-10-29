// Plain code that spots a client record (an intake form, a progress note, a
// treatment plan, a screening) before anything reads it with a model. Until there
// is a BAA, Practice-OS never keeps one. A business document can mention a
// "diagnosis" or a "patient" once; a client record fills in the fields.

const MARKERS: RegExp[] = [
  /\b(client|patient)(?:'s)?\s+(full\s+)?name\s*[:_]/i,
  /\b(date of birth|d\.?o\.?b\.?)\s*[:_]/i,
  /\bpresenting (problem|concern|issue)s?\b/i,
  /\bchief complaint\b/i,
  /\b(progress|session|psychotherapy|soap)\s+note\b/i,
  /\btreatment plan\b.*\b(goal|objective)s?\b/i,
  /\bmental status (exam|examination)\b/i,
  /\b(phq-?9|gad-?7|pcl-?5|audit-c)\b/i,
  /\bemergency contact\s*[:_]/i,
  /\breason for (seeking|referral|visit)\b/i,
  /\b(intake|new client|new patient)\s+(form|questionnaire|paperwork)\b/i,
  /\b(current )?medications?\s*[:_]/i,
  /\b(primary |provisional )?diagnosis\s*[:_]/i,
  /\b(insured|member|subscriber)(?:'s)?\s+(name|id)\s*[:_]/i,
];

/** How many different client-record fields the text has. Two or more is a client record. */
export function clientRecordScore(text: string): number {
  return MARKERS.filter((re) => re.test(text)).length;
}

export const looksLikeClientRecord = (text: string) => clientRecordScore(text) >= 2;

export const CLIENT_RECORD_REFUSAL =
  "This looks like a client record, so I didn't read it or keep it. Practice-OS can't hold client records until there's a business associate agreement (BAA). Keep it in your records system.";
