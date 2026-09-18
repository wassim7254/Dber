import { krayaBookingStateEnum } from "@/db/schema/enums";
import { ForbiddenError } from "@/lib/errors";
import { defineMachine } from "@/lib/state-machine";
import type { Identity } from "@/lib/auth/types";

export type KrayaBookingState = (typeof krayaBookingStateEnum.enumValues)[number];

export const KRAYA_BOOKING_USER_ACTIONS = ["activate", "complete", "cancel"] as const;
export type KrayaBookingUserAction = (typeof KRAYA_BOOKING_USER_ACTIONS)[number];

type KrayaBookingMachineAction =
  | KrayaBookingUserAction
  | "submit"
  | "confirm"
  | "timeout"
  | "open_dispute"
  | "resolve_refund"
  | "resolve_complete"
  | "resolve_cancel";

export const krayaBookingMachine = defineMachine<KrayaBookingState, KrayaBookingMachineAction>({
  name: "kraya.booking",
  states: krayaBookingStateEnum.enumValues,
  actions: [
    "submit",
    "confirm",
    "timeout",
    "activate",
    "complete",
    "cancel",
    "open_dispute",
    "resolve_refund",
    "resolve_complete",
    "resolve_cancel",
  ],
  transitions: {
    requested: { submit: "payment_pending", cancel: "cancelled" },
    payment_pending: { confirm: "confirmed", timeout: "cancelled", cancel: "cancelled" },
    confirmed: { activate: "active", cancel: "cancelled", open_dispute: "disputed" },
    active: { complete: "completed", open_dispute: "disputed" },
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

/** Server-side permission check for user-facing rental booking actions (§41). */
export function assertKrayaBookingActionPermission(
  action: KrayaBookingUserAction,
  identity: Identity,
  booking: { renterId: string },
  asset: { ownerId: string },
): void {
  if (identity.role === "admin") return;
  if (action === "activate" || action === "complete") {
    if (asset.ownerId !== identity.userId) {
      throw new ForbiddenError("Only the asset owner can perform this action");
    }
    return;
  }
  // cancel: renter or owner.
  if (booking.renterId !== identity.userId && asset.ownerId !== identity.userId) {
    throw new ForbiddenError("You are not a party to this rental");
  }
}
