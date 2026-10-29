// Plain-code reply parser for texts to the practice line. No model: a caller's
// "2" must mean exactly the second time we offered.

export type Reply =
  | { kind: "stop" }
  | { kind: "start" }
  | { kind: "help" }
  | { kind: "choice"; index: number }
  | { kind: "reschedule" }
  | { kind: "cancel" }
  | { kind: "book" }
  | { kind: "other" };

// Carrier opt-out words (CTIA). A bare "cancel" is one of them, and Twilio opts the
// number out on it, so it is treated as STOP; a consult is cancelled with "C".
const STOP = /^(stop|stopall|stop all|unsubscribe|cancel|end|quit|revoke|opt ?out)$/;
const START = /^(start|unstop|yes|yes start)$/;
const HELP = /^(help|info)$/;

const ORDINALS: Record<string, number> = { one: 1, first: 1, "1st": 1, two: 2, second: 2, "2nd": 2, three: 3, third: 3, "3rd": 3 };

export function parseReply(raw: string, offered = 3): Reply {
  const t = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return { kind: "other" };
  if (STOP.test(t)) return { kind: "stop" };
  if (START.test(t)) return { kind: "start" };
  if (HELP.test(t)) return { kind: "help" };

  // "2", "#2", "option 2", "2 please", "number two", "the second one", "2nd works"
  const m =
    t.match(/^(?:option |number |no |choice |time |the )?([1-9])(?: please| works| is good| thanks| thank you| pls| ok)?$/) ??
    t.match(/^(?:option |number |the )?(one|two|three|first|second|third|1st|2nd|3rd)(?: one)?(?: please| works| is good| thanks| pls| ok)?$/);
  if (m) {
    const n = /^\d$/.test(m[1]) ? Number(m[1]) : ORDINALS[m[1]];
    if (n >= 1 && n <= offered) return { kind: "choice", index: n };
    return { kind: "other" };
  }

  if (/^(r|resched|reschedule|change|move|move it|change time|different time|new time)( please| pls)?$/.test(t)) return { kind: "reschedule" };
  if (/^(c|cancel it|cancel please|cancel my (consult|appointment|call|booking))$/.test(t)) return { kind: "cancel" };
  if (/^(book|book please|new times|times|schedule|consult)$/.test(t)) return { kind: "book" };
  return { kind: "other" };
}
