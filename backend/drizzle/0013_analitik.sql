CREATE TABLE "analytics_daily_salts" (
	"day" date PRIMARY KEY NOT NULL,
	"salt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"session_key" text NOT NULL,
	"visitor_key" text NOT NULL,
	"dealer_id" uuid,
	"path" text NOT NULL,
	"product_id" uuid,
	"group_id" uuid,
	"query" text,
	"result_count" integer,
	"quantity" integer,
	"order_id" uuid,
	"referrer_host" text,
	"device" text NOT NULL,
	"utm_source" text
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_occurred_idx" ON "analytics_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_type_occurred_idx" ON "analytics_events" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_dealer_occurred_idx" ON "analytics_events" USING btree ("dealer_id","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_product_occurred_idx" ON "analytics_events" USING btree ("product_id","occurred_at");