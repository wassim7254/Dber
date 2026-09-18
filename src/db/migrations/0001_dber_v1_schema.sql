CREATE TYPE "public"."asset_category" AS ENUM('equipment', 'vehicle', 'space', 'tool', 'other');--> statement-breakpoint
CREATE TYPE "public"."audit_entity_type" AS ENUM('souq_product', 'souq_circle', 'souq_participant', 'khidma_request', 'khidma_quote', 'khidma_booking', 'khidma_service', 'kraya_asset', 'kraya_booking', 'rental_contract', 'payment', 'refund', 'cancellation_request', 'dispute', 'user');--> statement-breakpoint
CREATE TYPE "public"."cancellation_state" AS ENUM('pending', 'approved', 'executed', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."cancellation_target_type" AS ENUM('souq_circle', 'khidma_booking', 'kraya_booking');--> statement-breakpoint
CREATE TYPE "public"."circle_state" AS ENUM('draft', 'open', 'locked', 'supplier_confirmed', 'fulfilling', 'delivered', 'completed', 'expired', 'cancelled', 'failed_closed');--> statement-breakpoint
CREATE TYPE "public"."dispute_resolution" AS ENUM('force_refund', 'force_complete', 'partial_refund', 'dismiss');--> statement-breakpoint
CREATE TYPE "public"."dispute_state" AS ENUM('opened', 'under_review', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."idempotency_status" AS ENUM('in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."khidma_booking_state" AS ENUM('payment_pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'disputed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."khidma_request_state" AS ENUM('requested', 'quoted', 'booked', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."kraya_booking_state" AS ENUM('requested', 'payment_pending', 'confirmed', 'active', 'completed', 'cancelled', 'disputed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('draft', 'active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('group_progress', 'group_locked', 'booking_confirmed', 'booking_cancelled', 'rental_starting', 'payment_attention', 'refund_completed', 'dispute_update');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."participant_payment_status" AS ENUM('none', 'pending', 'authorized', 'captured', 'refunded', 'voided', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_category" AS ENUM('souq_join', 'khidma_service', 'kraya_rental', 'kraya_deposit');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('mock');--> statement-breakpoint
CREATE TYPE "public"."payment_state" AS ENUM('created', 'authorization_pending', 'authorized', 'capture_pending', 'captured', 'void_pending', 'voided', 'refund_pending', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."quote_state" AS ENUM('submitted', 'accepted', 'rejected', 'withdrawn', 'expired');--> statement-breakpoint
CREATE TYPE "public"."refund_state" AS ENUM('requested', 'provider_pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."saved_entity_type" AS ENUM('souq_product', 'khidma_service', 'kraya_asset', 'professional');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "group_buy_circles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"target_quantity" integer NOT NULL,
	"minimum_participants" integer NOT NULL,
	"current_quantity" integer DEFAULT 0 NOT NULL,
	"group_price_minor" bigint NOT NULL,
	"list_price_minor" bigint NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"state" "circle_state" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circles_target_positive" CHECK ("group_buy_circles"."target_quantity" > 0),
	CONSTRAINT "circles_min_participants_positive" CHECK ("group_buy_circles"."minimum_participants" > 0),
	CONSTRAINT "circles_quantity_within_target" CHECK ("group_buy_circles"."current_quantity" >= 0 AND "group_buy_circles"."current_quantity" <= "group_buy_circles"."target_quantity"),
	CONSTRAINT "circles_group_price_positive" CHECK ("group_buy_circles"."group_price_minor" > 0),
	CONSTRAINT "circles_list_price_positive" CHECK ("group_buy_circles"."list_price_minor" > 0),
	CONSTRAINT "circles_deadline_after_creation" CHECK ("group_buy_circles"."deadline_at" > "group_buy_circles"."created_at")
);
--> statement-breakpoint
CREATE TABLE "group_buy_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"payment_status" "participant_payment_status" DEFAULT 'none' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_buy_participants_circle_user_unique" UNIQUE("circle_id","user_id"),
	CONSTRAINT "participants_quantity_positive" CHECK ("group_buy_participants"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "souq_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"base_price_minor" bigint NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"status" "listing_status" DEFAULT 'active' NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "souq_products_base_price_nonnegative" CHECK ("souq_products"."base_price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "khidma_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"professional_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	CONSTRAINT "khidma_availability_slot_unique" UNIQUE("professional_id","weekday","start_minute"),
	CONSTRAINT "khidma_availability_weekday" CHECK ("khidma_availability"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "khidma_availability_window" CHECK ("khidma_availability"."end_minute" > "khidma_availability"."start_minute")
);
--> statement-breakpoint
CREATE TABLE "khidma_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"professional_id" uuid NOT NULL,
	"service_id" uuid,
	"service_title_snapshot" text NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"price_snapshot_minor" bigint NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"state" "khidma_booking_state" DEFAULT 'payment_pending' NOT NULL,
	"state_before_dispute" "khidma_booking_state",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "khidma_bookings_quote_unique" UNIQUE("quote_id"),
	CONSTRAINT "khidma_bookings_window_order" CHECK ("khidma_bookings"."end_time" > "khidma_bookings"."start_time"),
	CONSTRAINT "khidma_bookings_price_positive" CHECK ("khidma_bookings"."price_snapshot_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "khidma_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"professional_id" uuid NOT NULL,
	"title" text NOT NULL,
	"specialty" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"base_price_minor" bigint NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"duration_minutes" integer NOT NULL,
	"status" "listing_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "khidma_services_price_nonnegative" CHECK ("khidma_services"."base_price_minor" >= 0),
	CONSTRAINT "khidma_services_duration_positive" CHECK ("khidma_services"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "service_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"professional_id" uuid NOT NULL,
	"service_id" uuid,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"state" "quote_state" DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "khidma_quotes_request_professional_unique" UNIQUE("request_id","professional_id"),
	CONSTRAINT "khidma_quotes_amount_positive" CHECK ("service_quotes"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"service_id" uuid,
	"description" text NOT NULL,
	"requested_start" timestamp with time zone,
	"requested_end" timestamp with time zone,
	"state" "khidma_request_state" DEFAULT 'requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "khidma_requests_window_order" CHECK ("service_requests"."requested_end" IS NULL OR "service_requests"."requested_start" IS NULL OR "service_requests"."requested_end" > "service_requests"."requested_start")
);
--> statement-breakpoint
CREATE TABLE "kraya_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" "asset_category" DEFAULT 'other' NOT NULL,
	"daily_rate_minor" bigint NOT NULL,
	"deposit_minor" bigint NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"capacity" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "listing_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kraya_assets_rate_nonnegative" CHECK ("kraya_assets"."daily_rate_minor" >= 0),
	CONSTRAINT "kraya_assets_deposit_nonnegative" CHECK ("kraya_assets"."deposit_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rental_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"renter_id" uuid NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"daily_rate_snapshot_minor" bigint NOT NULL,
	"deposit_snapshot_minor" bigint NOT NULL,
	"total_charge_minor" bigint NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"state" "kraya_booking_state" DEFAULT 'requested' NOT NULL,
	"state_before_dispute" "kraya_booking_state",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kraya_bookings_window_order" CHECK ("rental_bookings"."end_time" > "rental_bookings"."start_time"),
	CONSTRAINT "kraya_bookings_charge_positive" CHECK ("rental_bookings"."total_charge_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "rental_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"terms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"asset_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_snapshot_minor" bigint NOT NULL,
	"deposit_snapshot_minor" bigint NOT NULL,
	"cancellation_policy" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_contracts_booking_version_unique" UNIQUE("booking_id","version")
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "payment_provider" DEFAULT 'mock' NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"signature_verified" boolean NOT NULL,
	"processed_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_provider_event_unique" UNIQUE("provider","provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "payment_category" NOT NULL,
	"payer_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"captured_minor" bigint DEFAULT 0 NOT NULL,
	"refunded_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"state" "payment_state" DEFAULT 'created' NOT NULL,
	"provider" "payment_provider" DEFAULT 'mock' NOT NULL,
	"provider_ref" text,
	"souq_participant_id" uuid,
	"khidma_booking_id" uuid,
	"kraya_booking_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_ref_unique" UNIQUE("provider","provider_ref"),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_minor" > 0),
	CONSTRAINT "payments_captured_bounds" CHECK ("payments"."captured_minor" >= 0 AND "payments"."captured_minor" <= "payments"."amount_minor"),
	CONSTRAINT "payments_refunded_bounds" CHECK ("payments"."refunded_minor" >= 0 AND "payments"."refunded_minor" <= "payments"."captured_minor"),
	CONSTRAINT "payments_single_target" CHECK ((
        "payments"."category" = 'souq_join' AND "payments"."souq_participant_id" IS NOT NULL AND "payments"."khidma_booking_id" IS NULL AND "payments"."kraya_booking_id" IS NULL
        OR "payments"."category" = 'khidma_service' AND "payments"."souq_participant_id" IS NULL AND "payments"."khidma_booking_id" IS NOT NULL AND "payments"."kraya_booking_id" IS NULL
        OR "payments"."category" IN ('kraya_rental', 'kraya_deposit') AND "payments"."souq_participant_id" IS NULL AND "payments"."khidma_booking_id" IS NULL AND "payments"."kraya_booking_id" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"reason" text NOT NULL,
	"state" "refund_state" DEFAULT 'requested' NOT NULL,
	"provider" "payment_provider" DEFAULT 'mock' NOT NULL,
	"provider_ref" text,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_provider_ref_unique" UNIQUE("provider","provider_ref"),
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "cancellation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"entity_type" "cancellation_target_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"state" "cancellation_state" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"decision_reason" text,
	"refund_payment_id" uuid,
	"refund_amount_minor" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispute_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispute_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"evidence_type" text NOT NULL,
	"storage_reference" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispute_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispute_id" uuid NOT NULL,
	"resolution" "dispute_resolution" NOT NULL,
	"amount_minor" bigint,
	"rationale" text NOT NULL,
	"decided_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispute_resolutions_dispute_unique" UNIQUE("dispute_id"),
	CONSTRAINT "dispute_resolutions_amount_positive" CHECK ("dispute_resolutions"."amount_minor" IS NULL OR "dispute_resolutions"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opener_id" uuid NOT NULL,
	"entity_type" "cancellation_target_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"state" "dispute_state" DEFAULT 'opened' NOT NULL,
	"resolution" "dispute_resolution",
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" varchar(120) NOT NULL,
	"entity_type" "audit_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_role" varchar(20) NOT NULL,
	"action" varchar(120) NOT NULL,
	"entity_type" "audit_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(120) NOT NULL,
	"key" varchar(128) NOT NULL,
	"user_id" uuid NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"status" "idempotency_status" DEFAULT 'in_progress' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL,
	CONSTRAINT "idempotency_keys_scope_user_key_unique" UNIQUE("scope","user_id","key")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"entity_type" "audit_entity_type",
	"entity_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"aggregate_type" varchar(60) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"provider_role" "user_role" NOT NULL,
	"action" varchar(120) NOT NULL,
	"entity_type" "audit_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_type" "saved_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_items_user_entity_unique" UNIQUE("user_id","entity_type","entity_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "user_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_buy_circles" ADD CONSTRAINT "group_buy_circles_product_id_souq_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."souq_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buy_circles" ADD CONSTRAINT "group_buy_circles_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buy_participants" ADD CONSTRAINT "group_buy_participants_circle_id_group_buy_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."group_buy_circles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buy_participants" ADD CONSTRAINT "group_buy_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "souq_products" ADD CONSTRAINT "souq_products_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khidma_availability" ADD CONSTRAINT "khidma_availability_professional_id_users_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khidma_bookings" ADD CONSTRAINT "khidma_bookings_request_id_service_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khidma_bookings" ADD CONSTRAINT "khidma_bookings_quote_id_service_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."service_quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khidma_bookings" ADD CONSTRAINT "khidma_bookings_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khidma_bookings" ADD CONSTRAINT "khidma_bookings_professional_id_users_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khidma_bookings" ADD CONSTRAINT "khidma_bookings_service_id_khidma_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."khidma_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khidma_services" ADD CONSTRAINT "khidma_services_professional_id_users_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_quotes" ADD CONSTRAINT "service_quotes_request_id_service_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_quotes" ADD CONSTRAINT "service_quotes_professional_id_users_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_quotes" ADD CONSTRAINT "service_quotes_service_id_khidma_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."khidma_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_service_id_khidma_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."khidma_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kraya_assets" ADD CONSTRAINT "kraya_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_asset_id_kraya_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."kraya_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_renter_id_users_id_fk" FOREIGN KEY ("renter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_booking_id_rental_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_id_users_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_souq_participant_id_group_buy_participants_id_fk" FOREIGN KEY ("souq_participant_id") REFERENCES "public"."group_buy_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_khidma_booking_id_khidma_bookings_id_fk" FOREIGN KEY ("khidma_booking_id") REFERENCES "public"."khidma_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_kraya_booking_id_rental_bookings_id_fk" FOREIGN KEY ("kraya_booking_id") REFERENCES "public"."rental_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_refund_payment_id_payments_id_fk" FOREIGN KEY ("refund_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_resolutions" ADD CONSTRAINT "dispute_resolutions_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_resolutions" ADD CONSTRAINT "dispute_resolutions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opener_id_users_id_fk" FOREIGN KEY ("opener_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_actions" ADD CONSTRAINT "provider_actions_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "circles_state_deadline_idx" ON "group_buy_circles" USING btree ("state","deadline_at");--> statement-breakpoint
CREATE INDEX "circles_seller_idx" ON "group_buy_circles" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "participants_user_idx" ON "group_buy_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "souq_products_seller_idx" ON "souq_products" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "souq_products_status_idx" ON "souq_products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "khidma_bookings_buyer_idx" ON "khidma_bookings" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "khidma_bookings_professional_idx" ON "khidma_bookings" USING btree ("professional_id","state");--> statement-breakpoint
CREATE INDEX "khidma_bookings_ttl_idx" ON "khidma_bookings" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "khidma_services_professional_idx" ON "khidma_services" USING btree ("professional_id","status");--> statement-breakpoint
CREATE INDEX "khidma_quotes_professional_idx" ON "service_quotes" USING btree ("professional_id","state");--> statement-breakpoint
CREATE INDEX "khidma_requests_buyer_idx" ON "service_requests" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "khidma_requests_state_idx" ON "service_requests" USING btree ("state");--> statement-breakpoint
CREATE INDEX "kraya_assets_owner_idx" ON "kraya_assets" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "kraya_assets_status_idx" ON "kraya_assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kraya_bookings_renter_idx" ON "rental_bookings" USING btree ("renter_id");--> statement-breakpoint
CREATE INDEX "kraya_bookings_asset_idx" ON "rental_bookings" USING btree ("asset_id","state");--> statement-breakpoint
CREATE INDEX "kraya_bookings_ttl_idx" ON "rental_bookings" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "payment_events_processed_idx" ON "payment_events" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "payments_payer_idx" ON "payments" USING btree ("payer_id");--> statement-breakpoint
CREATE INDEX "payments_state_idx" ON "payments" USING btree ("state");--> statement-breakpoint
CREATE INDEX "payments_souq_participant_idx" ON "payments" USING btree ("souq_participant_id");--> statement-breakpoint
CREATE INDEX "payments_khidma_booking_idx" ON "payments" USING btree ("khidma_booking_id");--> statement-breakpoint
CREATE INDEX "payments_kraya_booking_idx" ON "payments" USING btree ("kraya_booking_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "refunds_state_idx" ON "refunds" USING btree ("state");--> statement-breakpoint
CREATE INDEX "cancellation_requests_state_idx" ON "cancellation_requests" USING btree ("state");--> statement-breakpoint
CREATE INDEX "cancellation_requests_target_idx" ON "cancellation_requests" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "cancellation_requests_requester_idx" ON "cancellation_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "dispute_evidence_dispute_idx" ON "dispute_evidence" USING btree ("dispute_id");--> statement-breakpoint
CREATE INDEX "disputes_state_idx" ON "disputes" USING btree ("state");--> statement-breakpoint
CREATE INDEX "disputes_target_idx" ON "disputes" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "disputes_opener_idx" ON "disputes" USING btree ("opener_id");--> statement-breakpoint
CREATE INDEX "admin_actions_admin_idx" ON "admin_actions" USING btree ("admin_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_request_idx" ON "audit_log" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "outbox_events_status_available_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "provider_actions_provider_idx" ON "provider_actions" USING btree ("provider_id","created_at");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");