DROP INDEX "dealers_email_uq";--> statement-breakpoint
DROP INDEX "dealers_company_title_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "dealers_email_uq" ON "dealers" USING btree (lower("email")) WHERE "dealers"."status" <> 'rejected';--> statement-breakpoint
CREATE UNIQUE INDEX "dealers_company_title_uq" ON "dealers" USING btree (lower("company_title")) WHERE "dealers"."status" <> 'rejected';