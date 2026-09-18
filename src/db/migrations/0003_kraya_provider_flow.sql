CREATE TYPE "public"."payout_state" AS ENUM('pending', 'processing', 'paid', 'failed');--> statement-breakpoint
CREATE TABLE "kraya_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kraya_availability_window_order" CHECK ("kraya_availability"."end_time" > "kraya_availability"."start_time")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"gross_minor" bigint NOT NULL,
	"fee_minor" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"state" "payout_state" DEFAULT 'pending' NOT NULL,
	"provider" "payment_provider" DEFAULT 'mock' NOT NULL,
	"provider_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_booking_unique" UNIQUE("booking_id"),
	CONSTRAINT "payouts_provider_ref_unique" UNIQUE("provider","provider_ref"),
	CONSTRAINT "payouts_amounts_positive" CHECK ("payouts"."gross_minor" > 0 AND "payouts"."fee_minor" >= 0 AND "payouts"."amount_minor" = "payouts"."gross_minor" - "payouts"."fee_minor" AND "payouts"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "kraya_assets" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "kraya_assets" ADD COLUMN "rules" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "kraya_assets" ADD COLUMN "min_duration_hours" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "kraya_availability" ADD CONSTRAINT "kraya_availability_asset_id_kraya_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."kraya_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kraya_availability" ADD CONSTRAINT "kraya_availability_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_booking_id_rental_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kraya_availability_asset_idx" ON "kraya_availability" USING btree ("asset_id","start_time");--> statement-breakpoint
CREATE INDEX "payouts_owner_idx" ON "payouts" USING btree ("owner_id","state");--> statement-breakpoint
CREATE INDEX "payouts_state_idx" ON "payouts" USING btree ("state");--> statement-breakpoint
ALTER TABLE "kraya_assets" ADD CONSTRAINT "kraya_assets_min_duration_positive" CHECK ("kraya_assets"."min_duration_hours" >= 1);