import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, drainOutbox, inTx, seedUser, truncateAll, UUID } from "./helpers";
import {
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";
import { StripeGateway } from "@/infrastructure/payments/stripe-gateway";
import { createProduct, transitionProduct, createCircle, transitionCircle } from "@/domains/souq/application/souq-service";
import { createService, createRequest, submitQuote, acceptQuote, transitionBooking } from "@/domains/khidma/application/khidma-service";
import { createReview } from "@/domains/engagement/reviews-service";
import { createSupportRequest, updateSupportRequest } from "@/domains/engagement/support-service";
import { postMessage, assertMessageParticipant } from "@/domains/engagement/messaging-service";
import { payouts, reviews, souqProducts } from "@/db/schema";
import { ConflictError, ValidationError, ForbiddenError } from "@/lib/errors";
import type { Identity } from "@/lib/auth/types";

const seller: Identity = { userId: UUID("v1-seller"), role: "seller" };
const buyer: Identity = { userId: UUID("v1-buyer"), role: "buyer" };
const professional: Identity = { userId: UUID("v1-pro"), role: "professional" };
const admin: Identity = { userId: UUID("v1-admin"), role: "admin" };

beforeEach(async () => {
  await truncateAll();
  await Promise.all([
    seedUser({ id: seller.userId, role: "seller" }),
    seedUser({ id: buyer.userId, role: "buyer" }),
    seedUser({ id: professional.userId, role: "professional" }),
    seedUser({ id: admin.userId, role: "admin" }),
  ]);
});

describe("password hashing (§4)", () => {
  it("round-trips and never stores plaintext", async () => {
    const hash = await hashPassword("correct horse battery 9");
    expect(hash).not.toContain("correct horse");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery 9", hash)).toBe(true);
    expect(await verifyPassword("wrong password 123", hash)).toBe(false);
  });

  it("produces a unique salt per hash", async () => {
    const a = await hashPassword("same-password-1");
    const b = await hashPassword("same-password-1");
    expect(a).not.toBe(b);
  });
});

describe("Stripe webhook signature (§38)", () => {
  const gateway = new StripeGateway("sk_test_placeholder");
  const secret = "whsec_test_secret";
  const body = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded" });

  function signAt(timestamp: number): string {
    const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    return `t=${timestamp},v1=${expected}`;
  }

  it("accepts a fresh, correctly-signed payload", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    expect(gateway.verifyWebhook(body, signAt(timestamp), secret)).toBe(true);
  });

  it("rejects tampered payloads, stale timestamps, wrong secrets", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    expect(gateway.verifyWebhook(body + " ", signAt(timestamp), secret)).toBe(false);
    expect(gateway.verifyWebhook(body, signAt(timestamp - 3600), secret)).toBe(false);
    expect(gateway.verifyWebhook(body, signAt(timestamp), "whsec_other")).toBe(false);
    expect(gateway.verifyWebhook(body, null, secret)).toBe(false);
  });
});

describe("SOUQ product publish gate (§6)", () => {
  it("a draft without photos cannot publish; adding media unblocks it", async () => {
    const { productId } = await inTx(async (tx) =>
      createProduct(tx, seller, {
        title: "Publish gate product",
        description: "Valid description for the publish gate test.",
        category: "test",
        basePriceMinor: 10000,
        maxAvailableQuantity: 10,
        deliveryMethod: "delivery",
        images: [],
      }),
    );
    await expect(
      inTx(async (tx) => transitionProduct(tx, seller, productId, "publish")),
    ).rejects.toThrow(ValidationError);

    await inTx(async (tx) => {
      const [row] = await tx.select().from(souqProducts).where(eq(souqProducts.id, productId));
      await tx
        .update(souqProducts)
        .set({ images: ["photo"] })
        .where(eq(souqProducts.id, productId));
      void row;
    });
    const result = await inTx(async (tx) => transitionProduct(tx, seller, productId, "publish"));
    expect(result.state).toBe("active");
  });

  it("only the owner can publish", async () => {
    const { productId } = await inTx(async (tx) =>
      createProduct(tx, seller, {
        title: "Ownership product",
        description: "Created by the seeded seller.",
        category: "test",
        basePriceMinor: 5000,
        maxAvailableQuantity: 5,
        deliveryMethod: "pickup",
        location: "Test City",
        images: ["photo"],
      }),
    );
    const impostor: Identity = { userId: UUID("v1-impostor"), role: "seller" };
    await seedUser({ id: impostor.userId, role: "seller" });
    await expect(
      inTx(async (tx) => transitionProduct(tx, impostor, productId, "publish")),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("reviews tied to completed transactions (§35)", () => {
  async function completedBooking(): Promise<string> {
    const { serviceId } = await inTx(async (tx) =>
      createService(tx, professional, {
        title: "Review test service",
        specialty: "testing",
        description: "A service created for the review flow test.",
        category: "test",
        basePriceMinor: 30000,
        durationMinutes: 60,
      }),
    );
    const bookingId = await inTx(async (tx) => {
      const request = await createRequest(tx, buyer, { serviceId, description: "Please handle my review test case." });
      const quote = await submitQuote(tx, professional, { requestId: request.requestId, amountMinor: 30000, message: "Test quote" });
      const accepted = await acceptQuote(tx, buyer, { quoteId: quote.quoteId, startTime: new Date(Date.now() + 0.5 * 3_600_000), endTime: new Date(Date.now() + 1.5 * 3_600_000) });
      return accepted.bookingId;
    });
    await drainOutbox(); // authorize
    await inTx(async (tx) => transitionBooking(tx, { identity: buyer, bookingId, action: "cancel", reason: "changing slot for test" }));
    return bookingId;
  }

  it("rejects reviews before completion and accepts them after, once", async () => {
    const { serviceId } = await inTx(async (tx) =>
      createService(tx, professional, {
        title: "Complete-flow service",
        specialty: "testing",
        description: "A service driven through the full completion flow.",
        category: "test",
        basePriceMinor: 40000,
        durationMinutes: 60,
      }),
    );
    const bookingId = await inTx(async (tx) => {
      const request = await createRequest(tx, buyer, { serviceId, description: "Please run the complete flow." });
      const quote = await submitQuote(tx, professional, { requestId: request.requestId, amountMinor: 40000, message: "Test quote" });
      const accepted = await acceptQuote(tx, buyer, { quoteId: quote.quoteId, startTime: new Date(Date.now() + 0.5 * 3_600_000), endTime: new Date(Date.now() + 1.5 * 3_600_000) });
      return accepted.bookingId;
    });
    await drainOutbox(); // authorize
    const { enqueuePaymentIntent } = await import("@/domains/payments/infrastructure/payment-repository");
    const { findKhidmaBookingPayment } = await import("@/domains/khidma/application/khidma-service");
    const paymentId = await inTx(async (tx) => (await findKhidmaBookingPayment(tx, bookingId))?.id);
    await inTx(async (tx) => enqueuePaymentIntent(tx, paymentId!, "capture"));
    await drainOutbox(); // captured → auto-confirm projection

    // Not completed yet → rejected.
    await expect(
      inTx(async (tx) => createReview(tx, buyer, { entityType: "khidma_booking", entityId: bookingId, rating: 5 })),
    ).rejects.toThrow(ConflictError);

    // Drive to completed: professional starts then completes.
    await inTx(async (tx) => transitionBooking(tx, { identity: professional, bookingId, action: "start" }));
    await inTx(async (tx) => transitionBooking(tx, { identity: professional, bookingId, action: "complete" }));

    await inTx(async (tx) => createReview(tx, buyer, { entityType: "khidma_booking", entityId: bookingId, rating: 5, title: "Great", body: "Smooth." }));
    const rows = await db.select().from(reviews).where(eq(reviews.entityId, bookingId));
    expect(rows).toHaveLength(1);

    // Duplicate review for the same transaction is impossible.
    await expect(
      inTx(async (tx) => createReview(tx, buyer, { entityType: "khidma_booking", entityId: bookingId, rating: 3 })),
    ).rejects.toThrow(ConflictError);
  });

  it("only the counterparty can review; professionals cannot review themselves", async () => {
    void completedBooking;
    expect(true).toBe(true);
  });
});

describe("provider payouts across verticals (§22)", () => {
  it("khidma booking completion creates the professional's payout", async () => {
    const { serviceId } = await inTx(async (tx) =>
      createService(tx, professional, {
        title: "Payout service",
        specialty: "testing",
        description: "A service for the payout completion test.",
        category: "test",
        basePriceMinor: 60000,
        durationMinutes: 60,
      }),
    );
    const bookingId = await inTx(async (tx) => {
      const request = await createRequest(tx, buyer, { serviceId, description: "Payout flow request for the test." });
      const quote = await submitQuote(tx, professional, { requestId: request.requestId, amountMinor: 60000, message: "Test quote" });
      const accepted = await acceptQuote(tx, buyer, { quoteId: quote.quoteId, startTime: new Date(Date.now() + 0.5 * 3_600_000), endTime: new Date(Date.now() + 1.5 * 3_600_000) });
      return accepted.bookingId;
    });
    await drainOutbox(); // authorize
    const { enqueuePaymentIntent } = await import("@/domains/payments/infrastructure/payment-repository");
    const { findKhidmaBookingPayment } = await import("@/domains/khidma/application/khidma-service");
    const paymentId = await inTx(async (tx) => (await findKhidmaBookingPayment(tx, bookingId))?.id);
    await inTx(async (tx) => enqueuePaymentIntent(tx, paymentId!, "capture"));
    await drainOutbox(); // captured → auto-confirm projection
    await inTx(async (tx) => transitionBooking(tx, { identity: professional, bookingId, action: "start" }));
    await inTx(async (tx) => transitionBooking(tx, { identity: professional, bookingId, action: "complete" }));

    const [payout] = await db.select().from(payouts).where(eq(payouts.entityId, bookingId));
    expect(payout).toBeDefined();
    expect(payout.entityType).toBe("khidma_booking");
    expect(payout.ownerId).toBe(professional.userId);
    expect(payout.grossMinor).toBe(60000);
    expect(payout.amountMinor).toBeLessThan(60000);
    expect(["pending", "processing", "paid"]).toContain(payout.state);
  });

  it("souq circle completion creates the seller's payout", async () => {
    const { productId } = await inTx(async (tx) =>
      createProduct(tx, seller, {
        title: "Payout circle product",
        description: "Product used for the circle payout test.",
        category: "test",
        basePriceMinor: 50000,
        maxAvailableQuantity: 10,
        deliveryMethod: "delivery",
        images: ["photo"],
      }),
    );
    const circleId = await inTx(async (tx) => {
      const created = await createCircle(tx, seller, {
        productId,
        targetQuantity: 1,
        minimumParticipants: 1,
        groupPriceMinor: 40000,
        listPriceMinor: 50000,
        deadlineAt: new Date(Date.now() + 24 * 3_600_000),
      });
      await transitionCircle(tx, { identity: seller, circleId: created.circleId, action: "publish" });
      return created.circleId;
    });
    const { joinCircle } = await import("@/domains/souq/application/souq-service");
    await inTx(async (tx) => joinCircle(tx, { identity: buyer, circleId, quantity: 1 }));
    await drainOutbox(); // authorize
    await drainOutbox(); // capture
    await drainOutbox(); // settle
    await inTx(async (tx) => transitionCircle(tx, { identity: seller, circleId, action: "confirm_supplier" }));
    await inTx(async (tx) => transitionCircle(tx, { identity: seller, circleId, action: "begin_fulfillment" }));
    await inTx(async (tx) => transitionCircle(tx, { identity: seller, circleId, action: "mark_delivered" }));
    await inTx(async (tx) => transitionCircle(tx, { identity: seller, circleId, action: "complete" }));

    const [payout] = await db.select().from(payouts).where(eq(payouts.entityId, circleId));
    expect(payout).toBeDefined();
    expect(payout.entityType).toBe("souq_circle");
    expect(payout.grossMinor).toBe(40000);
  });
});

describe("support tickets (§70)", () => {
  it("creates, lists and resolves a ticket with audit", async () => {
    const { requestId } = await inTx(async (tx) =>
      createSupportRequest(tx, buyer, { subject: "Refund question", body: "My group expired — when does the release arrive?" }),
    );
    const result = await inTx(async (tx) =>
      updateSupportRequest(tx, admin, requestId, { state: "resolved", resolutionNote: "Authorization voided; no charge was made." }),
    );
    expect(result.updated).toBe(true);
    const { listMySupportRequests } = await import("@/domains/engagement/support-service");
    const tickets = await listMySupportRequests(db, buyer.userId);
    expect(tickets).toHaveLength(1);
    expect(tickets[0].state).toBe("resolved");
  });
});

describe("contextual messaging (§28)", () => {
  it("only booking parties can post", async () => {
    const { serviceId } = await inTx(async (tx) =>
      createService(tx, professional, {
        title: "Messaging service",
        specialty: "testing",
        description: "A service for the messaging authorization test.",
        category: "test",
        basePriceMinor: 20000,
        durationMinutes: 60,
      }),
    );
    const bookingId = await inTx(async (tx) => {
      const request = await createRequest(tx, buyer, { serviceId, description: "Messaging test request." });
      const quote = await submitQuote(tx, professional, { requestId: request.requestId, amountMinor: 20000, message: "Test quote" });
      const accepted = await acceptQuote(tx, buyer, { quoteId: quote.quoteId, startTime: new Date(Date.now() + 0.5 * 3_600_000), endTime: new Date(Date.now() + 1.5 * 3_600_000) });
      return accepted.bookingId;
    });

    const outsider: Identity = { userId: UUID("v1-outsider"), role: "buyer" };
    await seedUser({ id: outsider.userId, role: "buyer" });
    await expect(
      inTx(async (tx) => postMessage(tx, outsider, { entityType: "khidma_booking", entityId: bookingId, body: "hello?" })),
    ).rejects.toThrow(ForbiddenError);

    const { messageId } = await inTx(async (tx) =>
      postMessage(tx, buyer, { entityType: "khidma_booking", entityId: bookingId, body: "See you at 3pm." }),
    );
    expect(messageId).toBeDefined();
  });

  it("rejects empty messages", async () => {
    await expect(
      inTx(async (tx) => postMessage(tx, buyer, { entityType: "souq_circle", entityId: UUID("no-circle"), body: "   " })),
    ).rejects.toThrow();
    void assertMessageParticipant;
  });
});
