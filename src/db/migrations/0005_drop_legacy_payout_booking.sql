ALTER TABLE "payouts" DROP CONSTRAINT "payouts_booking_id_rental_bookings_id_fk";
--> statement-breakpoint
ALTER TABLE "payouts" DROP COLUMN "booking_id";