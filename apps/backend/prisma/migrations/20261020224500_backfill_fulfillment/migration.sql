UPDATE "Order"
SET "fulfillmentStatus" = CASE "orderStatus"
  WHEN 'CONFIRMED' THEN 'confirmed'::"FulfillmentStatus"
  WHEN 'DISPATCHED' THEN 'shipped'::"FulfillmentStatus"
  WHEN 'DELIVERED' THEN 'delivered'::"FulfillmentStatus"
  WHEN 'FAILED_DELIVERY' THEN 'failed'::"FulfillmentStatus"
  ELSE "fulfillmentStatus"
END
WHERE "fulfillmentStatus" = 'pending'
  AND "orderStatus" <> 'UNCONFIRMED';
