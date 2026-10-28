// The five things Instagram posts may be about (AGENTS.md > Instagram posts:
// practice logistics only). `topic` is the practice_os.posts column value.
export type PillarId = "first_session" | "fees_superbills" | "how_to_book" | "meet_the_clinician" | "office_telehealth";

export type Pillar = { id: PillarId; label: string; brief: string; scene: string };

export const PILLARS: Pillar[] = [
  {
    id: "first_session",
    label: "Your first session",
    brief: "What happens in a first session: how long it is, the paperwork, what she'll ask about, what to bring.",
    scene: "a first visit: a welcoming quiet office corner with a chair, a plant and morning light",
  },
  {
    id: "fees_superbills",
    label: "Fees and superbills",
    brief: "What a session costs (only prices from her fee list), whether she takes insurance, and how a superbill lets clients ask their insurance to pay them back.",
    scene: "paying for sessions: a tidy desk with a folder, a pen and a calculator, seen softly from above",
  },
  {
    id: "how_to_book",
    label: "How to book",
    brief: "How to book: the free 15-minute call, then picking a time; where the booking link is.",
    scene: "booking an appointment: a calendar page and a phone resting on a warm table",
  },
  {
    id: "meet_the_clinician",
    label: "Meet the clinician",
    brief: "Who the clinician is: her credential, where she practices, who she works with. Facts only, no claims about results.",
    scene: "meeting the therapist: a bright, calm practice room with a bookshelf",
  },
  {
    id: "office_telehealth",
    label: "Office and telehealth",
    brief: "Where sessions happen: the office neighborhood, getting there, and video sessions from home.",
    scene: "the office and video sessions: a sunny city street corner and a laptop on a kitchen table",
  },
];

export const PILLAR_BY_ID = new Map(PILLARS.map((p) => [p.id, p]));
