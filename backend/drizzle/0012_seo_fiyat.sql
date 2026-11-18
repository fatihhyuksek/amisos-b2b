CREATE TABLE "product_slug_redirects" (
	"slug" text PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_groups" ADD COLUMN "slug" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "product_groups" ADD COLUMN "seo_title" text;--> statement-breakpoint
ALTER TABLE "product_groups" ADD COLUMN "seo_description" text;--> statement-breakpoint
ALTER TABLE "product_groups" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "bizimhesap_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "slug" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "seo_title" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "seo_description" text;--> statement-breakpoint
-- K-82: mevcut ürün ve gruplara slug üret (kod tarafındaki slugify ile aynı kural: Türkçe harfler sadeleşir,
-- küçük harf, tire; çakışmada -2, -3 ...). Sonra NOT NULL ve tekillik uygulanır.
WITH base AS (
	SELECT id, coalesce(nullif(left(trim(both '-' from regexp_replace(lower(translate("name", 'İIıÇçĞğÖöŞşÜü', 'iiiccggoossuu')), '[^a-z0-9]+', '-', 'g')), 80), ''), 'urun') AS b,
	       created_at
	FROM "products"
), ranked AS (
	SELECT id, b, row_number() OVER (PARTITION BY b ORDER BY created_at, id) AS rn FROM base
)
UPDATE "products" p SET "slug" = CASE WHEN r.rn = 1 THEN r.b ELSE r.b || '-' || r.rn END FROM ranked r WHERE p.id = r.id;--> statement-breakpoint
UPDATE "products" p SET "slug" = p."slug" || '-' || substr(p.id::text, 1, 8)
WHERE (SELECT count(*) FROM "products" q WHERE q."slug" = p."slug") > 1;--> statement-breakpoint
WITH base AS (
	SELECT id, coalesce(nullif(left(trim(both '-' from regexp_replace(lower(translate("name", 'İIıÇçĞğÖöŞşÜü', 'iiiccggoossuu')), '[^a-z0-9]+', '-', 'g')), 80), ''), 'grup') AS b,
	       created_at
	FROM "product_groups"
), ranked AS (
	SELECT id, b, row_number() OVER (PARTITION BY b ORDER BY created_at, id) AS rn FROM base
)
UPDATE "product_groups" g SET "slug" = CASE WHEN r.rn = 1 THEN r.b ELSE r.b || '-' || r.rn END FROM ranked r WHERE g.id = r.id;--> statement-breakpoint
UPDATE "product_groups" g SET "slug" = g."slug" || '-' || substr(g.id::text, 1, 8)
WHERE (SELECT count(*) FROM "product_groups" q WHERE q."slug" = g."slug") > 1;--> statement-breakpoint
ALTER TABLE "product_groups" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_slug_redirects" ADD CONSTRAINT "product_slug_redirects_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_slug_redirects_product_idx" ON "product_slug_redirects" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_groups_slug_uq" ON "product_groups" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "products_bizimhesap_id_uq" ON "products" USING btree ("bizimhesap_id") WHERE "products"."bizimhesap_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_uq" ON "products" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "product_groups" ADD CONSTRAINT "product_groups_slug_not_blank" CHECK (length(trim("product_groups"."slug")) > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_slug_not_blank" CHECK (length(trim("products"."slug")) > 0);--> statement-breakpoint

-- Güvenlik ağı: slug verilmeden (boş/NULL) eklenen satırlara addan tekil slug üretir (uygulama açıkça yazar;
-- eski betikler ve doğrudan SQL de çalışır).
CREATE FUNCTION "set_product_slug"() RETURNS trigger AS $$
DECLARE base text; cand text; n int := 1;
BEGIN
	IF NEW."slug" IS NULL OR trim(NEW."slug") = '' THEN
		base := coalesce(nullif(left(trim(both '-' from regexp_replace(lower(translate(NEW."name", 'İIıÇçĞğÖöŞşÜü', 'iiiccggoossuu')), '[^a-z0-9]+', '-', 'g')), 80), ''), 'urun');
		cand := base;
		WHILE EXISTS (SELECT 1 FROM "products" WHERE "slug" = cand) OR EXISTS (SELECT 1 FROM "product_slug_redirects" WHERE "slug" = cand) LOOP
			n := n + 1;
			cand := base || '-' || n;
		END LOOP;
		NEW."slug" := cand;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "products_set_slug" BEFORE INSERT ON "products" FOR EACH ROW EXECUTE FUNCTION "set_product_slug"();--> statement-breakpoint
CREATE FUNCTION "set_product_group_slug"() RETURNS trigger AS $$
DECLARE base text; cand text; n int := 1;
BEGIN
	IF NEW."slug" IS NULL OR trim(NEW."slug") = '' THEN
		base := coalesce(nullif(left(trim(both '-' from regexp_replace(lower(translate(NEW."name", 'İIıÇçĞğÖöŞşÜü', 'iiiccggoossuu')), '[^a-z0-9]+', '-', 'g')), 80), ''), 'grup');
		cand := base;
		WHILE EXISTS (SELECT 1 FROM "product_groups" WHERE "slug" = cand) LOOP
			n := n + 1;
			cand := base || '-' || n;
		END LOOP;
		NEW."slug" := cand;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "product_groups_set_slug" BEFORE INSERT ON "product_groups" FOR EACH ROW EXECUTE FUNCTION "set_product_group_slug"();
