import { rescheduleFromOffer } from "../frontdesk/booking";
import type { Executor } from "./types";

// A booked caller picked a new time: re-check it, move the booking, text the confirmation.
export const consultReschedule: Executor = (approval) => rescheduleFromOffer(approval.id, approval.payload);
