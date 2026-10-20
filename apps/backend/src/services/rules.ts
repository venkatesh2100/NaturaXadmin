export const HOUR_MS = 60 * 60 * 1000;
export const UNCONFIRMED_AFTER_MS = 2 * HOUR_MS;
export const DISPATCH_AFTER_MS = 24 * HOUR_MS;
export const HIGH_VALUE_RUPEES = 5000;

/**
 * Deadline policy, measured from the moment the exception is detected:
 * - HIGH: 2 hours. Customer-facing failures should be touched in the same shift.
 * - MEDIUM: 8 hours. Courier checks can wait for the next tracking sweep.
 * - LOW: 24 hours. Reserved for future lower-urgency categories.
 * The current rules emit only HIGH and MEDIUM.
 */
export const DEADLINE_MS = {
  HIGH: 2 * HOUR_MS,
  MEDIUM: 8 * HOUR_MS,
  LOW: 24 * HOUR_MS,
} as const;

export type RulePriority = keyof typeof DEADLINE_MS;

export type RuleCategory =
  | "UNCONFIRMED"
  | "DISPATCH_DELAY"
  | "SHIPMENT_DELAY"
  | "FAILED_DELIVERY"
  | "HIGH_VALUE_OVERDUE";

export type OrderStatusName =
  | "UNCONFIRMED"
  | "CONFIRMED"
  | "DISPATCHED"
  | "DELIVERED"
  | "FAILED_DELIVERY";

export type FulfillmentName =
  | "pending"
  | "confirmed"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "failed"
  | "paid";

const LEGACY_STATUS: Record<OrderStatusName, FulfillmentName> = {
  UNCONFIRMED: "pending",
  CONFIRMED: "confirmed",
  DISPATCHED: "shipped",
  DELIVERED: "delivered",
  FAILED_DELIVERY: "failed",
};

export type RuleOrder = {
  orderStatus: OrderStatusName | null;
  fulfillmentStatus?: FulfillmentName | null;
  orderDate: Date | null;
  orderValue: number | null;
  dispatchDate: Date | null;
  expectedDeliveryDate: Date | null;
  deliveredDate: Date | null;
};

export type RuleHit = {
  category: RuleCategory;
  priority: RulePriority;
  reason: string;
  actionRequired: string;
};

export type DataQualityFinding = {
  code: string;
  message: string;
};

export type RuleResult = {
  tasks: RuleHit[];
  dataQuality: DataQualityFinding[];
};

export function deadlineFor(priority: RulePriority, detectedAt: Date): Date {
  return new Date(detectedAt.getTime() + DEADLINE_MS[priority]);
}

export function liveStatus(order: RuleOrder): FulfillmentName | null {
  if (order.fulfillmentStatus) return order.fulfillmentStatus;
  if (!order.orderStatus) return null;
  return LEGACY_STATUS[order.orderStatus];
}

export function isDelivered(order: RuleOrder): boolean {
  const status = liveStatus(order);
  return status === "delivered" || status === "cancelled" || status === "paid" || order.deliveredDate != null;
}

function olderThan(timestamp: Date, now: Date, thresholdMs: number): boolean {
  return now.getTime() - timestamp.getTime() > thresholdMs;
}

function hasPassed(timestamp: Date, now: Date): boolean {
  return timestamp.getTime() < now.getTime();
}

export function evaluateOrder(order: RuleOrder, now: Date): RuleResult {
  const tasks: RuleHit[] = [];
  const dataQuality: DataQualityFinding[] = [];
  const status = liveStatus(order);

  if (status === "delivered" || status === "cancelled" || status === "paid") {
    return { tasks, dataQuality };
  }

  if (status === "pending") {
    if (!order.orderDate) {
      dataQuality.push({
        code: "UNCONFIRMED_MISSING_ORDER_DATE",
        message: "Pending order is missing an order date, so the 2-hour rule cannot be evaluated.",
      });
    } else if (olderThan(order.orderDate, now, UNCONFIRMED_AFTER_MS)) {
      tasks.push({
        category: "UNCONFIRMED",
        priority: "HIGH",
        reason: "Order has remained pending for more than 2 hours.",
        actionRequired: "Contact the customer and confirm the order.",
      });
    }
  }

  if (status === "confirmed" && !order.dispatchDate) {
    if (!order.orderDate) {
      dataQuality.push({
        code: "DISPATCH_DELAY_MISSING_ORDER_DATE",
        message: "Confirmed order is missing an order date, so the 24-hour dispatch rule cannot be evaluated.",
      });
    } else if (olderThan(order.orderDate, now, DISPATCH_AFTER_MS)) {
      tasks.push({
        category: "DISPATCH_DELAY",
        priority: "HIGH",
        reason: "Confirmed order has not been dispatched within 24 hours.",
        actionRequired: "Check inventory and dispatch the order.",
      });
    }
  }

  if (status === "shipped" || status === "out_for_delivery" || status === "failed") {
    if (!order.dispatchDate || !order.expectedDeliveryDate) {
      dataQuality.push({
        code: "SHIPMENT_DELAY_MISSING_DATES",
        message: "Shipment is missing a dispatch date or expected delivery date, so the delay rule cannot be evaluated.",
      });
    } else if (!isDelivered(order) && hasPassed(order.expectedDeliveryDate, now)) {
      tasks.push({
        category: "SHIPMENT_DELAY",
        priority: "MEDIUM",
        reason: "Expected delivery date has passed and the shipment has not been delivered.",
        actionRequired: "Check courier tracking and contact the customer.",
      });
    }
  }

  if (status === "failed") {
    tasks.push({
      category: "FAILED_DELIVERY",
      priority: "HIGH",
      reason: "A delivery attempt failed and needs immediate follow-up.",
      actionRequired: "Contact the customer and arrange a delivery reattempt.",
    });
  }

  const highValue = order.orderValue != null && order.orderValue > HIGH_VALUE_RUPEES;
  if (highValue && !isDelivered(order)) {
    if (!order.expectedDeliveryDate) {
      dataQuality.push({
        code: "HIGH_VALUE_MISSING_EXPECTED_DELIVERY",
        message: "High-value order is missing an expected delivery date, so the overdue rule cannot be evaluated.",
      });
    } else if (hasPassed(order.expectedDeliveryDate, now)) {
      tasks.push({
        category: "HIGH_VALUE_OVERDUE",
        priority: "HIGH",
        reason: "Order value is above ₹5,000 and it remains undelivered past the expected delivery date.",
        actionRequired: "Escalate with the courier and proactively contact the customer.",
      });
    }
  }

  return { tasks, dataQuality };
}
