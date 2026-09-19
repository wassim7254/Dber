import postgres from "postgres";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, drainOutbox, inTx, seedUser, truncateAll, UUID } from "./helpers";
import { createCircle, createProduct, joinCircle, transitionCircle } from "@/domains/souq/application/souq-service";
import { getPaymentById } from "@/domains/payments/infrastructure/payment-repository";
import { groupBuyCircles, groupBuyParticipants } from "@/db/schema";
import type { Identity } from "@/lib/auth/types";
import { ConflictError, InsufficientCapacityError } from "@/lib/errors";

const TEST_URL = "postgres://dber:dber_dev_password@localhost:5432/dber_test";
const seller: Identity = { userId: UUID("seller"), role: "seller" };
const admin: Identity = { userId: UUID("admin"), role: "admin" };

beforeEach(async () => {
  await truncateAll();
  await seedUser({ id: seller.userId, role: "seller" });
  await seedUser({ id: admin.userId, role: "admin" });
});

async function createOpenCircle(targetQuantity: number): Promise<string> {
  return inTx(async (tx) => {
    const { productId } = await createProduct(tx, seller, {
      title: "Test product",
      description: "A product created for testing purposes.",
      category: "test",
      basePriceMinor: 50000,
      maxAvailableQuantity: targetQuantity,
      deliveryMethod: "delivery",
      images: [],
    });
    const { circleId } = await createCircle(tx, seller, {
      productId,
      targetQuantity,
      minimumParticipants: 1,
      groupPriceMinor: 39000,
      listPriceMinor: 50000,
      deadlineAt: new Date(Date.now() + 48 * 3_600_000),
    });
    await transitionCircle(tx, { identity: seller, circleId, action: "publish" });
    return circleId;
  });
}

describe("souq join — capacity invariants (§21/§63)", () => {
  it("100 concurrent joins on a capacity-100 circle yield exactly 100 participants", async () => {
    const circleId = await createOpenCircle(100);
    const buyers = Array.from({ length: 100 }, (_, index) => ({
      identity: { userId: UUID(`buyer-${index}`), role: "buyer" as const },
      circleId,
      quantity: 1,
    }));
    for (const buyer of buyers) {
      await seedUser({ id: buyer.identity.userId, role: "buyer" });
    }

    // Dedicated pool so all 100 transactions genuinely overlap.
    const pool = postgres(TEST_URL, { max: 40 });
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const schemaModule = await import("@/db/schema");
    const parallelDb = drizzle(pool, { schema: schemaModule });

    const results = await Promise.all(
      buyers.map((input) =>
        parallelDb.transaction((tx) => joinCircle(tx as never, input)),
      ),
    );
    expect(results).toHaveLength(100);

    const [circle] = await db
      .select({ currentQuantity: groupBuyCircles.currentQuantity, state: groupBuyCircles.state })
      .from(groupBuyCircles)
      .where(eq(groupBuyCircles.id, circleId));
    expect(circle.currentQuantity).toBe(100);
    expect(circle.state).toBe("locked"); // target reached → locked in the winning join transaction

    const participants = await db.select().from(groupBuyParticipants);
    expect(participants).toHaveLength(100);
    await pool.end();
  });

  it("last-slot race: only one of many concurrent joiners wins", async () => {
    const circleId = await createOpenCircle(1);
    const contenders = Array.from({ length: 15 }, (_, index) => ({
      identity: { userId: UUID(`racer-${index}`), role: "buyer" as const },
      circleId,
      quantity: 1,
    }));
    for (const contender of contenders) {
      await seedUser({ id: contender.identity.userId, role: "buyer" });
    }

    const results = await Promise.allSettled(
      contenders.map((input) => db.transaction((tx) => joinCircle(tx, input))),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    for (const result of results.filter((r) => r.status === "rejected")) {
      const reason = (result as PromiseRejectedResult).reason;
      // Capacity is 1, so the losers see either "no capacity" or, once the
      // winner has locked the circle, the (correct) state conflict.
      const acceptable =
        reason instanceof InsufficientCapacityError ||
        (reason instanceof ConflictError && /locked|capacity/.test(reason.message));
      expect(acceptable).toBe(true);
    }
    const [circle] = await db
      .select({ currentQuantity: groupBuyCircles.currentQuantity })
      .from(groupBuyCircles)
      .where(eq(groupBuyCircles.id, circleId));
    expect(circle.currentQuantity).toBe(1);
  });

  it("rejects duplicate joins and keeps capacity intact", async () => {
    const circleId = await createOpenCircle(5);
    const buyer: Identity = { userId: UUID("dupe-buyer"), role: "buyer" };
    await seedUser({ id: buyer.userId, role: "buyer" });
    await db.transaction((tx) => joinCircle(tx, { identity: buyer, circleId, quantity: 1 }));
    await expect(
      db.transaction((tx) => joinCircle(tx, { identity: buyer, circleId, quantity: 1 })),
    ).rejects.toBeInstanceOf(ConflictError);
    const [circle] = await db
      .select({ currentQuantity: groupBuyCircles.currentQuantity })
      .from(groupBuyCircles)
      .where(eq(groupBuyCircles.id, circleId));
    expect(circle.currentQuantity).toBe(1);
  });
});

describe("souq payment lifecycle", () => {
  it("join → authorize → lock → capture; participant status tracks payments", async () => {
    const circleId = await createOpenCircle(1);
    const buyer: Identity = { userId: UUID("lifecycle-buyer"), role: "buyer" };
    await seedUser({ id: buyer.userId, role: "buyer" });

    const result = await db.transaction((tx) => joinCircle(tx, { identity: buyer, circleId, quantity: 1 }));
    expect(result.state).toBe("locked"); // target=1 reached instantly

    await drainOutbox(); // authorize + auto-capture (circle already locked)

    const payment = await getPaymentById(db, String(result.paymentId));
    expect(payment?.state).toBe("captured");
    expect(payment?.capturedMinor).toBe(39000);

    const [participant] = await db
      .select()
      .from(groupBuyParticipants)
      .where(eq(groupBuyParticipants.id, String(result.participantId)));
    expect(participant.paymentStatus).toBe("captured");
  });

  it("expire releases authorizations", async () => {
    const { expireOpenCircles } = await import("@/domains/souq/application/souq-service");
    const circleId = await inTx(async (tx) => {
      const { productId } = await createProduct(tx, seller, {
        title: "Expiring product",
        description: "Created for the expiration test case.",
        category: "test",
        basePriceMinor: 10000,
        maxAvailableQuantity: 50,
        deliveryMethod: "delivery",
        images: [],
      });
      const { circleId: created } = await createCircle(tx, seller, {
        productId,
        targetQuantity: 5,
        minimumParticipants: 1,
        groupPriceMinor: 8000,
        listPriceMinor: 10000,
        deadlineAt: new Date(Date.now() + 3_600_000),
      });
      await transitionCircle(tx, { identity: seller, circleId: created, action: "publish" });
      return created;
    });
    const buyer: Identity = { userId: UUID("expire-buyer"), role: "buyer" };
    await seedUser({ id: buyer.userId, role: "buyer" });
    const joined = await db.transaction((tx) => joinCircle(tx, { identity: buyer, circleId, quantity: 1 }));
    await drainOutbox(); // authorize

    // Simulate the passage of time (deadlines are immutable by CHECK constraint,
    // so backdate creation together with the deadline).
    await db.execute(
      (await import("drizzle-orm")).sql`UPDATE group_buy_circles SET created_at = now() - interval '2 hours', deadline_at = now() - interval '1 hour' WHERE id = ${circleId}`,
    );

    const { expired } = await expireOpenCircles(db);
    expect(expired).toBe(1);
    await drainOutbox(); // void intent → voided

    const payment = await getPaymentById(db, String(joined.paymentId));
    expect(payment?.state).toBe("voided");
  });

  it("fail_close refunds captured payments with a required reason", async () => {
    const circleId = await createOpenCircle(1);
    const buyer: Identity = { userId: UUID("failclose-buyer"), role: "buyer" };
    await seedUser({ id: buyer.userId, role: "buyer" });
    const joined = await db.transaction((tx) => joinCircle(tx, { identity: buyer, circleId, quantity: 1 }));
    await drainOutbox(); // authorize + capture (locked)

    await db.transaction((tx) =>
      transitionCircle(tx, { identity: admin, circleId, action: "fail_close", reason: "Supplier cannot fulfill" }),
    );
    await drainOutbox(); // refund request → provider → completed

    const payment = await getPaymentById(db, String(joined.paymentId));
    expect(payment?.state).toBe("refunded");
    expect(payment?.refundedMinor).toBe(39000);
  });
});
