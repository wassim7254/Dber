import { describe, expect, it } from "vitest";

import {
  assertCircleActionPermission,
  circleMachine,
  participantPaymentMachine,
  type CircleState,
} from "@/domains/souq/domain/machine";
import { khidmaBookingMachine, khidmaQuoteMachine, khidmaRequestMachine } from "@/domains/khidma/domain/machine";
import { krayaBookingMachine, type KrayaBookingState } from "@/domains/kraya/domain/machine";
import { paymentStateEnum } from "@/db/schema/enums";
import { defineMachine } from "@/lib/state-machine";
import { ForbiddenError, InvalidStateTransitionError } from "@/lib/errors";
import type { Identity } from "@/lib/auth/types";

describe("souq circle machine", () => {
  it("walks the happy path", () => {
    let state: CircleState = "draft";
    state = circleMachine.transition(state, "publish");
    expect(state).toBe("open");
    state = circleMachine.transition(state, "reach_target");
    expect(state).toBe("locked");
    state = circleMachine.transition(state, "confirm_supplier");
    expect(state).toBe("supplier_confirmed");
    state = circleMachine.transition(state, "begin_fulfillment");
    state = circleMachine.transition(state, "mark_delivered");
    state = circleMachine.transition(state, "complete");
    expect(state).toBe("completed");
    expect(circleMachine.isTerminal("completed")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(() => circleMachine.transition("open", "complete")).toThrow(InvalidStateTransitionError);
    expect(() => circleMachine.transition("completed", "publish")).toThrow(InvalidStateTransitionError);
    expect(() => circleMachine.transition("locked", "publish" as never)).toThrow(InvalidStateTransitionError);
  });

  it("allows failure paths without backward transitions", () => {
    expect(circleMachine.transition("open", "expire")).toBe("expired");
    expect(circleMachine.transition("locked", "fail_close")).toBe("failed_closed");
    expect(circleMachine.allowedActions("expired")).toHaveLength(0);
  });
});

describe("souq participant payment machine", () => {
  it("authorizes then captures", () => {
    expect(participantPaymentMachine.transition("pending", "authorize")).toBe("authorized");
    expect(participantPaymentMachine.transition("authorized", "capture")).toBe("captured");
  });
  it("voids authorizations and refunds captures", () => {
    expect(participantPaymentMachine.transition("authorized", "void")).toBe("voided");
    expect(participantPaymentMachine.transition("captured", "refund")).toBe("refunded");
  });
});

describe("khidma machines", () => {
  it("request: quoted → booked only via accept_quote", () => {
    expect(khidmaRequestMachine.transition("quoted", "accept_quote")).toBe("booked");
    expect(() => khidmaRequestMachine.transition("requested", "accept_quote")).toThrow(InvalidStateTransitionError);
    expect(khidmaRequestMachine.transition("quoted", "submit_quote")).toBe("quoted");
  });

  it("booking: payment_pending confirms; disputed resolves forward", () => {
    expect(khidmaBookingMachine.transition("payment_pending", "confirm")).toBe("confirmed");
    expect(khidmaBookingMachine.transition("payment_pending", "timeout")).toBe("cancelled");
    expect(khidmaBookingMachine.transition("confirmed", "open_dispute")).toBe("disputed");
    expect(khidmaBookingMachine.transition("disputed", "resolve_refund")).toBe("refunded");
    expect(khidmaBookingMachine.transition("disputed", "resolve_complete")).toBe("completed");
    expect(() => khidmaBookingMachine.transition("completed", "start")).toThrow(InvalidStateTransitionError);
  });

  it("quote: only submitted quotes can be accepted", () => {
    expect(khidmaQuoteMachine.transition("submitted", "accept")).toBe("accepted");
    expect(() => khidmaQuoteMachine.transition("expired", "accept")).toThrow(InvalidStateTransitionError);
  });
});

describe("kraya booking machine", () => {
  it("requested → payment_pending → confirmed → active → completed", () => {
    let state: KrayaBookingState = "requested";
    state = krayaBookingMachine.transition(state, "submit");
    expect(state).toBe("payment_pending");
    state = krayaBookingMachine.transition(state, "confirm");
    expect(state).toBe("confirmed");
    state = krayaBookingMachine.transition(state, "activate");
    expect(state).toBe("active");
    state = krayaBookingMachine.transition(state, "complete");
    expect(state).toBe("completed");
    // completed allows only a dispute (problems discovered after return)
    expect(krayaBookingMachine.allowedActions("completed")).toEqual(["open_dispute"]);
  });

  it("captured money can never flow backward", () => {
    expect(() => krayaBookingMachine.transition("active", "confirm")).toThrow(InvalidStateTransitionError);
  });
});

describe("payment state machine coverage", () => {
  it("enum states all exist in a defined machine table", () => {
    // The payment machine is implemented via transitionPayment with explicit from→to
    // sets; this test pins the state union so adding a state forces review.
    expect([...paymentStateEnum.enumValues].sort()).toEqual(
      [
        "authorized",
        "authorization_pending",
        "capture_pending",
        "captured",
        "created",
        "failed",
        "refund_pending",
        "refunded",
        "void_pending",
        "voided",
      ].sort(),
    );
  });
});

describe("souq action permissions", () => {
  const circle = { sellerId: "seller-1" };
  const seller: Identity = { userId: "seller-1", role: "seller" };
  const otherSeller: Identity = { userId: "seller-2", role: "seller" };
  const ops: Identity = { userId: "ops-1", role: "ops_admin" };

  it("sellers own their circles", () => {
    expect(() => assertCircleActionPermission("publish", seller, circle)).not.toThrow();
    expect(() => assertCircleActionPermission("publish", otherSeller, circle)).toThrow(ForbiddenError);
  });

  it("fail_close is ops-only", () => {
    expect(() => assertCircleActionPermission("fail_close", ops, circle)).not.toThrow();
    expect(() => assertCircleActionPermission("fail_close", seller, circle)).toThrow(ForbiddenError);
  });
});

describe("machine kernel exhaustiveness", () => {
  it("adding a state without a row is a compile error; missing states throw at runtime", () => {
    const machine = defineMachine<"a" | "b", "go" | "back">({
      name: "toy",
      states: ["a", "b"],
      actions: ["go", "back"],
      transitions: { a: { go: "b" }, b: { back: "a" } },
    });
    expect(machine.transition("a", "go")).toBe("b");
    expect(() => machine.transition("a", "back")).toThrow(InvalidStateTransitionError);
  });
});
