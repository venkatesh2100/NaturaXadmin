import { describe, expect, it } from "vitest";
import { evaluateOrder, type RuleOrder } from "./rules.js";

const now = new Date("2026-10-20T12:00:00.000Z");
const hour = 60 * 60 * 1000;

function order(overrides: Partial<RuleOrder> = {}): RuleOrder {
  return {
    orderStatus: "DELIVERED",
    orderDate: new Date(now.getTime() - 48 * hour),
    orderValue: 1200,
    dispatchDate: new Date(now.getTime() - 36 * hour),
    expectedDeliveryDate: new Date(now.getTime() - 12 * hour),
    deliveredDate: new Date(now.getTime() - 6 * hour),
    ...overrides,
  };
}

describe("exception rules", () => {
  it("flags unconfirmed orders older than two hours", () => {
    const result = evaluateOrder(
      order({
        orderStatus: "UNCONFIRMED",
        orderDate: new Date(now.getTime() - 2 * hour - 1),
        dispatchDate: null,
        deliveredDate: null,
      }),
      now,
    );
    expect(result.tasks.map((task) => task.category)).toEqual(["UNCONFIRMED"]);
    expect(result.tasks[0]).toMatchObject({
      priority: "HIGH",
      actionRequired: "Contact the customer and confirm the order.",
    });
  });

  it("does not flag an unconfirmed order at the exact two-hour boundary", () => {
    const result = evaluateOrder(
      order({
        orderStatus: "UNCONFIRMED",
        orderDate: new Date(now.getTime() - 2 * hour),
        dispatchDate: null,
        deliveredDate: null,
        expectedDeliveryDate: new Date(now.getTime() + hour),
      }),
      now,
    );
    expect(result.tasks).toHaveLength(0);
    expect(result.dataQuality).toHaveLength(0);
  });

  it("flags confirmed orders with no dispatch after 24 hours", () => {
    const result = evaluateOrder(
      order({
        orderStatus: "CONFIRMED",
        orderDate: new Date(now.getTime() - 24 * hour - 1),
        dispatchDate: null,
        deliveredDate: null,
        expectedDeliveryDate: new Date(now.getTime() + 24 * hour),
      }),
      now,
    );
    expect(result.tasks.map((task) => task.category)).toContain("DISPATCH_DELAY");
  });

  it("does not flag a confirmed order at the exact 24-hour boundary", () => {
    const result = evaluateOrder(
      order({
        orderStatus: "CONFIRMED",
        orderDate: new Date(now.getTime() - 24 * hour),
        dispatchDate: null,
        deliveredDate: null,
        expectedDeliveryDate: new Date(now.getTime() + hour),
      }),
      now,
    );
    expect(result.tasks).toHaveLength(0);
  });

  it("flags a dispatched order once the expected delivery has passed", () => {
    const result = evaluateOrder(
      order({
        orderStatus: "DISPATCHED",
        deliveredDate: null,
        expectedDeliveryDate: new Date(now.getTime() - 1),
      }),
      now,
    );
    expect(result.tasks.map((task) => task.category)).toEqual(["SHIPMENT_DELAY"]);
    expect(result.tasks[0]?.priority).toBe("MEDIUM");
  });

  it("does not flag a shipment whose expected delivery is exactly now", () => {
    const result = evaluateOrder(
      order({
        orderStatus: "DISPATCHED",
        deliveredDate: null,
        expectedDeliveryDate: now,
      }),
      now,
    );
    expect(result.tasks).toHaveLength(0);
  });

  it("flags failed delivery even when the expected date has not passed", () => {
    const result = evaluateOrder(
      order({
        orderStatus: "FAILED_DELIVERY",
        deliveredDate: null,
        expectedDeliveryDate: new Date(now.getTime() + hour),
        orderValue: 900,
      }),
      now,
    );
    expect(result.tasks.map((task) => task.category)).toEqual(["FAILED_DELIVERY"]);
    expect(result.tasks[0]?.priority).toBe("HIGH");
  });

  it("flags high-value overdue orders above ₹5,000 and not at exactly ₹5,000", () => {
    const shared = {
      orderStatus: "DISPATCHED" as const,
      deliveredDate: null,
      expectedDeliveryDate: new Date(now.getTime() - hour),
    };
    const atLimit = evaluateOrder(order({ ...shared, orderValue: 5000 }), now);
    const above = evaluateOrder(order({ ...shared, orderValue: 5000.01 }), now);
    expect(atLimit.tasks.map((task) => task.category)).toEqual(["SHIPMENT_DELAY"]);
    expect(above.tasks.map((task) => task.category)).toEqual(["SHIPMENT_DELAY", "HIGH_VALUE_OVERDUE"]);
  });

  it("does not invent tasks when timestamps required by a rule are missing", () => {
    const unconfirmed = evaluateOrder(order({ orderStatus: "UNCONFIRMED", orderDate: null, deliveredDate: null }), now);
    const dispatch = evaluateOrder(
      order({ orderStatus: "CONFIRMED", orderDate: null, dispatchDate: null, deliveredDate: null }),
      now,
    );
    const shipment = evaluateOrder(
      order({ orderStatus: "DISPATCHED", dispatchDate: null, expectedDeliveryDate: null, deliveredDate: null }),
      now,
    );
    expect(unconfirmed.tasks).toHaveLength(0);
    expect(unconfirmed.dataQuality.map((item) => item.code)).toContain("UNCONFIRMED_MISSING_ORDER_DATE");
    expect(dispatch.tasks).toHaveLength(0);
    expect(dispatch.dataQuality.map((item) => item.code)).toContain("DISPATCH_DELAY_MISSING_ORDER_DATE");
    expect(shipment.tasks).toHaveLength(0);
    expect(shipment.dataQuality.map((item) => item.code)).toContain("SHIPMENT_DELAY_MISSING_DATES");
  });

  it("does not flag delivered orders", () => {
    const byStatus = evaluateOrder(order({ orderStatus: "DELIVERED", orderValue: 9000 }), now);
    const byDate = evaluateOrder(
      order({
        orderStatus: "DISPATCHED",
        orderValue: 9000,
        deliveredDate: new Date(now.getTime() - hour),
        expectedDeliveryDate: new Date(now.getTime() - 2 * hour),
      }),
      now,
    );
    expect(byStatus.tasks).toHaveLength(0);
    expect(byStatus.dataQuality).toHaveLength(0);
    expect(byDate.tasks).toHaveLength(0);
  });

  it("can raise failed delivery, shipment delay, and high-value together", () => {
    const result = evaluateOrder(
      order({
        orderStatus: "FAILED_DELIVERY",
        orderValue: 8000,
        deliveredDate: null,
        expectedDeliveryDate: new Date(now.getTime() - hour),
      }),
      now,
    );
    expect(result.tasks.map((task) => task.category)).toEqual([
      "SHIPMENT_DELAY",
      "FAILED_DELIVERY",
      "HIGH_VALUE_OVERDUE",
    ]);
  });

  it("uses the live status employees set, and records missing timestamps as data corrections", () => {
    const shipped = evaluateOrder(
      order({
        orderStatus: "CONFIRMED",
        fulfillmentStatus: "shipped",
        deliveredDate: null,
        expectedDeliveryDate: new Date(now.getTime() - hour),
      }),
      now,
    );
    const missing = evaluateOrder(
      order({
        orderStatus: "DISPATCHED",
        fulfillmentStatus: "out_for_delivery",
        dispatchDate: null,
        expectedDeliveryDate: null,
        deliveredDate: null,
      }),
      now,
    );
    const closed = evaluateOrder(
      order({ orderStatus: "UNCONFIRMED", fulfillmentStatus: "paid", orderValue: 9000, deliveredDate: null }),
      now,
    );
    const cancelled = evaluateOrder(
      order({ fulfillmentStatus: "cancelled", orderStatus: "CONFIRMED", deliveredDate: null, orderValue: 9000 }),
      now,
    );

    expect(shipped.tasks.map((task) => task.category)).toEqual(["SHIPMENT_DELAY"]);
    expect(missing.tasks).toHaveLength(0);
    expect(missing.dataQuality.map((item) => item.code)).toEqual(["SHIPMENT_DELAY_MISSING_DATES"]);
    expect(closed.tasks).toHaveLength(0);
    expect(closed.dataQuality).toHaveLength(0);
    expect(cancelled.tasks).toHaveLength(0);
  });
});
