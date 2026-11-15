ALTER TABLE "orders" ADD COLUMN "transfer_reference" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "transferred_by" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_transferred_by_admin_users_id_fk" FOREIGN KEY ("transferred_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;