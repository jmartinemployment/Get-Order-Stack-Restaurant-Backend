-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "restaurants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logo" TEXT,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "location" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "cuisine_type" TEXT,
    "business_category" TEXT,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "monthly_revenue" DECIMAL(10,2),
    "delivery_percentage" INTEGER,
    "platforms_used" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pos_system" TEXT DEFAULT 'OrderStack',
    "tax_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "delivery_enabled" BOOLEAN NOT NULL DEFAULT false,
    "pickup_enabled" BOOLEAN NOT NULL DEFAULT false,
    "dine_in_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ai_settings" JSONB,
    "merchant_profile" JSONB,
    "business_hours" JSONB,
    "notification_settings" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "restaurant_group_id" TEXT,
    "default_branding_logo_url" TEXT,
    "default_branding_color" TEXT,
    "default_invoice_notes" TEXT,
    "stripe_connected_account_id" TEXT,
    "paypal_merchant_id" TEXT,
    "payment_processor" TEXT,
    "trial_started_at" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "has_used_trial" BOOLEAN NOT NULL DEFAULT false,
    "trial_expired_at" TIMESTAMP(3),
    "plan_tier" TEXT NOT NULL DEFAULT 'free',
    "platform_fee_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "platform_fee_fixed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trialing',
    "plan_price" INTEGER NOT NULL DEFAULT 5000,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "paypal_subscription_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_delivery_credentials" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "doordash_api_key_encrypted" TEXT,
    "doordash_signing_secret_encrypted" TEXT,
    "doordash_mode" TEXT,
    "uber_client_id_encrypted" TEXT,
    "uber_client_secret_encrypted" TEXT,
    "uber_customer_id_encrypted" TEXT,
    "uber_webhook_signing_key_encrypted" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_delivery_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_provider_profiles" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "config_ref_map" JSONB,
    "profile_version" INTEGER NOT NULL DEFAULT 1,
    "profile_state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "key_backend" TEXT NOT NULL,
    "key_ref" TEXT,
    "wrapped_dek" TEXT,
    "dek_version" INTEGER NOT NULL DEFAULT 1,
    "aad_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "rotated_at" TIMESTAMP(3),

    CONSTRAINT "restaurant_provider_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_provider_profile_events" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "profile_id" TEXT,
    "provider" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "profile_version" INTEGER,
    "outcome" TEXT NOT NULL,
    "correlation_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_provider_profile_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_integrations" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "external_store_id" TEXT,
    "webhook_signing_secret_encrypted" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_orders" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "order_id" TEXT,
    "integration_id" TEXT,
    "provider" TEXT NOT NULL,
    "external_order_id" TEXT NOT NULL,
    "external_store_id" TEXT,
    "external_customer_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "raw_payload" JSONB,
    "last_event_id" TEXT,
    "last_pushed_status" TEXT,
    "last_push_at" TIMESTAMP(3),
    "last_push_result" TEXT,
    "last_push_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_webhook_events" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT,
    "integration_id" TEXT,
    "provider" TEXT NOT NULL,
    "external_event_id" TEXT NOT NULL,
    "external_order_id" TEXT,
    "payload_hash" TEXT NOT NULL,
    "payload" JSONB,
    "outcome" TEXT NOT NULL DEFAULT 'RECEIVED',
    "error_message" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "marketplace_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_menu_mappings" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_item_id" TEXT NOT NULL,
    "external_item_name" TEXT,
    "menu_item_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_menu_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_status_sync_jobs" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "marketplace_order_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_order_id" TEXT NOT NULL,
    "target_status" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_status_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "primary_categories" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(100),
    "icon" VARCHAR(50),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "primary_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "primary_category_id" TEXT,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "description" TEXT,
    "description_en" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "image" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "channel_visibility" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "description" TEXT NOT NULL,
    "description_en" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "cost" DECIMAL(10,2),
    "image" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "eighty_sixed" BOOLEAN NOT NULL DEFAULT false,
    "eighty_six_reason" TEXT,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "dietary" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channel_visibility" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "prep_time_minutes" INTEGER,
    "tax_category" TEXT NOT NULL DEFAULT 'prepared_food',
    "ai_estimated_cost" DECIMAL(10,2),
    "ai_suggested_price" DECIMAL(10,2),
    "ai_profit_margin" DECIMAL(5,2),
    "ai_confidence" TEXT,
    "ai_last_updated" TIMESTAMP(3),
    "catering_pricing" JSONB NOT NULL DEFAULT '[]',
    "menu_type" TEXT NOT NULL DEFAULT 'standard',
    "catering_pricing_model" TEXT,
    "item_category" TEXT,
    "beverage_type" TEXT,
    "vendor_id" TEXT,
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "catering_allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dietary_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_groups" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "description" TEXT,
    "description_en" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "multi_select" BOOLEAN NOT NULL DEFAULT false,
    "min_selections" INTEGER NOT NULL DEFAULT 0,
    "max_selections" INTEGER,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifiers" (
    "id" TEXT NOT NULL,
    "modifier_group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "price_adjustment" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_modifier_groups" (
    "id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "modifier_group_id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_item_modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_tables" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "table_number" TEXT NOT NULL,
    "table_name" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "section" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "server_name" TEXT,
    "pos_x" INTEGER,
    "pos_y" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "total_spent" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "average_order_value" DECIMAL(10,2),
    "last_order_date" TIMESTAMP(3),
    "loyalty_points" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "loyalty_tier" TEXT NOT NULL DEFAULT 'bronze',
    "total_points_earned" INTEGER NOT NULL DEFAULT 0,
    "total_points_redeemed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "table_id" TEXT,
    "server_id" TEXT,
    "source_device_id" TEXT,
    "order_number" TEXT NOT NULL,
    "order_type" TEXT NOT NULL,
    "order_source" TEXT NOT NULL DEFAULT 'online',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "tax" DECIMAL(10,2) NOT NULL,
    "tip" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "payment_method" TEXT,
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "stripe_payment_intent_id" TEXT,
    "paypal_order_id" TEXT,
    "paypal_capture_id" TEXT,
    "special_instructions" TEXT,
    "delivery_address" TEXT,
    "delivery_lat" DECIMAL(10,7),
    "delivery_lng" DECIMAL(10,7),
    "delivery_provider" TEXT,
    "delivery_external_id" TEXT,
    "delivery_tracking_url" TEXT,
    "dispatch_status" TEXT,
    "throttle_state" TEXT NOT NULL DEFAULT 'NONE',
    "throttle_reason" TEXT,
    "throttle_held_at" TIMESTAMP(3),
    "throttle_released_at" TIMESTAMP(3),
    "throttle_source" TEXT,
    "throttle_release_reason" TEXT,
    "scheduled_time" TIMESTAMP(3),
    "delivery_address_2" TEXT,
    "delivery_city" TEXT,
    "delivery_state_us" TEXT,
    "delivery_zip" TEXT,
    "delivery_notes" TEXT,
    "delivery_status" TEXT,
    "delivery_estimated_at" TIMESTAMP(3),
    "dispatched_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "vehicle_description" TEXT,
    "arrival_notified" BOOLEAN NOT NULL DEFAULT false,
    "event_date" TIMESTAMP(3),
    "event_time" TEXT,
    "headcount" INTEGER,
    "event_type" TEXT,
    "setup_required" BOOLEAN NOT NULL DEFAULT false,
    "deposit_amount" DECIMAL(10,2),
    "deposit_paid" BOOLEAN NOT NULL DEFAULT false,
    "catering_instructions" TEXT,
    "approval_status" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "sent_to_kitchen_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "preparing_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "cancelled_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "loyalty_points_earned" INTEGER NOT NULL DEFAULT 0,
    "loyalty_points_redeemed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "menu_item_id" TEXT,
    "menu_item_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "modifiers_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(10,2) NOT NULL,
    "special_instructions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "fulfillment_status" TEXT NOT NULL DEFAULT 'NEW',
    "course_guid" TEXT,
    "course_name" TEXT,
    "course_sort_order" INTEGER,
    "course_fire_status" TEXT,
    "course_fired_at" TIMESTAMP(3),
    "course_ready_at" TIMESTAMP(3),
    "sent_to_kitchen_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_modifiers" (
    "id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "modifier_id" TEXT,
    "modifier_name" TEXT NOT NULL,
    "price_adjustment" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_checks" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "display_number" INTEGER NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'OPEN',
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tip" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tab_name" TEXT,
    "tab_opened_at" TIMESTAMP(3),
    "tab_closed_at" TIMESTAMP(3),
    "preauth_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_items" (
    "id" TEXT NOT NULL,
    "check_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "menu_item_id" TEXT,
    "menu_item_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "modifiers_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(10,2) NOT NULL,
    "special_instructions" TEXT,
    "seat_number" INTEGER,
    "fulfillment_status" TEXT NOT NULL DEFAULT 'NEW',
    "course_guid" TEXT,
    "is_comped" BOOLEAN NOT NULL DEFAULT false,
    "comp_reason" TEXT,
    "comp_by" TEXT,
    "comp_approved_by" TEXT,
    "comp_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_item_modifiers" (
    "id" TEXT NOT NULL,
    "check_item_id" TEXT NOT NULL,
    "modifier_id" TEXT,
    "modifier_name" TEXT NOT NULL,
    "price_adjustment" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "check_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_discounts" (
    "id" TEXT NOT NULL,
    "check_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "applied_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_voided_items" (
    "id" TEXT NOT NULL,
    "check_id" TEXT NOT NULL,
    "check_item_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "menu_item_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_price" DECIMAL(10,2) NOT NULL,
    "void_reason" TEXT NOT NULL,
    "voided_by" TEXT NOT NULL,
    "manager_approval" TEXT,
    "voided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_voided_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "customer_email" TEXT,
    "party_size" INTEGER NOT NULL,
    "reservation_time" TIMESTAMP(3) NOT NULL,
    "table_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "special_requests" TEXT,
    "confirmation_sent" BOOLEAN NOT NULL DEFAULT false,
    "reminder_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_jurisdictions" (
    "id" TEXT NOT NULL,
    "zip_code" TEXT NOT NULL,
    "city" TEXT,
    "county" TEXT,
    "state" TEXT NOT NULL DEFAULT 'FL',
    "tax_rate" DECIMAL(5,4) NOT NULL,
    "breakdown" JSONB,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_jurisdictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "changed_by" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "name_en" VARCHAR(255),
    "unit" VARCHAR(50) NOT NULL DEFAULT 'units',
    "current_stock" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "min_stock" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "max_stock" DECIMAL(10,2) NOT NULL DEFAULT 100,
    "cost_per_unit" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "supplier" VARCHAR(255),
    "category" VARCHAR(100) NOT NULL DEFAULT 'general',
    "last_restocked" TIMESTAMP(3),
    "last_count_date" TIMESTAMP(3),
    "expiration_date" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_logs" (
    "id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "previous_stock" DECIMAL(10,2) NOT NULL,
    "new_stock" DECIMAL(10,2) NOT NULL,
    "change_amount" DECIMAL(10,2) NOT NULL,
    "reason" VARCHAR(255),
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "quantity" DECIMAL(10,4) NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "notes" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_restaurant_access" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_restaurant_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "device_info" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_pins" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "team_member_id" TEXT,
    "pin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "staff_pin_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "position" TEXT NOT NULL DEFAULT 'server',
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "staff_pin_id" TEXT NOT NULL,
    "shift_id" TEXT,
    "clock_in" TIMESTAMP(3) NOT NULL,
    "clock_out" TIMESTAMP(3),
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labor_targets" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "target_percent" DECIMAL(5,2) NOT NULL,
    "target_cost" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labor_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_availability" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "staff_pin_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "preferred_start" VARCHAR(5),
    "preferred_end" VARCHAR(5),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swap_requests" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "requestor_pin_id" TEXT NOT NULL,
    "target_pin_id" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "responded_at" TIMESTAMP(3),
    "responded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "swap_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_notifications" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "recipient_pin_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workweek_configs" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "week_start_day" INTEGER NOT NULL DEFAULT 0,
    "day_start_time" VARCHAR(5) NOT NULL DEFAULT '04:00',
    "overtime_threshold_hours" DECIMAL(5,2) NOT NULL DEFAULT 40,
    "overtime_multiplier" DECIMAL(3,2) NOT NULL DEFAULT 1.5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workweek_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timecard_edit_requests" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "time_entry_id" TEXT NOT NULL,
    "staff_pin_id" TEXT NOT NULL,
    "edit_type" TEXT NOT NULL,
    "original_value" TEXT NOT NULL,
    "new_value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "responded_by" TEXT,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timecard_edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pto_requests" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "staff_pin_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "start_date" VARCHAR(10) NOT NULL,
    "end_date" VARCHAR(10) NOT NULL,
    "hours_requested" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pto_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_templates" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_shifts" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "staff_pin_id" TEXT NOT NULL,
    "staff_name" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "position" TEXT NOT NULL DEFAULT 'server',
    "break_minutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "template_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stations" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_expo" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "station_category_mappings" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "station_category_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "location_id" TEXT,
    "team_member_id" TEXT,
    "device_code" TEXT,
    "device_name" TEXT NOT NULL,
    "device_type" TEXT NOT NULL,
    "pos_mode" TEXT,
    "mode_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "hardware_info" JSONB,
    "last_seen_at" TIMESTAMP(3),
    "paired_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "mfa_verified_at" TIMESTAMP(3),
    "mfa_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_modes" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "device_type" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_modes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printer_profiles" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "routingRules" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peripheral_devices" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "parent_device_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connection_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "peripheral_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosk_profiles" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pos_mode" TEXT NOT NULL,
    "welcome_message" TEXT NOT NULL DEFAULT 'Welcome!',
    "show_images" BOOLEAN NOT NULL DEFAULT true,
    "enabled_categories" JSONB NOT NULL DEFAULT '[]',
    "require_name_for_order" BOOLEAN NOT NULL DEFAULT false,
    "max_idle_seconds" INTEGER NOT NULL DEFAULT 120,
    "enable_accessibility" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kiosk_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printers" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "mac_address" TEXT NOT NULL,
    "ip_address" TEXT,
    "cloudprnt_id" TEXT NOT NULL,
    "registration_token" TEXT NOT NULL,
    "print_width" INTEGER NOT NULL DEFAULT 48,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_poll_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "printer_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "job_data" JSONB NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_rewards" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "points_cost" INTEGER NOT NULL,
    "discount_type" TEXT NOT NULL,
    "discount_value" DECIMAL(10,2) NOT NULL,
    "min_tier" TEXT NOT NULL DEFAULT 'bronze',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_loyalty_config" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "points_per_dollar" INTEGER NOT NULL DEFAULT 1,
    "points_redemption_rate" DECIMAL(5,2) NOT NULL DEFAULT 0.01,
    "tier_silver_min" INTEGER NOT NULL DEFAULT 500,
    "tier_gold_min" INTEGER NOT NULL DEFAULT 2000,
    "tier_platinum_min" INTEGER NOT NULL DEFAULT 5000,
    "silver_multiplier" DECIMAL(3,2) NOT NULL DEFAULT 1.25,
    "gold_multiplier" DECIMAL(3,2) NOT NULL DEFAULT 1.50,
    "platinum_multiplier" DECIMAL(3,2) NOT NULL DEFAULT 2.00,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_loyalty_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_cards" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "initial_balance" DECIMAL(10,2) NOT NULL,
    "current_balance" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "purchased_by" TEXT,
    "recipient_name" TEXT,
    "recipient_email" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_card_redemptions" (
    "id" TEXT NOT NULL,
    "gift_card_id" TEXT NOT NULL,
    "order_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "redeemed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_card_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "customer_id" TEXT,
    "customer_name" TEXT NOT NULL,
    "customer_email" TEXT NOT NULL,
    "house_account_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "tax" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "paid_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "due_date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "sent_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_accounts" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "credit_limit" DECIMAL(10,2) NOT NULL,
    "current_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "house_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "audience_segment" TEXT,
    "audience_loyalty_tier" TEXT,
    "estimated_recipients" INTEGER,
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_performances" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "clicked" INTEGER NOT NULL DEFAULT 0,
    "converted" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_performances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combos" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "combo_price" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "combos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_ai_credentials" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "encrypted_api_key" TEXT NOT NULL,
    "encryption_iv" TEXT NOT NULL,
    "encryption_tag" TEXT NOT NULL,
    "key_last_four" TEXT,
    "is_valid" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_ai_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "feature_key" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "estimated_cost_cents" INTEGER NOT NULL,
    "called_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "payment_terms" TEXT,
    "lead_time_days" INTEGER,
    "website" TEXT,
    "api_portal_url" TEXT,
    "is_integrated" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "image_url" TEXT,
    "ocr_processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_line_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "ingredient_name" TEXT NOT NULL,
    "quantity" DECIMAL(10,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_cost" DECIMAL(10,4) NOT NULL,
    "total_cost" DECIMAL(10,2) NOT NULL,
    "normalized_ingredient" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_cost_recipes" (
    "id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yield_qty" DECIMAL(10,2) NOT NULL,
    "yield_unit" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_cost_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_cost_recipe_ingredients" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "ingredient_name" TEXT NOT NULL,
    "quantity" DECIMAL(10,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "estimated_unit_cost" DECIMAL(10,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_cost_recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_groups" (
    "id" TEXT NOT NULL,
    "restaurant_group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_group_members" (
    "id" TEXT NOT NULL,
    "location_group_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_sync_logs" (
    "id" TEXT NOT NULL,
    "restaurant_group_id" TEXT NOT NULL,
    "source_restaurant_id" TEXT NOT NULL,
    "target_restaurant_ids" JSONB NOT NULL,
    "items_added" INTEGER NOT NULL DEFAULT 0,
    "items_updated" INTEGER NOT NULL DEFAULT 0,
    "items_skipped" INTEGER NOT NULL DEFAULT 0,
    "conflicts" INTEGER NOT NULL DEFAULT 0,
    "synced_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_supplier_credentials" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "sysco_client_id_encrypted" TEXT,
    "sysco_client_secret_encrypted" TEXT,
    "sysco_customer_id_encrypted" TEXT,
    "sysco_mode" TEXT,
    "gfs_client_id_encrypted" TEXT,
    "gfs_client_secret_encrypted" TEXT,
    "gfs_customer_id_encrypted" TEXT,
    "gfs_mode" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_supplier_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_reports" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "created_by" TEXT NOT NULL DEFAULT 'system',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_schedules" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "saved_report_id" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "day_of_week" INTEGER,
    "day_of_month" INTEGER,
    "time_of_day" TEXT NOT NULL DEFAULT '08:00',
    "recipient_emails" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_templates" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "created_by" TEXT NOT NULL DEFAULT 'system',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_configs" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "referrer_reward" JSONB NOT NULL DEFAULT '{"type":"points","value":100,"freeItemId":null}',
    "referee_reward" JSONB NOT NULL DEFAULT '{"type":"discount_percentage","value":10,"freeItemId":null}',
    "max_referrals" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_sets" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passcode" TEXT,
    "password_hash" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "work_from_home" BOOLEAN NOT NULL DEFAULT false,
    "restaurant_group_id" TEXT,
    "permission_set_id" TEXT,
    "assigned_location_ids" JSONB NOT NULL DEFAULT '[]',
    "avatar_url" TEXT,
    "hire_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "temp_password_expires_at" TIMESTAMP(3),
    "temp_password_set_by" TEXT,
    "password_changed_at" TIMESTAMP(3),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "break_types" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expected_minutes" INTEGER NOT NULL DEFAULT 15,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "break_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_member_jobs" (
    "id" TEXT NOT NULL,
    "team_member_id" TEXT NOT NULL,
    "job_title" TEXT NOT NULL,
    "hourly_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_tip_eligible" BOOLEAN NOT NULL DEFAULT false,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "overtime_eligible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_member_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_tax_info" (
    "id" TEXT NOT NULL,
    "team_member_id" TEXT NOT NULL,
    "filing_status" TEXT NOT NULL DEFAULT 'single',
    "multiple_jobs" BOOLEAN NOT NULL DEFAULT false,
    "qualifying_children_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "other_dependents_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "other_income" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extra_withholding" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'FL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_tax_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_items" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "category_id" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "cost" DECIMAL(10,2),
    "description" TEXT,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "track_stock" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retail_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_categories" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "parent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retail_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_option_sets" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retail_option_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_options" (
    "id" TEXT NOT NULL,
    "option_set_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_adjustment" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "retail_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_item_option_sets" (
    "id" TEXT NOT NULL,
    "retail_item_id" TEXT NOT NULL,
    "option_set_id" TEXT NOT NULL,

    CONSTRAINT "retail_item_option_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_stock" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "retail_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 5,
    "location" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retail_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layaways" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "customer_name" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "total_amount" DECIMAL(10,2) NOT NULL,
    "deposit_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "layaways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_quick_keys" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "retail_item_id" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retail_quick_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "summaries" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "applies_to" TEXT NOT NULL DEFAULT 'sales',
    "job_titles" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_alerts" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "team_member_id" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "message" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_reservations" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT,
    "day_of_week" INTEGER NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "party_size" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "date" DATE NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "max_capacity" INTEGER,
    "current_rsvps" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_feedback" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "order_id" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "source" TEXT NOT NULL DEFAULT 'in_app',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_sentiments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "table_number" TEXT,
    "sentiment" TEXT NOT NULL,
    "flags" TEXT[],
    "urgency" TEXT NOT NULL DEFAULT 'low',
    "summary" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "analyzed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_sentiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_groups" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smart_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_threads" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "last_message_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_automations" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "action" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_conversions" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "from_unit" TEXT NOT NULL,
    "to_unit" TEXT NOT NULL,
    "factor" DECIMAL(10,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_counts" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "completed_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cycle_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_count_items" (
    "id" TEXT NOT NULL,
    "cycle_count_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "expected_qty" DECIMAL(10,2) NOT NULL,
    "actual_qty" DECIMAL(10,2),
    "variance" DECIMAL(10,2),

    CONSTRAINT "cycle_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_events" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inquiry',
    "fulfillment_date" DATE NOT NULL,
    "booking_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "headcount" INTEGER NOT NULL,
    "location_type" TEXT NOT NULL DEFAULT 'on_site',
    "location_address" TEXT,
    "client_name" TEXT NOT NULL,
    "client_phone" TEXT,
    "client_email" TEXT,
    "company_name" TEXT,
    "notes" TEXT,
    "subtotal_cents" INTEGER NOT NULL DEFAULT 0,
    "service_charge_percent" DECIMAL(5,2),
    "service_charge_cents" INTEGER NOT NULL DEFAULT 0,
    "tax_percent" DECIMAL(5,2),
    "tax_cents" INTEGER NOT NULL DEFAULT 0,
    "gratuity_percent" DECIMAL(5,2),
    "gratuity_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL DEFAULT 0,
    "paid_cents" INTEGER NOT NULL DEFAULT 0,
    "packages" JSONB NOT NULL DEFAULT '[]',
    "selected_package_id" TEXT,
    "milestones" JSONB NOT NULL DEFAULT '[]',
    "estimate_id" TEXT,
    "invoice_id" TEXT,
    "contract_url" TEXT,
    "contract_signed_at" TIMESTAMP(3),
    "proposal_sent_at" TIMESTAMP(3),
    "signature_image_url" TEXT,
    "signer_ip" TEXT,
    "signer_consented_at" TIMESTAMP(3),
    "branding_logo_url" TEXT,
    "branding_color" TEXT,
    "invoice_notes" TEXT,
    "dietary_requirements" JSONB,
    "tastings" JSONB,
    "delivery_details" JSONB,
    "ai_content" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catering_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_proposal_tokens" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "viewed_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catering_proposal_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_activities" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "actor_type" TEXT NOT NULL DEFAULT 'operator',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catering_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_capacity_settings" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "max_events_per_day" INTEGER NOT NULL DEFAULT 3,
    "max_headcount_per_day" INTEGER NOT NULL DEFAULT 200,
    "conflict_alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catering_capacity_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_package_templates" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "pricing_model" TEXT NOT NULL,
    "price_per_unit_cents" INTEGER NOT NULL,
    "minimum_headcount" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "menu_item_ids" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catering_package_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "team_member_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_history" (
    "id" TEXT NOT NULL,
    "team_member_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_secrets" (
    "id" TEXT NOT NULL,
    "team_member_id" TEXT NOT NULL,
    "secret" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "backup_codes" TEXT[],
    "mfa_type" TEXT NOT NULL DEFAULT 'email',
    "email_otp_hash" TEXT,
    "email_otp_expiry" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mfa_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_trusted_devices" (
    "id" TEXT NOT NULL,
    "team_member_id" TEXT NOT NULL,
    "ua_fingerprint" TEXT NOT NULL,
    "device_info" TEXT,
    "trusted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mfa_trusted_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_verifications" (
    "id" TEXT NOT NULL,
    "email_hash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_slug_key" ON "restaurants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_restaurant_id_key" ON "subscriptions"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_delivery_credentials_restaurant_id_key" ON "restaurant_delivery_credentials"("restaurant_id");

-- CreateIndex
CREATE INDEX "restaurant_provider_profiles_restaurant_id_profile_state_idx" ON "restaurant_provider_profiles"("restaurant_id", "profile_state");

-- CreateIndex
CREATE INDEX "restaurant_provider_profiles_key_backend_idx" ON "restaurant_provider_profiles"("key_backend");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_provider_profiles_restaurant_id_provider_key" ON "restaurant_provider_profiles"("restaurant_id", "provider");

-- CreateIndex
CREATE INDEX "restaurant_provider_profile_events_restaurant_id_provider_c_idx" ON "restaurant_provider_profile_events"("restaurant_id", "provider", "created_at");

-- CreateIndex
CREATE INDEX "restaurant_provider_profile_events_profile_id_created_at_idx" ON "restaurant_provider_profile_events"("profile_id", "created_at");

-- CreateIndex
CREATE INDEX "restaurant_provider_profile_events_correlation_id_idx" ON "restaurant_provider_profile_events"("correlation_id");

-- CreateIndex
CREATE INDEX "marketplace_integrations_provider_external_store_id_idx" ON "marketplace_integrations"("provider", "external_store_id");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_integrations_restaurant_id_provider_key" ON "marketplace_integrations"("restaurant_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_orders_order_id_key" ON "marketplace_orders"("order_id");

-- CreateIndex
CREATE INDEX "marketplace_orders_restaurant_id_provider_status_idx" ON "marketplace_orders"("restaurant_id", "provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_orders_provider_external_order_id_key" ON "marketplace_orders"("provider", "external_order_id");

-- CreateIndex
CREATE INDEX "marketplace_webhook_events_restaurant_id_provider_received__idx" ON "marketplace_webhook_events"("restaurant_id", "provider", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_webhook_events_provider_external_event_id_key" ON "marketplace_webhook_events"("provider", "external_event_id");

-- CreateIndex
CREATE INDEX "marketplace_menu_mappings_restaurant_id_provider_idx" ON "marketplace_menu_mappings"("restaurant_id", "provider");

-- CreateIndex
CREATE INDEX "marketplace_menu_mappings_menu_item_id_idx" ON "marketplace_menu_mappings"("menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_menu_mappings_restaurant_id_provider_external_i_key" ON "marketplace_menu_mappings"("restaurant_id", "provider", "external_item_id");

-- CreateIndex
CREATE INDEX "marketplace_status_sync_jobs_restaurant_id_status_next_atte_idx" ON "marketplace_status_sync_jobs"("restaurant_id", "status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_status_sync_jobs_marketplace_order_id_target_st_key" ON "marketplace_status_sync_jobs"("marketplace_order_id", "target_status");

-- CreateIndex
CREATE INDEX "primary_categories_restaurant_id_idx" ON "primary_categories"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "primary_categories_restaurant_id_slug_key" ON "primary_categories"("restaurant_id", "slug");

-- CreateIndex
CREATE INDEX "menu_categories_primary_category_id_idx" ON "menu_categories"("primary_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_modifier_groups_menu_item_id_modifier_group_id_key" ON "menu_item_modifier_groups"("menu_item_id", "modifier_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_tables_restaurant_id_table_number_key" ON "restaurant_tables"("restaurant_id", "table_number");

-- CreateIndex
CREATE UNIQUE INDEX "customers_restaurant_id_phone_key" ON "customers"("restaurant_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "order_checks_order_id_idx" ON "order_checks"("order_id");

-- CreateIndex
CREATE INDEX "order_checks_restaurant_id_idx" ON "order_checks"("restaurant_id");

-- CreateIndex
CREATE INDEX "check_items_check_id_idx" ON "check_items"("check_id");

-- CreateIndex
CREATE INDEX "check_items_order_id_idx" ON "check_items"("order_id");

-- CreateIndex
CREATE INDEX "check_discounts_check_id_idx" ON "check_discounts"("check_id");

-- CreateIndex
CREATE INDEX "check_voided_items_check_id_idx" ON "check_voided_items"("check_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_jurisdictions_zip_code_state_key" ON "tax_jurisdictions"("zip_code", "state");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_idx" ON "order_status_history"("order_id");

-- CreateIndex
CREATE INDEX "order_status_history_created_at_idx" ON "order_status_history"("created_at");

-- CreateIndex
CREATE INDEX "inventory_items_restaurant_id_idx" ON "inventory_items"("restaurant_id");

-- CreateIndex
CREATE INDEX "inventory_items_restaurant_id_category_idx" ON "inventory_items"("restaurant_id", "category");

-- CreateIndex
CREATE INDEX "inventory_logs_inventory_item_id_idx" ON "inventory_logs"("inventory_item_id");

-- CreateIndex
CREATE INDEX "inventory_logs_created_at_idx" ON "inventory_logs"("created_at");

-- CreateIndex
CREATE INDEX "recipe_ingredients_menu_item_id_idx" ON "recipe_ingredients"("menu_item_id");

-- CreateIndex
CREATE INDEX "recipe_ingredients_inventory_item_id_idx" ON "recipe_ingredients"("inventory_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_ingredients_menu_item_id_inventory_item_id_key" ON "recipe_ingredients"("menu_item_id", "inventory_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_groups_slug_key" ON "restaurant_groups"("slug");

-- CreateIndex
CREATE INDEX "user_restaurant_access_restaurant_id_idx" ON "user_restaurant_access"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_restaurant_access_user_id_restaurant_id_key" ON "user_restaurant_access"("user_id", "restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_key" ON "user_sessions"("token");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_pins_team_member_id_key" ON "staff_pins"("team_member_id");

-- CreateIndex
CREATE INDEX "staff_pins_restaurant_id_idx" ON "staff_pins"("restaurant_id");

-- CreateIndex
CREATE INDEX "shifts_restaurant_id_date_idx" ON "shifts"("restaurant_id", "date");

-- CreateIndex
CREATE INDEX "shifts_staff_pin_id_idx" ON "shifts"("staff_pin_id");

-- CreateIndex
CREATE INDEX "time_entries_restaurant_id_clock_in_idx" ON "time_entries"("restaurant_id", "clock_in");

-- CreateIndex
CREATE INDEX "time_entries_staff_pin_id_idx" ON "time_entries"("staff_pin_id");

-- CreateIndex
CREATE UNIQUE INDEX "labor_targets_restaurant_id_dayOfWeek_key" ON "labor_targets"("restaurant_id", "dayOfWeek");

-- CreateIndex
CREATE INDEX "staff_availability_restaurant_id_idx" ON "staff_availability"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_availability_staff_pin_id_day_of_week_key" ON "staff_availability"("staff_pin_id", "day_of_week");

-- CreateIndex
CREATE INDEX "swap_requests_restaurant_id_idx" ON "swap_requests"("restaurant_id");

-- CreateIndex
CREATE INDEX "swap_requests_requestor_pin_id_idx" ON "swap_requests"("requestor_pin_id");

-- CreateIndex
CREATE INDEX "staff_notifications_restaurant_id_idx" ON "staff_notifications"("restaurant_id");

-- CreateIndex
CREATE INDEX "staff_notifications_recipient_pin_id_idx" ON "staff_notifications"("recipient_pin_id");

-- CreateIndex
CREATE INDEX "staff_notifications_recipient_pin_id_is_read_idx" ON "staff_notifications"("recipient_pin_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "workweek_configs_restaurant_id_key" ON "workweek_configs"("restaurant_id");

-- CreateIndex
CREATE INDEX "timecard_edit_requests_restaurant_id_status_idx" ON "timecard_edit_requests"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX "timecard_edit_requests_staff_pin_id_idx" ON "timecard_edit_requests"("staff_pin_id");

-- CreateIndex
CREATE INDEX "pto_requests_restaurant_id_status_idx" ON "pto_requests"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX "pto_requests_staff_pin_id_idx" ON "pto_requests"("staff_pin_id");

-- CreateIndex
CREATE INDEX "schedule_templates_restaurant_id_idx" ON "schedule_templates"("restaurant_id");

-- CreateIndex
CREATE INDEX "template_shifts_template_id_idx" ON "template_shifts"("template_id");

-- CreateIndex
CREATE INDEX "stations_restaurant_id_idx" ON "stations"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "stations_restaurant_id_name_key" ON "stations"("restaurant_id", "name");

-- CreateIndex
CREATE INDEX "station_category_mappings_restaurant_id_idx" ON "station_category_mappings"("restaurant_id");

-- CreateIndex
CREATE INDEX "station_category_mappings_category_id_idx" ON "station_category_mappings"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "station_category_mappings_station_id_category_id_key" ON "station_category_mappings"("station_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_device_code_key" ON "devices"("device_code");

-- CreateIndex
CREATE INDEX "devices_restaurant_id_idx" ON "devices"("restaurant_id");

-- CreateIndex
CREATE INDEX "devices_device_code_idx" ON "devices"("device_code");

-- CreateIndex
CREATE INDEX "device_modes_restaurant_id_idx" ON "device_modes"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_modes_restaurant_id_name_key" ON "device_modes"("restaurant_id", "name");

-- CreateIndex
CREATE INDEX "printer_profiles_restaurant_id_idx" ON "printer_profiles"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "printer_profiles_restaurant_id_name_key" ON "printer_profiles"("restaurant_id", "name");

-- CreateIndex
CREATE INDEX "peripheral_devices_restaurant_id_idx" ON "peripheral_devices"("restaurant_id");

-- CreateIndex
CREATE INDEX "peripheral_devices_parent_device_id_idx" ON "peripheral_devices"("parent_device_id");

-- CreateIndex
CREATE INDEX "kiosk_profiles_restaurant_id_idx" ON "kiosk_profiles"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_profiles_restaurant_id_name_key" ON "kiosk_profiles"("restaurant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "printers_mac_address_key" ON "printers"("mac_address");

-- CreateIndex
CREATE UNIQUE INDEX "printers_cloudprnt_id_key" ON "printers"("cloudprnt_id");

-- CreateIndex
CREATE UNIQUE INDEX "printers_registration_token_key" ON "printers"("registration_token");

-- CreateIndex
CREATE INDEX "printers_restaurant_id_idx" ON "printers"("restaurant_id");

-- CreateIndex
CREATE INDEX "printers_mac_address_idx" ON "printers"("mac_address");

-- CreateIndex
CREATE INDEX "printers_restaurant_id_is_default_idx" ON "printers"("restaurant_id", "is_default");

-- CreateIndex
CREATE INDEX "print_jobs_printer_id_status_idx" ON "print_jobs"("printer_id", "status");

-- CreateIndex
CREATE INDEX "print_jobs_order_id_idx" ON "print_jobs"("order_id");

-- CreateIndex
CREATE INDEX "print_jobs_status_created_at_idx" ON "print_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "loyalty_transactions_customer_id_idx" ON "loyalty_transactions"("customer_id");

-- CreateIndex
CREATE INDEX "loyalty_transactions_restaurant_id_idx" ON "loyalty_transactions"("restaurant_id");

-- CreateIndex
CREATE INDEX "loyalty_rewards_restaurant_id_idx" ON "loyalty_rewards"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_loyalty_config_restaurant_id_key" ON "restaurant_loyalty_config"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "gift_cards_code_key" ON "gift_cards"("code");

-- CreateIndex
CREATE INDEX "gift_cards_restaurant_id_idx" ON "gift_cards"("restaurant_id");

-- CreateIndex
CREATE INDEX "gift_card_redemptions_gift_card_id_idx" ON "gift_card_redemptions"("gift_card_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_restaurant_id_idx" ON "invoices"("restaurant_id");

-- CreateIndex
CREATE INDEX "invoices_house_account_id_idx" ON "invoices"("house_account_id");

-- CreateIndex
CREATE INDEX "invoice_line_items_invoice_id_idx" ON "invoice_line_items"("invoice_id");

-- CreateIndex
CREATE INDEX "house_accounts_restaurant_id_idx" ON "house_accounts"("restaurant_id");

-- CreateIndex
CREATE INDEX "campaigns_restaurant_id_idx" ON "campaigns"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_performances_campaign_id_key" ON "campaign_performances"("campaign_id");

-- CreateIndex
CREATE INDEX "combos_restaurant_id_idx" ON "combos"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_ai_credentials_restaurant_id_key" ON "restaurant_ai_credentials"("restaurant_id");

-- CreateIndex
CREATE INDEX "ai_usage_logs_restaurant_id_called_at_idx" ON "ai_usage_logs"("restaurant_id", "called_at");

-- CreateIndex
CREATE INDEX "ai_usage_logs_restaurant_id_feature_key_idx" ON "ai_usage_logs"("restaurant_id", "feature_key");

-- CreateIndex
CREATE INDEX "vendors_restaurant_id_idx" ON "vendors"("restaurant_id");

-- CreateIndex
CREATE INDEX "purchase_invoices_restaurant_id_idx" ON "purchase_invoices"("restaurant_id");

-- CreateIndex
CREATE INDEX "purchase_invoices_vendor_id_idx" ON "purchase_invoices"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_restaurant_id_invoice_number_key" ON "purchase_invoices"("restaurant_id", "invoice_number");

-- CreateIndex
CREATE INDEX "purchase_line_items_invoice_id_idx" ON "purchase_line_items"("invoice_id");

-- CreateIndex
CREATE INDEX "food_cost_recipes_restaurant_id_idx" ON "food_cost_recipes"("restaurant_id");

-- CreateIndex
CREATE INDEX "food_cost_recipes_menu_item_id_idx" ON "food_cost_recipes"("menu_item_id");

-- CreateIndex
CREATE INDEX "food_cost_recipe_ingredients_recipe_id_idx" ON "food_cost_recipe_ingredients"("recipe_id");

-- CreateIndex
CREATE INDEX "location_groups_restaurant_group_id_idx" ON "location_groups"("restaurant_group_id");

-- CreateIndex
CREATE INDEX "location_group_members_restaurant_id_idx" ON "location_group_members"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "location_group_members_location_group_id_restaurant_id_key" ON "location_group_members"("location_group_id", "restaurant_id");

-- CreateIndex
CREATE INDEX "menu_sync_logs_restaurant_group_id_idx" ON "menu_sync_logs"("restaurant_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_supplier_credentials_restaurant_id_key" ON "restaurant_supplier_credentials"("restaurant_id");

-- CreateIndex
CREATE INDEX "saved_reports_restaurant_id_idx" ON "saved_reports"("restaurant_id");

-- CreateIndex
CREATE INDEX "report_schedules_restaurant_id_idx" ON "report_schedules"("restaurant_id");

-- CreateIndex
CREATE INDEX "report_schedules_saved_report_id_idx" ON "report_schedules"("saved_report_id");

-- CreateIndex
CREATE INDEX "order_templates_restaurant_id_idx" ON "order_templates"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_configs_restaurant_id_key" ON "referral_configs"("restaurant_id");

-- CreateIndex
CREATE INDEX "permission_sets_restaurant_id_idx" ON "permission_sets"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_email_key" ON "team_members"("email");

-- CreateIndex
CREATE INDEX "team_members_restaurant_id_idx" ON "team_members"("restaurant_id");

-- CreateIndex
CREATE INDEX "team_members_restaurant_group_id_idx" ON "team_members"("restaurant_group_id");

-- CreateIndex
CREATE INDEX "break_types_restaurant_id_idx" ON "break_types"("restaurant_id");

-- CreateIndex
CREATE INDEX "team_member_jobs_team_member_id_idx" ON "team_member_jobs"("team_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_tax_info_team_member_id_key" ON "staff_tax_info"("team_member_id");

-- CreateIndex
CREATE INDEX "retail_items_restaurant_id_idx" ON "retail_items"("restaurant_id");

-- CreateIndex
CREATE INDEX "retail_items_restaurant_id_sku_idx" ON "retail_items"("restaurant_id", "sku");

-- CreateIndex
CREATE INDEX "retail_items_restaurant_id_barcode_idx" ON "retail_items"("restaurant_id", "barcode");

-- CreateIndex
CREATE INDEX "retail_categories_restaurant_id_idx" ON "retail_categories"("restaurant_id");

-- CreateIndex
CREATE INDEX "retail_option_sets_restaurant_id_idx" ON "retail_option_sets"("restaurant_id");

-- CreateIndex
CREATE INDEX "retail_options_option_set_id_idx" ON "retail_options"("option_set_id");

-- CreateIndex
CREATE UNIQUE INDEX "retail_item_option_sets_retail_item_id_option_set_id_key" ON "retail_item_option_sets"("retail_item_id", "option_set_id");

-- CreateIndex
CREATE UNIQUE INDEX "retail_stock_retail_item_id_key" ON "retail_stock"("retail_item_id");

-- CreateIndex
CREATE INDEX "retail_stock_restaurant_id_idx" ON "retail_stock"("restaurant_id");

-- CreateIndex
CREATE INDEX "layaways_restaurant_id_idx" ON "layaways"("restaurant_id");

-- CreateIndex
CREATE INDEX "retail_quick_keys_restaurant_id_idx" ON "retail_quick_keys"("restaurant_id");

-- CreateIndex
CREATE INDEX "payroll_periods_restaurant_id_idx" ON "payroll_periods"("restaurant_id");

-- CreateIndex
CREATE INDEX "commission_rules_restaurant_id_idx" ON "commission_rules"("restaurant_id");

-- CreateIndex
CREATE INDEX "compliance_alerts_restaurant_id_idx" ON "compliance_alerts"("restaurant_id");

-- CreateIndex
CREATE INDEX "compliance_alerts_restaurant_id_is_resolved_idx" ON "compliance_alerts"("restaurant_id", "is_resolved");

-- CreateIndex
CREATE INDEX "recurring_reservations_restaurant_id_idx" ON "recurring_reservations"("restaurant_id");

-- CreateIndex
CREATE INDEX "events_restaurant_id_idx" ON "events"("restaurant_id");

-- CreateIndex
CREATE INDEX "customer_feedback_restaurant_id_idx" ON "customer_feedback"("restaurant_id");

-- CreateIndex
CREATE INDEX "customer_feedback_restaurant_id_rating_idx" ON "customer_feedback"("restaurant_id", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "order_sentiments_order_id_key" ON "order_sentiments"("order_id");

-- CreateIndex
CREATE INDEX "order_sentiments_restaurant_id_idx" ON "order_sentiments"("restaurant_id");

-- CreateIndex
CREATE INDEX "order_sentiments_restaurant_id_is_read_idx" ON "order_sentiments"("restaurant_id", "is_read");

-- CreateIndex
CREATE INDEX "order_sentiments_restaurant_id_urgency_idx" ON "order_sentiments"("restaurant_id", "urgency");

-- CreateIndex
CREATE INDEX "smart_groups_restaurant_id_idx" ON "smart_groups"("restaurant_id");

-- CreateIndex
CREATE INDEX "message_threads_restaurant_id_idx" ON "message_threads"("restaurant_id");

-- CreateIndex
CREATE INDEX "message_threads_restaurant_id_customer_id_idx" ON "message_threads"("restaurant_id", "customer_id");

-- CreateIndex
CREATE INDEX "messages_thread_id_idx" ON "messages"("thread_id");

-- CreateIndex
CREATE INDEX "message_templates_restaurant_id_idx" ON "message_templates"("restaurant_id");

-- CreateIndex
CREATE INDEX "marketing_automations_restaurant_id_idx" ON "marketing_automations"("restaurant_id");

-- CreateIndex
CREATE INDEX "unit_conversions_restaurant_id_idx" ON "unit_conversions"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_conversions_restaurant_id_from_unit_to_unit_key" ON "unit_conversions"("restaurant_id", "from_unit", "to_unit");

-- CreateIndex
CREATE INDEX "cycle_counts_restaurant_id_idx" ON "cycle_counts"("restaurant_id");

-- CreateIndex
CREATE INDEX "cycle_count_items_cycle_count_id_idx" ON "cycle_count_items"("cycle_count_id");

-- CreateIndex
CREATE INDEX "catering_events_restaurant_id_idx" ON "catering_events"("restaurant_id");

-- CreateIndex
CREATE INDEX "catering_events_restaurant_id_status_idx" ON "catering_events"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX "catering_events_restaurant_id_fulfillment_date_idx" ON "catering_events"("restaurant_id", "fulfillment_date");

-- CreateIndex
CREATE UNIQUE INDEX "catering_proposal_tokens_token_key" ON "catering_proposal_tokens"("token");

-- CreateIndex
CREATE INDEX "catering_activities_job_id_idx" ON "catering_activities"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "catering_capacity_settings_restaurant_id_key" ON "catering_capacity_settings"("restaurant_id");

-- CreateIndex
CREATE INDEX "catering_package_templates_merchant_id_idx" ON "catering_package_templates"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_team_member_id_idx" ON "password_reset_tokens"("team_member_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "password_history_team_member_id_created_at_idx" ON "password_history"("team_member_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "mfa_secrets_team_member_id_key" ON "mfa_secrets"("team_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_trusted_devices_team_member_id_ua_fingerprint_key" ON "mfa_trusted_devices"("team_member_id", "ua_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "pending_verifications_email_hash_key" ON "pending_verifications"("email_hash");

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_restaurant_group_id_fkey" FOREIGN KEY ("restaurant_group_id") REFERENCES "restaurant_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_delivery_credentials" ADD CONSTRAINT "restaurant_delivery_credentials_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_provider_profiles" ADD CONSTRAINT "restaurant_provider_profiles_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_provider_profile_events" ADD CONSTRAINT "restaurant_provider_profile_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_provider_profile_events" ADD CONSTRAINT "restaurant_provider_profile_events_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "restaurant_provider_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_integrations" ADD CONSTRAINT "marketplace_integrations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "marketplace_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_webhook_events" ADD CONSTRAINT "marketplace_webhook_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_webhook_events" ADD CONSTRAINT "marketplace_webhook_events_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "marketplace_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_menu_mappings" ADD CONSTRAINT "marketplace_menu_mappings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_menu_mappings" ADD CONSTRAINT "marketplace_menu_mappings_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_status_sync_jobs" ADD CONSTRAINT "marketplace_status_sync_jobs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_status_sync_jobs" ADD CONSTRAINT "marketplace_status_sync_jobs_marketplace_order_id_fkey" FOREIGN KEY ("marketplace_order_id") REFERENCES "marketplace_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "primary_categories" ADD CONSTRAINT "primary_categories_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_primary_category_id_fkey" FOREIGN KEY ("primary_category_id") REFERENCES "primary_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_modifier_group_id_fkey" FOREIGN KEY ("modifier_group_id") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_modifier_group_id_fkey" FOREIGN KEY ("modifier_group_id") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "restaurant_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_modifier_id_fkey" FOREIGN KEY ("modifier_id") REFERENCES "modifiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_checks" ADD CONSTRAINT "order_checks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_items" ADD CONSTRAINT "check_items_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "order_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_item_modifiers" ADD CONSTRAINT "check_item_modifiers_check_item_id_fkey" FOREIGN KEY ("check_item_id") REFERENCES "check_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_discounts" ADD CONSTRAINT "check_discounts_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "order_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_voided_items" ADD CONSTRAINT "check_voided_items_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "order_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_restaurant_access" ADD CONSTRAINT "user_restaurant_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_restaurant_access" ADD CONSTRAINT "user_restaurant_access_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_pins" ADD CONSTRAINT "staff_pins_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_staff_pin_id_fkey" FOREIGN KEY ("staff_pin_id") REFERENCES "staff_pins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_staff_pin_id_fkey" FOREIGN KEY ("staff_pin_id") REFERENCES "staff_pins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_availability" ADD CONSTRAINT "staff_availability_staff_pin_id_fkey" FOREIGN KEY ("staff_pin_id") REFERENCES "staff_pins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_requestor_pin_id_fkey" FOREIGN KEY ("requestor_pin_id") REFERENCES "staff_pins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timecard_edit_requests" ADD CONSTRAINT "timecard_edit_requests_time_entry_id_fkey" FOREIGN KEY ("time_entry_id") REFERENCES "time_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timecard_edit_requests" ADD CONSTRAINT "timecard_edit_requests_staff_pin_id_fkey" FOREIGN KEY ("staff_pin_id") REFERENCES "staff_pins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_requests" ADD CONSTRAINT "pto_requests_staff_pin_id_fkey" FOREIGN KEY ("staff_pin_id") REFERENCES "staff_pins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_shifts" ADD CONSTRAINT "template_shifts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "schedule_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_category_mappings" ADD CONSTRAINT "station_category_mappings_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_category_mappings" ADD CONSTRAINT "station_category_mappings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_mode_id_fkey" FOREIGN KEY ("mode_id") REFERENCES "device_modes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_modes" ADD CONSTRAINT "device_modes_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_profiles" ADD CONSTRAINT "printer_profiles_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peripheral_devices" ADD CONSTRAINT "peripheral_devices_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peripheral_devices" ADD CONSTRAINT "peripheral_devices_parent_device_id_fkey" FOREIGN KEY ("parent_device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_profiles" ADD CONSTRAINT "kiosk_profiles_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printers" ADD CONSTRAINT "printers_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_rewards" ADD CONSTRAINT "loyalty_rewards_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_loyalty_config" ADD CONSTRAINT "restaurant_loyalty_config_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_card_redemptions" ADD CONSTRAINT "gift_card_redemptions_gift_card_id_fkey" FOREIGN KEY ("gift_card_id") REFERENCES "gift_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_house_account_id_fkey" FOREIGN KEY ("house_account_id") REFERENCES "house_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_accounts" ADD CONSTRAINT "house_accounts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_performances" ADD CONSTRAINT "campaign_performances_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combos" ADD CONSTRAINT "combos_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_ai_credentials" ADD CONSTRAINT "restaurant_ai_credentials_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_line_items" ADD CONSTRAINT "purchase_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_cost_recipes" ADD CONSTRAINT "food_cost_recipes_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_cost_recipes" ADD CONSTRAINT "food_cost_recipes_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_cost_recipe_ingredients" ADD CONSTRAINT "food_cost_recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "food_cost_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_groups" ADD CONSTRAINT "location_groups_restaurant_group_id_fkey" FOREIGN KEY ("restaurant_group_id") REFERENCES "restaurant_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_group_members" ADD CONSTRAINT "location_group_members_location_group_id_fkey" FOREIGN KEY ("location_group_id") REFERENCES "location_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_group_members" ADD CONSTRAINT "location_group_members_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_sync_logs" ADD CONSTRAINT "menu_sync_logs_restaurant_group_id_fkey" FOREIGN KEY ("restaurant_group_id") REFERENCES "restaurant_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_supplier_credentials" ADD CONSTRAINT "restaurant_supplier_credentials_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_saved_report_id_fkey" FOREIGN KEY ("saved_report_id") REFERENCES "saved_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_templates" ADD CONSTRAINT "order_templates_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_configs" ADD CONSTRAINT "referral_configs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_sets" ADD CONSTRAINT "permission_sets_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_restaurant_group_id_fkey" FOREIGN KEY ("restaurant_group_id") REFERENCES "restaurant_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_permission_set_id_fkey" FOREIGN KEY ("permission_set_id") REFERENCES "permission_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_types" ADD CONSTRAINT "break_types_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_member_jobs" ADD CONSTRAINT "team_member_jobs_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_tax_info" ADD CONSTRAINT "staff_tax_info_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_items" ADD CONSTRAINT "retail_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_items" ADD CONSTRAINT "retail_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "retail_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_categories" ADD CONSTRAINT "retail_categories_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_categories" ADD CONSTRAINT "retail_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "retail_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_option_sets" ADD CONSTRAINT "retail_option_sets_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_options" ADD CONSTRAINT "retail_options_option_set_id_fkey" FOREIGN KEY ("option_set_id") REFERENCES "retail_option_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_item_option_sets" ADD CONSTRAINT "retail_item_option_sets_retail_item_id_fkey" FOREIGN KEY ("retail_item_id") REFERENCES "retail_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_item_option_sets" ADD CONSTRAINT "retail_item_option_sets_option_set_id_fkey" FOREIGN KEY ("option_set_id") REFERENCES "retail_option_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_stock" ADD CONSTRAINT "retail_stock_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_stock" ADD CONSTRAINT "retail_stock_retail_item_id_fkey" FOREIGN KEY ("retail_item_id") REFERENCES "retail_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaways" ADD CONSTRAINT "layaways_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retail_quick_keys" ADD CONSTRAINT "retail_quick_keys_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_alerts" ADD CONSTRAINT "compliance_alerts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_reservations" ADD CONSTRAINT "recurring_reservations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_feedback" ADD CONSTRAINT "customer_feedback_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sentiments" ADD CONSTRAINT "order_sentiments_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_groups" ADD CONSTRAINT "smart_groups_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_automations" ADD CONSTRAINT "marketing_automations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_counts" ADD CONSTRAINT "cycle_counts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_count_items" ADD CONSTRAINT "cycle_count_items_cycle_count_id_fkey" FOREIGN KEY ("cycle_count_id") REFERENCES "cycle_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_events" ADD CONSTRAINT "catering_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_proposal_tokens" ADD CONSTRAINT "catering_proposal_tokens_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "catering_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_activities" ADD CONSTRAINT "catering_activities_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "catering_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_capacity_settings" ADD CONSTRAINT "catering_capacity_settings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_secrets" ADD CONSTRAINT "mfa_secrets_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_trusted_devices" ADD CONSTRAINT "mfa_trusted_devices_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

