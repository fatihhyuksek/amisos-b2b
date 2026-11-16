CREATE TABLE "dealer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"label" text NOT NULL,
	"carrier_name" text DEFAULT '' NOT NULL,
	"carrier_branch" text DEFAULT '' NOT NULL,
	"address" text NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"district" text DEFAULT '' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealer_addresses_label_not_blank" CHECK (length(trim("dealer_addresses"."label")) > 0),
	CONSTRAINT "dealer_addresses_address_not_blank" CHECK (length(trim("dealer_addresses"."address")) > 0)
);
--> statement-breakpoint
CREATE TABLE "dealer_favorites" (
	"dealer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealer_favorites_dealer_id_product_id_pk" PRIMARY KEY("dealer_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "dealer_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealer_notes_body_not_blank" CHECK (length(trim("dealer_notes"."body")) > 0)
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "tax_office" text;--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "tax_number" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dealer_addresses" ADD CONSTRAINT "dealer_addresses_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_favorites" ADD CONSTRAINT "dealer_favorites_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_favorites" ADD CONSTRAINT "dealer_favorites_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_notes" ADD CONSTRAINT "dealer_notes_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_notes" ADD CONSTRAINT "dealer_notes_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_admin_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dealer_addresses_dealer_idx" ON "dealer_addresses" USING btree ("dealer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dealer_addresses_default_uq" ON "dealer_addresses" USING btree ("dealer_id") WHERE "dealer_addresses"."is_default";--> statement-breakpoint
CREATE INDEX "dealer_favorites_dealer_idx" ON "dealer_favorites" USING btree ("dealer_id","created_at");--> statement-breakpoint
CREATE INDEX "dealer_notes_dealer_idx" ON "dealer_notes" USING btree ("dealer_id","created_at");--> statement-breakpoint
CREATE INDEX "products_featured_idx" ON "products" USING btree ("id") WHERE "products"."is_featured";