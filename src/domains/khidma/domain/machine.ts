import {
  khidmaBookingStateEnum,
  khidmaRequestStateEnum,
  quoteStateEnum,
} from "@/db/schema/enums";
import { ForbiddenError } from "@/lib/errors";
import { defineMachine } from "@/lib/state-machine";
import type { Identity } from "@/lib/auth/types";

export type KhidmaBookingState = (typeof khidmaBookingStateEnum.enumValues)[number];

export const KHIDMA_BOOKING_USER_ACTIONS = ["start", "complete", "cancel"] as const;
export type KhidmaBookingUserAction = (typeof KHIDMA_BOOKING_USER_ACTIONS)[number];

type KhidmaBookingMachineAction =
  | KhidmaBookingUserAction
  | "confirm"
  | "timeout"
  | "open_dispute"
  | "resolve_refund"
  | "resolve_complete"
  | "resolve_cancel";

export const khidmaBookingMachine = defineMachine<KhidmaBookingState, KhidmaBookingMachineAction>({
  name: "khidma.booking",
  states: khidmaBookingStateEnum.enumValues,
  actions: [
    "confirm",
    "timeout",
    "start",
    "complete",
    "cancel",
    "open_dispute",
    "resolve_refund",
    "resolve_complete",
    "resolve_cancel",
  ],
  transitions: {
    payment_pending: { confirm: "confirmed", timeout: "cancelled", cancel: "cancelled" },
    confirmed: { start: "in_progress", cancel: "cancelled", open_dispute: "disputed" },
    in_progress: { complete: "completed", open_dispute: "disputed" },
    completed: { open_dispute: "disputed" },
    cancelled: {},
    disputed: {
      resolve_refund: "refunded",
      resolve_complete: "completed",
      resolve_cancel: "cancelled",
    },
    refunded: {},
  },
});

export type KhidmaRequestState = (typeof khidmaRequestStateEnum.enumValues)[number];

export const khidmaRequestMachine = defineMachine<
  KhidmaRequestState,
  "submit_quote" | "accept_quote" | "cancel" | "expire"
>({
  name: "khidma.request",
  states: khidmaRequestStateEnum.enumValues,
  actions: ["submit_quote", "accept_quote", "cancel", "expire"],
  transitions: {
    requested: { submit_quote: "quoted", cancel: "cancelled", expire: "expired" },
    // Additional quotes keep the request in `quoted`.
    quoted: { submit_quote: "quoted", accept_quote: "booked", cancel: "cancelled", expire: "expired" },
    booked: {},
    expired: {},
    cancelled: {},
  },
});

export type KhidmaQuoteState = (typeof quoteStateEnum.enumValues)[number];

export const khidmaQuoteMachine = defineMachine<
  KhidmaQuoteState,
  "accept" | "reject" | "withdraw" | "expire"
>({
  name: "khidma.quote",
  states: quoteStateEnum.enumValues,
  actions: ["accept", "reject", "withdraw", "expire"],
  transitions: {
    submitted: { accept: "accepted", reject: "rejected", withdraw: "withdrawn", expire: "expired" },
    accepted: {},
    rejected: {},
    withdrawn: {},
    expired: {},
  },
});

/** Server-side permission check for user-facing booking actions (§41). */
export function assertKhidmaBookingActionPermission(
  action: KhidmaBookingUserAction,
  identity: Identity,
  booking: { buyerId: string; professionalId: string },
): void {
  if (action === "start" || action === "complete") {
    if (identity.role !== "professional" && identity.role !== "admin") {
      throw new ForbiddenError("Only the professional can perform this action");
    }
    if (identity.role !== "admin" && booking.professionalId !== identity.userId) {
      throw new ForbiddenError("You do not own this booking");
    }
    return;
  }
  // cancel: either side of the booking may cancel before it starts.
  if (identity.role === "admin") return;
  if (booking.buyerId !== identity.userId && booking.professionalId !== identity.userId) {
    throw new ForbiddenError("You are not a party to this booking");
  }
}
