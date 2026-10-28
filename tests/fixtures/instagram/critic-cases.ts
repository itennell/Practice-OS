// Labeled captions for the Instagram critic's plain-code pass. `block` lists
// the rules that must fire (empty = must pass). Near-misses are logistics that
// share words with a blocked rule. Each caption gets the license line appended
// unless `noLicense` is set.
import type { CriticRule } from "../../../lib/instagram/critic";

export type CriticCase = { text: string; block: CriticRule[]; noLicense?: boolean; note?: string };

export const CRITIC_CASES: CriticCase[] = [
  // ---- clear passes: the five pillars
  { text: "Your first session is 50 minutes. We go over paperwork, what brings you in, and what you hope to get from therapy. Bring your insurance card if you plan to submit a superbill.", block: [] },
  { text: "Sessions are $175. We don't bill insurance directly, but we give you a superbill you can send to your insurance for possible repayment.", block: [] },
  { text: "Booking is simple: start with a free 15-minute phone call. Then pick a time that works for you. Link in bio.", block: [] },
  { text: "Meet Dana. She is a Licensed Clinical Professional Counselor in Lincoln Park, Chicago, and works with adults.", block: [] },
  { text: "We see clients in our Lincoln Park office and by secure video anywhere in Illinois.", block: [] },
  { text: "What's a superbill? It's a receipt with the codes your insurance needs to consider paying you back for out-of-network care.", block: [] },
  { text: "Running late? Text us. Sessions start on time and end on time so the next person isn't kept waiting.", block: [] },
  { text: "Cancellations: please give 24 hours' notice so someone else can use the time.", block: [] },
  // ---- near-misses that must still pass
  { text: "Clients often ask how superbills work, so here is the short version.", block: [], note: "generic 'clients ask' is logistics, not a story" },
  { text: "New clients start with a free 15-minute phone call.", block: [], note: "'new clients' + logistics" },
  { text: "Please review your superbill before you send it to your insurance.", block: [], note: "'review' as a verb" },
  { text: "Video sessions use a private link. You'll get it by email before your appointment.", block: [], note: "'you'll get' without an outcome" },
  { text: "Every first session starts with paperwork. Step 1: fill in the intake form we email you.", block: [], note: "'step 1' about paperwork" },
  { text: "Our office has free street parking on Fullerton after 6 pm.", block: [] },
  // ---- client stories
  { text: "A client of mine came in last week feeling hopeless about work, and now she's thriving.", block: ["client_story"] },
  { text: "One of my clients told me therapy changed everything for her.", block: ["client_story"] },
  { text: "I once worked with a young mom who couldn't sleep. Here's what helped.", block: ["client_story"] },
  { text: "Names and details have been changed, but this is a real story from my practice.", block: ["client_story"] },
  { text: "My patient who started in June finally feels like herself again.", block: ["client_story"] },
  // ---- testimonials
  { text: "Hear what my clients are saying about their first month!", block: ["testimonial"] },
  { text: "Loved your session? Leave us a review on Google.", block: ["testimonial"] },
  { text: "\"Dana is the best therapist I've ever had\" — J.", block: ["testimonial"] },
  { text: "Thank you for all the five-star feedback this year.", block: ["testimonial"] },
  // ---- outcome promises
  { text: "Therapy that's guaranteed to work in just 6 sessions.", block: ["outcome_promise"] },
  { text: "Book now and you'll feel better by the holidays.", block: ["outcome_promise"] },
  { text: "Get rid of your anxiety for good.", block: ["outcome_promise"] },
  // ---- method details and advice
  { text: "Try this grounding exercise before bed: 5-4-3-2-1, name five things you can see.", block: ["method_detail"] },
  { text: "Box breathing is a quick way to calm down before a meeting.", block: ["method_detail"] },
  { text: "Here are the signs that you might need therapy.", block: ["advice"] },
  { text: "How to cope with anxiety during the holidays.", block: ["advice"] },
  { text: "Five coping skills for stressful weeks.", block: ["advice"] },
  // ---- suicide and self-harm: hard stop
  { text: "September is suicide prevention month. Let's talk.", block: ["self_harm"] },
  { text: "If you have thoughts of self-harm, our first session can help.", block: ["self_harm"] },
  { text: "Feeling like you want to die some days? You're not alone.", block: ["self_harm"] },
  // ---- the rest of the plain-code rules
  { text: "Sessions are $150 for new clients this month.", block: ["invented_fee"], note: "fee list is $175 only" },
  { text: "How to book: start with a free phone call.", block: ["license_line"], noLicense: true },
];
