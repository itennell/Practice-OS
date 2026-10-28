import { bookFromOffer } from "../frontdesk/booking";
import type { Executor } from "./types";

// A caller replied 1, 2 or 3: re-check the time, book it, text the confirmation.
export const consultBooking: Executor = (approval) => bookFromOffer(approval.id, approval.payload);
