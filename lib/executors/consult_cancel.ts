import { cancelBooking } from "../frontdesk/booking";
import type { Executor } from "./types";

// A booked caller replied C: cancel on her calendar and text the confirmation.
export const consultCancel: Executor = (approval) => cancelBooking(approval.id, approval.payload);
