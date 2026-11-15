DROP INDEX "orders_submitted_status_idx";--> statement-breakpoint
CREATE INDEX "orders_submitted_sold_idx" ON "orders" USING btree ("submitted_at") WHERE "orders"."status" <> 'cancelled';