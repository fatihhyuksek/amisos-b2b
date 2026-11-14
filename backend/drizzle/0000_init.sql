CREATE TYPE "public"."actor_type" AS ENUM('admin', 'dealer', 'system');--> statement-breakpoint
CREATE TYPE "public"."consent_type" AS ENUM('kvkk', 'terms', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."dealer_source" AS ENUM('application', 'invitation');--> statement-breakpoint
CREATE TYPE "public"."dealer_status" AS ENUM('pending_email', 'pending_approval', 'active', 'rejected', 'passive');--> statement-breakpoint
CREATE TYPE "public"."delivery_method" AS ENUM('carrier', 'pickup', 'truck');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('submitted', 'negotiating', 'approved', 'shipped', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."status_change_source" AS ENUM('system', 'admin', 'bizimhesap');--> statement-breakpoint
CREATE TYPE "public"."stock_source" AS ENUM('manual', 'bizimhesap');--> statement-breakpoint
CREATE TYPE "public"."stock_status" AS ENUM('in_stock', 'out_of_stock');--> statement-breakpoint
CREATE TYPE "public"."token_purpose" AS ENUM('email_verification', 'password_reset', 'invitation');--> statement-breakpoint
CREATE TYPE "public"."token_subject" AS ENUM('admin', 'dealer');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('pending', 'transferred', 'failed', 'manual');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"reason" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "token_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"dealer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_dealer_id_product_id_pk" PRIMARY KEY("dealer_id","product_id"),
	CONSTRAINT "cart_items_quantity_positive" CHECK ("cart_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"type" "consent_type" NOT NULL,
	"document_version" text NOT NULL,
	"granted" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dealer_group_discounts" (
	"dealer_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"discount_percent" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealer_group_discounts_dealer_id_group_id_pk" PRIMARY KEY("dealer_id","group_id"),
	CONSTRAINT "dealer_group_discounts_range" CHECK ("dealer_group_discounts"."discount_percent" > 0 AND "dealer_group_discounts"."discount_percent" < 100)
);
--> statement-breakpoint
CREATE TABLE "dealers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_title" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"city" text NOT NULL,
	"district" text NOT NULL,
	"address" text NOT NULL,
	"status" "dealer_status" DEFAULT 'pending_email' NOT NULL,
	"source" "dealer_source" NOT NULL,
	"password_hash" text,
	"email_verified_at" timestamp with time zone,
	"general_discount_percent" numeric(5, 2),
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"rejection_reason" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealers_general_discount_range" CHECK ("dealers"."general_discount_percent" IS NULL OR ("dealers"."general_discount_percent" > 0 AND "dealers"."general_discount_percent" < 100)),
	CONSTRAINT "dealers_rejection_has_reason" CHECK ("dealers"."status" <> 'rejected' OR "dealers"."rejection_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"barcode" text NOT NULL,
	"product_code" text,
	"product_name" text NOT NULL,
	"case_quantity" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_list_price" numeric(14, 2) NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"gross_amount" numeric(14, 2) NOT NULL,
	"discount_amount" numeric(14, 2) NOT NULL,
	"net_amount" numeric(14, 2) NOT NULL,
	"vat_rate" numeric(5, 2) NOT NULL,
	"vat_amount" numeric(14, 2) NOT NULL,
	"out_of_stock_at_order" boolean DEFAULT false NOT NULL,
	CONSTRAINT "order_lines_quantity_positive" CHECK ("order_lines"."quantity" > 0),
	CONSTRAINT "order_lines_case_multiple" CHECK ("order_lines"."quantity" % "order_lines"."case_quantity" = 0),
	CONSTRAINT "order_lines_discount_range" CHECK ("order_lines"."discount_percent" >= 0 AND "order_lines"."discount_percent" < 100),
	CONSTRAINT "order_lines_amounts_consistent" CHECK ("order_lines"."net_amount" = "order_lines"."gross_amount" - "order_lines"."discount_amount")
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"source" "status_change_source" NOT NULL,
	"changed_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_status_history_admin_has_user" CHECK ("order_status_history"."source" <> 'admin' OR "order_status_history"."changed_by" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_no" integer GENERATED ALWAYS AS IDENTITY (sequence name "orders_order_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"dealer_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'submitted' NOT NULL,
	"delivery_method" "delivery_method" NOT NULL,
	"delivery_address" text,
	"carrier_name" text,
	"carrier_branch" text,
	"note" text,
	"currency" text DEFAULT 'TRY' NOT NULL,
	"gross_total" numeric(14, 2) NOT NULL,
	"discount_total" numeric(14, 2) NOT NULL,
	"net_total" numeric(14, 2) NOT NULL,
	"vat_total" numeric(14, 2) NOT NULL,
	"grand_total" numeric(14, 2) NOT NULL,
	"transfer_status" "transfer_status" DEFAULT 'pending' NOT NULL,
	"bizimhesap_guid" text,
	"transfer_error" text,
	"transferred_at" timestamp with time zone,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_carrier_requires_address" CHECK ("orders"."delivery_method" <> 'carrier' OR (
        length(trim(coalesce("orders"."delivery_address", ''))) > 0
        AND length(trim(coalesce("orders"."carrier_name", ''))) > 0
        AND length(trim(coalesce("orders"."carrier_branch", ''))) > 0
      )),
	CONSTRAINT "orders_totals_consistent" CHECK ("orders"."net_total" = "orders"."gross_total" - "orders"."discount_total"
        AND "orders"."grand_total" = "orders"."net_total" + "orders"."vat_total")
);
--> statement-breakpoint
CREATE TABLE "product_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"alt_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"barcode" text NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"description" text,
	"case_quantity" integer DEFAULT 1 NOT NULL,
	"list_price" numeric(14, 2) NOT NULL,
	"vat_rate" numeric(5, 2) NOT NULL,
	"stock_status" "stock_status" DEFAULT 'out_of_stock' NOT NULL,
	"stock_source" "stock_source" DEFAULT 'manual' NOT NULL,
	"stock_updated_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_barcode_not_blank" CHECK (length(trim("products"."barcode")) > 0),
	CONSTRAINT "products_case_quantity_positive" CHECK ("products"."case_quantity" > 0),
	CONSTRAINT "products_list_price_non_negative" CHECK ("products"."list_price" >= 0),
	CONSTRAINT "products_vat_rate_range" CHECK ("products"."vat_rate" >= 0 AND "products"."vat_rate" < 100)
);
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_group_discounts" ADD CONSTRAINT "dealer_group_discounts_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_group_discounts" ADD CONSTRAINT "dealer_group_discounts_group_id_product_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."product_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_reviewed_by_admin_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_admin_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_group_id_product_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."product_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_uq" ON "admin_users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_hash_uq" ON "auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_tokens_subject_idx" ON "auth_tokens" USING btree ("subject_type","subject_id","purpose");--> statement-breakpoint
CREATE INDEX "consents_dealer_idx" ON "consents" USING btree ("dealer_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "dealers_email_uq" ON "dealers" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "dealers_company_title_uq" ON "dealers" USING btree (lower("company_title"));--> statement-breakpoint
CREATE INDEX "dealers_status_idx" ON "dealers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "order_lines_order_line_uq" ON "order_lines" USING btree ("order_id","line_no");--> statement-breakpoint
CREATE INDEX "order_lines_product_idx" ON "order_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_no_uq" ON "orders" USING btree ("order_no");--> statement-breakpoint
CREATE INDEX "orders_dealer_idx" ON "orders" USING btree ("dealer_id","submitted_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_submitted_at_idx" ON "orders" USING btree ("submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_groups_name_uq" ON "product_groups" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "products_barcode_uq" ON "products" USING btree ("barcode");--> statement-breakpoint
CREATE UNIQUE INDEX "products_code_uq" ON "products" USING btree ("code") WHERE "products"."code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "products_group_idx" ON "products" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree (lower("name"));