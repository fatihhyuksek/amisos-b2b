-- GR-BAYI-005: firma unvanı tekilliği Türkçe büyük/küçük harf ve boşluk farklarına dayanıklı olur.
-- Anahtar = iç boşlukları tek boşluğa indirilmiş, Türkçe yerelle küçültülmüş unvan
-- (uygulamadaki companyTitleKey() ile aynı sonuç; DB yereline bağımlı olmamak için harfler translate ile).
DROP INDEX "dealers_company_title_uq";--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "company_title_key" text;--> statement-breakpoint
UPDATE "dealers" SET "company_title" = regexp_replace(btrim("company_title", E' \t\r\n'), '\s+', ' ', 'g');--> statement-breakpoint
UPDATE "dealers" SET "company_title_key" = lower(translate("company_title", 'İIÇĞÖŞÜ', 'iıçğöşü'));--> statement-breakpoint
ALTER TABLE "dealers" ALTER COLUMN "company_title_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "dealers_company_title_key_uq" ON "dealers" USING btree ("company_title_key") WHERE "dealers"."status" <> 'rejected';
