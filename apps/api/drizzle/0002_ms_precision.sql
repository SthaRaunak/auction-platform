ALTER TABLE "auctions" ALTER COLUMN "starts_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "auctions" ALTER COLUMN "starts_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "auctions" ALTER COLUMN "ends_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "auctions" ALTER COLUMN "original_ends_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "auctions" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "auctions" ALTER COLUMN "created_at" SET DEFAULT now();