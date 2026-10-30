// The fictional demo practice as the Media helper sees it, shared by the media tests.
import type { MediaFacts } from "../lib/media/facts";
import { EMPTY_PT } from "../lib/media/pt-answers";

export const DANA: MediaFacts = {
  name: "Dana Reyes",
  credential: "LCPC",
  practiceName: "Reyes Counseling PLLC",
  neighborhood: "Lincoln Park",
  city: "Chicago",
  state: "IL",
  address: { street: "2400 N Example Ave, Suite 2", city: "Chicago", state: "IL", zip: "60614" },
  phone: "312-555-0142",
  email: "dana@example.com",
  telehealth: true,
  fees: [{ label: "90834 Psychotherapy, 45 min", cents: 15000 }],
  insurers: ["Blue Cross Blue Shield of Illinois", "Aetna"],
  inNetwork: ["Blue Cross Blue Shield of Illinois"],
  whoIHelp: "Adults; Couples",
  website: null,
  websiteStatus: "wants",
  education: ["MA, Clinical Mental Health Counseling, Example University [Sample], 2019"],
  isSample: true,
  answers: {
    focus: "Anxiety, big life changes, and couples who feel stuck",
    approach: "Talk therapy with practical tools, and CBT when it fits",
    firstSession: "We talk about what brought you in and what you hope will change",
    why: "I like helping people feel at home in their own lives",
    languages: "Spanish",
    yearsInPractice: 6,
    freeConsultMinutes: 15,
  },
  pt: EMPTY_PT,
};
