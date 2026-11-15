CREATE TABLE "banners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"link_path" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "banners_title_not_blank" CHECK (length(trim("banners"."title")) > 0),
	CONSTRAINT "banners_link_path_internal" CHECK ("banners"."link_path" IS NULL OR "banners"."link_path" ~ '^/([^/\\\s][^\\\s]*)?$'),
	CONSTRAINT "banners_period_valid" CHECK ("banners"."starts_at" IS NULL OR "banners"."ends_at" IS NULL OR "banners"."ends_at" > "banners"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "banners_media_idx" ON "banners" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "banners_sort_idx" ON "banners" USING btree ("sort_order");