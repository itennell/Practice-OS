import { ComingNext } from "@/components/coming-next";

export const metadata = { title: "Front Desk · Practice-OS" };

export default function Page() {
  return (
    <ComingNext title="Front Desk" orb="orb-front-desk">
      Your practice phone number: missed calls get a text with open consult times, and callers can book, reschedule or cancel by text.
    </ComingNext>
  );
}
