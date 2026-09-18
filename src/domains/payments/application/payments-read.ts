import { eq } from "drizzle-orm";

import { groupBuyCircles, groupBuyParticipants, khidmaBookings, krayaAssets, rentalBookings, souqProducts } from "@/db/schema";
import type { DbExecutor } from "@/db/tx";
import { ResourceNotFoundError } from "@/lib/errors";
import { getPaymentById, type PaymentRow } from "@/domains/payments/infrastructure/payment-repository";

export interface CheckoutView {
  payment: {
    id: string;
    state: string;
    amountMinor: number;
    currency: string;
    category: string;
    createdAt: string;
  };
  item: {
    title: string;
    subtitle: string;
    vertical: "SOUQ" | "KHIDMA" | "KRAYA";
    detailHref: string | null;
  };
  lines: { label: string; amountMinor: number }[];
  policy: string;
  depositMinor?: number;
}

/** Assembles the universal checkout summary (§25) from server-authoritative data. */
export async function getCheckoutView(db: DbExecutor, paymentId: string): Promise<CheckoutView> {
  const payment: PaymentRow | null = await getPaymentById(db, paymentId);
  if (!payment) throw new ResourceNotFoundError("Payment", paymentId);

  const base = {
    payment: {
      id: payment.id,
      state: payment.state,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      category: payment.category,
      createdAt: payment.createdAt.toISOString(),
    },
  };

  if (payment.category === "khidma_service" && payment.khidmaBookingId) {
    const [booking] = await db
      .select()
      .from(khidmaBookings)
      .where(eq(khidmaBookings.id, payment.khidmaBookingId))
      .limit(1);
    if (booking) {
      return {
        ...base,
        item: {
          title: booking.serviceTitleSnapshot,
          subtitle: `Service booking · ${booking.startTime.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
          vertical: "KHIDMA",
          detailHref: `/activity/khidma/${booking.id}`,
        },
        lines: [{ label: "Service charge", amountMinor: payment.amountMinor }],
        policy: "Full refund ≥24h before start; 50% within 24h. After start, open a dispute.",
      };
    }
  }

  if (payment.krayaBookingId) {
    const [booking] = await db
      .select()
      .from(rentalBookings)
      .where(eq(rentalBookings.id, payment.krayaBookingId))
      .limit(1);
    if (booking) {
      const [asset] = await db.select().from(krayaAssets).where(eq(krayaAssets.id, booking.assetId)).limit(1);
      const days = Math.max(
        1,
        Math.ceil((booking.endTime.getTime() - booking.startTime.getTime()) / 86_400_000),
      );
      const isDeposit = payment.category === "kraya_deposit";
      return {
        ...base,
        item: {
          title: asset?.title ?? "Rental booking",
          subtitle: `Rental · ${days} day${days === 1 ? "" : "s"} · ${booking.startTime.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} → ${booking.endTime.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
          vertical: "KRAYA",
          detailHref: `/activity/kraya/${booking.id}`,
        },
        lines: [
          isDeposit
            ? { label: "Refundable deposit hold", amountMinor: payment.amountMinor }
            : { label: `Rental charge (${days} day${days === 1 ? "" : "s"})`, amountMinor: payment.amountMinor },
        ],
        policy: "Full refund ≥24h before start; 50% within 24h; deposit always released after return.",
        ...(isDeposit ? { depositMinor: payment.amountMinor } : {}),
      };
    }
  }

  // Souq join payments: resolve via participant → circle.
  if (payment.category === "souq_join" && payment.souqParticipantId) {
    const [row] = await db
      .select({
        title: souqProducts.title,
        state: groupBuyCircles.state,
        circleId: groupBuyCircles.id,
        priceMinor: groupBuyCircles.groupPriceMinor,
        quantity: groupBuyParticipants.quantity,
      })
      .from(groupBuyParticipants)
      .innerJoin(groupBuyCircles, eq(groupBuyParticipants.circleId, groupBuyCircles.id))
      .innerJoin(souqProducts, eq(groupBuyCircles.productId, souqProducts.id))
      .where(eq(groupBuyParticipants.id, payment.souqParticipantId))
      .limit(1);
    if (row) {
      return {
        ...base,
        item: {
          title: row.title,
          subtitle: `Group buy · ${row.state === "locked" ? "group locked — captured on confirmation" : "authorization held until the group locks"}`,
          vertical: "SOUQ",
          detailHref: `/souq/${row.circleId}`,
        },
        lines: [
          {
            label: `Group price × ${row.quantity}`,
            amountMinor: payment.amountMinor,
          },
        ],
        policy: "Authorized now, captured only when the group reaches its target. Fully released if the group expires or is cancelled.",
      };
    }
  }

  throw new ResourceNotFoundError("Checkout context for payment", paymentId);
}
