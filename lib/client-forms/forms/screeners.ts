import type { Block, FormDef } from "../types";

// PHQ-9 and GAD-7, word for word, as blank copies she can hand a client. Both
// say "No permission required to reproduce, translate, display or distribute"
// (phqscreeners.com). Practice-OS never scores or stores an answer; the client's
// ticks stay on their copy. Item 9 of the PHQ-9 asks about self-harm, so the
// form carries 988 and 911 for the client and a reminder for her.

const FREQ = ["Not at all", "Several days", "More than half the days", "Nearly every day"];
const DIFFICULTY = ["Not difficult at all", "Somewhat difficult", "Very difficult", "Extremely difficult"];
const ATTRIBUTION =
  "Developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc. No permission required to reproduce, translate, display or distribute.";
const SOURCE = "https://www.phqscreeners.com/";
const CRISIS = "If you are thinking about hurting yourself, call or text 988 now. In an emergency, call 911.";

const PHQ9_ITEMS = [
  "Little interest or pleasure in doing things",
  "Feeling down, depressed, or hopeless",
  "Trouble falling or staying asleep, or sleeping too much",
  "Feeling tired or having little energy",
  "Poor appetite or overeating",
  "Feeling bad about yourself - or that you are a failure or have let yourself or your family down",
  "Trouble concentrating on things, such as reading the newspaper or watching television",
  "Moving or speaking so slowly that other people could have noticed? Or the opposite - being so fidgety or restless that you have been moving around a lot more than usual",
  "Thoughts that you would be better off dead or of hurting yourself in some way",
];

const GAD7_ITEMS = [
  "Feeling nervous, anxious, or on edge",
  "Not being able to stop or control worrying",
  "Worrying too much about different things",
  "Trouble relaxing",
  "Being so restless that it is hard to sit still",
  "Becoming easily annoyed or irritable",
  "Feeling afraid, as if something awful might happen",
];

function screener(items: string[], stem: string, prefix: string): Block[] {
  return [
    { kind: "field", id: "client_name", label: "Name" },
    { kind: "field", id: "date", label: "Date" },
    { kind: "clause", id: "stem", text: stem },
    ...items.map((item, i): Block => ({ kind: "scale", id: `${prefix}_${i + 1}`, item: `${i + 1}. ${item}`, options: FREQ })),
    {
      kind: "scale",
      id: `${prefix}_difficulty`,
      item: "If you checked off any problems, how difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?",
      options: DIFFICULTY,
    },
    { kind: "clause", id: "crisis", text: CRISIS },
    { kind: "clause", id: "attribution", text: ATTRIBUTION, small: true },
  ];
}

const attribution = { id: "attribution", label: "Pfizer attribution and free-use line", citation: "PHQ Screeners terms of use", url: SOURCE, level: "practice" as const };

export const phq9: FormDef = {
  id: "phq9",
  title: "Patient Health Questionnaire (PHQ-9)",
  summary: "Nine-question depression screener, word for word. Blank copy; Aeon never scores or saves it.",
  group: "screener",
  appliesTo: "Optional, any license. Free to copy.",
  topics: ["phq", "phq9", "phq-9", "depression", "screener", "questionnaire"],
  note: "Read item 9 before the client leaves. Any answer other than \"Not at all\" needs your follow-up that day.",
  elements: [
    { id: "items", label: "All nine items, word for word", citation: "PHQ-9", url: SOURCE, level: "practice", mustSay: PHQ9_ITEMS.map((i) => new RegExp(escape(i.slice(0, 40)))) },
    { id: "scale", label: "The four answer choices", citation: "PHQ-9", url: SOURCE, level: "practice", mustSay: FREQ.map((o) => new RegExp(escape(o))) },
    { ...attribution, mustSay: [/No permission required to reproduce, translate, display or distribute/, /Pfizer/] },
    { id: "crisis", label: "988 and 911 next to the self-harm question", citation: "Practice-OS safety rule", url: "https://988lifeline.org/", level: "practice", mustSay: [/988/, /911/] },
  ],
  build: () =>
    screener(PHQ9_ITEMS, "Over the last 2 weeks, how often have you been bothered by any of the following problems? Tick one box on each line.", "phq"),
};

export const gad7: FormDef = {
  id: "gad7",
  title: "Generalized Anxiety Disorder scale (GAD-7)",
  summary: "Seven-question anxiety screener, word for word. Blank copy; Aeon never scores or saves it.",
  group: "screener",
  appliesTo: "Optional, any license. Free to copy.",
  topics: ["gad", "gad7", "gad-7", "anxiety", "screener", "questionnaire"],
  elements: [
    { id: "items", label: "All seven items, word for word", citation: "GAD-7", url: SOURCE, level: "practice", mustSay: GAD7_ITEMS.map((i) => new RegExp(escape(i.slice(0, 40)))) },
    { id: "scale", label: "The four answer choices", citation: "GAD-7", url: SOURCE, level: "practice", mustSay: FREQ.map((o) => new RegExp(escape(o))) },
    { ...attribution, mustSay: [/No permission required to reproduce, translate, display or distribute/, /Pfizer/] },
  ],
  build: () => screener(GAD7_ITEMS, "Over the last 2 weeks, how often have you been bothered by the following problems? Tick one box on each line.", "gad"),
};

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
