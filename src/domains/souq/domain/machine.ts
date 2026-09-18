import { circleStateEnum, participantPaymentStatusEnum } from "@/db/schema/enums";
import { defineMachine } from "@/lib/state-machine";
import type { Identity } from "@/lib/auth/types";
import { ForbiddenError } from "@/lib/errors";

export type CircleState = (typeof circleStateEnum.enumValues)[number];

export const CIRCLE_USER_ACTIONS = [
  "publish",
  "cancel",
  "confirm_supplier",
  "fail_close",
  "begin_fulfillment",
  "mark_delivered",
  "complete",
] as const;
export type CircleUserAction = (typeof CIRCLE_USER_ACTIONS)[number];

/** System-derived action (fired inside the join transaction on reaching target). */
export type CircleSystemAction = "reach_target" | "expire";

export const CIRCLE_ALL_ACTIONS = [...CIRCLE_USER_ACTIONS, "reach_target", "expire"] as const;
export type CircleAction = (typeof CIRCLE_ALL_ACTIONS)[number];

export const circleMachine = defineMachine<CircleState, CircleAction>({
  name: "souq.circle",
  states: circleStateEnum.enumValues,
  actions: CIRCLE_ALL_ACTIONS,
  transitions: {
    draft: { publish: "open" },
    open: { reach_target: "locked", expire: "expired", cancel: "cancelled" },
    locked: { confirm_supplier: "supplier_confirmed", fail_close: "failed_closed" },
    supplier_confirmed: { begin_fulfillment: "fulfilling" },
    fulfilling: { mark_delivered: "delivered" },
    delivered: { complete: "completed" },
    completed: {},
    expired: {},
    cancelled: {},
    failed_closed: {},
  },
});

export const participantPaymentMachine = defineMachine<
  (typeof participantPaymentStatusEnum.enumValues)[number],
  "request" | "authorize" | "capture" | "void" | "refund" | "fail"
>({
  name: "souq.participant_payment",
  states: participantPaymentStatusEnum.enumValues,
  actions: ["request", "authorize", "capture", "void", "refund", "fail"],
  transitions: {
    none: { request: "pending" },
    pending: { authorize: "authorized", fail: "failed" },
    authorized: { capture: "captured", void: "voided", refund: "refunded" },
    captured: { refund: "refunded" },
    refunded: {},
    voided: {},
    failed: {},
  },
});

const SELLER_CIRCLE_ACTIONS = new Set<string>([
  "publish",
  "cancel",
  "confirm_supplier",
  "begin_fulfillment",
  "mark_delivered",
  "complete",
]);

/** Server-side permission check for a circle lifecycle action (§41). */
export function assertCircleActionPermission(
  action: CircleUserAction,
  identity: Identity,
  circle: { sellerId: string },
): void {
  if (action === "fail_close") {
    if (identity.role !== "ops_admin" && identity.role !== "admin") {
      throw new ForbiddenError("Only operations can fail-close a circle");
    }
    return;
  }
  if (!SELLER_CIRCLE_ACTIONS.has(action)) {
    throw new ForbiddenError(`Unknown circle action: ${action}`);
  }
  if (identity.role !== "seller" && identity.role !== "admin") {
    throw new ForbiddenError("Only the seller can perform this action");
  }
  if (identity.role !== "admin" && circle.sellerId !== identity.userId) {
    throw new ForbiddenError("You do not own this circle");
  }
}
