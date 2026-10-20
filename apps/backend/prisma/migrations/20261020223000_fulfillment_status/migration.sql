CREATE TYPE "FulfillmentStatus" AS ENUM ('pending', 'confirmed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'failed', 'paid');

ALTER TABLE "Order" ADD COLUMN "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'pending';
