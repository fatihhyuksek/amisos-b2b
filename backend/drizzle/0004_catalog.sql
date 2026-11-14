CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "product_groups_name_uq";--> statement-breakpoint
-- Ad tekillik anahtarı: iç boşluklar tek boşluk, Türkçe yerelle küçültme (companyTitleKey() ile aynı sonuç; 0003 ile aynı yöntem).
ALTER TABLE "product_groups" ADD COLUMN "name_key" text;--> statement-breakpoint
UPDATE "product_groups" SET "name" = regexp_replace(btrim("name", E' \t\r\n'), '\s+', ' ', 'g');--> statement-breakpoint
UPDATE "product_groups" SET "name_key" = lower(translate("name", 'İIÇĞÖŞÜ', 'iıçğöşü'));--> statement-breakpoint
ALTER TABLE "product_groups" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "media_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_admin_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_storage_key_uq" ON "media" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_groups_name_key_uq" ON "product_groups" USING btree ("name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_product_media_uq" ON "product_images" USING btree ("product_id","media_id");--> statement-breakpoint
CREATE INDEX "product_images_media_idx" ON "product_images" USING btree ("media_id");--> statement-breakpoint
ALTER TABLE "product_images" DROP COLUMN "storage_key";--> statement-breakpoint
ALTER TABLE "product_images" DROP COLUMN "alt_text";