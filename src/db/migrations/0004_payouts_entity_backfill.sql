CREATE TYPE "public"."auth_token_type" AS ENUM('email_verification', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."delivery_method" AS ENUM('delivery', 'pickup', 'both');--> statement-breakpoint
CREATE TYPE "public"."message_target_type" AS ENUM('souq_circle', 'khidma_booking', 'kraya_booking');--> statement-breakpoint
CREATE TYPE "public"."moderation_entity_type" AS ENUM('souq_product', 'khidma_service', 'kraya_asset');--> statement-breakpoint
CREATE TYPE "public"."payout_entity_type" AS ENUM('souq_circle', 'khidma_booking', 'kraya_booking');--> statement-breakpoint
CREATE TYPE "public"."review_entity_type" AS ENUM('souq_circle', 'khidma_booking', 'kraya_booking');--> statement-breakpoint
CREATE TYPE "public"."support_state" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'pending_review', 'verified');--> statement-breakpoint
ALTER TYPE "public"."payment_provider" ADD VALUE 'stripe';--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "auth_token_type" NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"disabled_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professional_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"specialties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"service_area" text DEFAULT '' NOT NULL,
	"years_experience" integer,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"portfolio" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"service_mode" text DEFAULT 'both' NOT NULL,
	"payout_handle" text DEFAULT '' NOT NULL,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_provider_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"country" text DEFAULT 'MA' NOT NULL,
	"rental_policies" text DEFAULT '' NOT NULL,
	"payout_handle" text DEFAULT '' NOT NULL,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"store_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"city" text DEFAULT '' NOT NULL,
	"country" text DEFAULT 'MA' NOT NULL,
	"delivery_info" text DEFAULT '' NOT NULL,
	"pickup_info" text DEFAULT '' NOT NULL,
	"payout_handle" text DEFAULT '' NOT NULL,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_id" uuid NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "listing_moderations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "moderation_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"moderated_by" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "message_target_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_body_nonempty" CHECK (length(trim("messages"."body")) > 0)
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "review_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_entity_author_unique" UNIQUE("entity_type","entity_id","author_id"),
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "support_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"entity_type" "audit_entity_type",
	"entity_id" uuid,
	"state" "support_state" DEFAULT 'open' NOT NULL,
	"resolution_note" text,
	"handled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_subject_nonempty" CHECK (length(trim("support_requests"."subject")) > 0)
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"alt_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploads_size_positive" CHECK ("uploads"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "payouts" DROP CONSTRAINT "payouts_booking_unique";--> statement-breakpoint
ALTER TABLE "souq_products" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "booking_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "souq_products" ADD COLUMN "subcategory" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "souq_products" ADD COLUMN "sku" text;--> statement-breakpoint
ALTER TABLE "souq_products" ADD COLUMN "unit" text DEFAULT 'unit' NOT NULL;--> statement-breakpoint
ALTER TABLE "souq_products" ADD COLUMN "max_available_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "souq_products" ADD COLUMN "delivery_method" "delivery_method" DEFAULT 'delivery' NOT NULL;--> statement-breakpoint
ALTER TABLE "souq_products" ADD COLUMN "delivery_fee_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "souq_products" ADD COLUMN "fulfillment_hours" integer DEFAULT 48 NOT NULL;--> statement-breakpoint
ALTER TABLE "souq_products" ADD COLUMN "location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "entity_type" "payout_entity_type";--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "entity_id" uuid;--> statement-breakpoint
-- Backfill: every existing payout derives from a completed rental.
UPDATE "payouts" SET "entity_type" = 'kraya_booking', "entity_id" = "booking_id" WHERE "booking_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "entity_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_profiles" ADD CONSTRAINT "professional_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_provider_profiles" ADD CONSTRAINT "rental_provider_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_moderations" ADD CONSTRAINT "listing_moderations_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_subject_id_users_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_tokens_user_idx" ON "auth_tokens" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "listing_moderations_entity_idx" ON "listing_moderations" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "listing_moderations_created_idx" ON "listing_moderations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "messages" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "reviews_subject_idx" ON "reviews" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "reviews_entity_idx" ON "reviews" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "support_requests_user_idx" ON "support_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "support_requests_state_idx" ON "support_requests" USING btree ("state");--> statement-breakpoint
CREATE INDEX "uploads_owner_idx" ON "uploads" USING btree ("owner_id","created_at");--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_entity_unique" UNIQUE("entity_type","entity_id");--> statement-breakpoint
ALTER TABLE "souq_products" ADD CONSTRAINT "souq_products_delivery_fee_nonnegative" CHECK ("souq_products"."delivery_fee_minor" >= 0);--> statement-breakpoint
ALTER TABLE "souq_products" ADD CONSTRAINT "souq_products_max_available_nonnegative" CHECK ("souq_products"."max_available_quantity" >= 0);--> statement-breakpoint
ALTER TABLE "souq_products" ADD CONSTRAINT "souq_products_fulfillment_positive" CHECK ("souq_products"."fulfillment_hours" > 0);