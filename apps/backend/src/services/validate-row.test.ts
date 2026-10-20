import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseOrderFile } from "./parse-file.js";
import { INVALID_SAMPLE_CSV, generateSampleOrders, sampleOrdersToCsv } from "./sample-data.js";
import { evaluateOrder } from "./rules.js";

describe("order file validation", () => {
  it("rejects invalid rows and ambiguous duplicate order IDs", async () => {
    const parsed = await parseOrderFile("sample-invalid.csv", Buffer.from(INVALID_SAMPLE_CSV));
    const messages = parsed.issues.map((issue) => `${issue.orderId ?? ""}:${issue.field}:${issue.message}`);
    expect(parsed.valid).toHaveLength(0);
    expect(messages.some((message) => message.includes("Order ID is missing"))).toBe(true);
    expect(messages.some((message) => message.includes("orderDate") && message.includes("invalid"))).toBe(true);
    expect(messages.some((message) => message.includes("Payment type"))).toBe(true);
    expect(messages.some((message) => message.includes("Order status"))).toBe(true);
    expect(messages.some((message) => message.includes("Order value"))).toBe(true);
    expect(messages.some((message) => message.includes("Phone"))).toBe(true);
    expect(messages.some((message) => message.includes("Customer name"))).toBe(true);
    expect(messages.filter((message) => message.includes("duplicated"))).toHaveLength(2);
    expect(messages.some((message) => message.includes("Dispatch date is before"))).toBe(true);
  });

  it("accepts a valid CSV export of the sample orders", async () => {
    const orders = generateSampleOrders(new Date("2026-10-20T12:00:00.000Z"));
    const parsed = await parseOrderFile("sample-orders.csv", Buffer.from(sampleOrdersToCsv(orders)));
    expect(parsed.missingColumns).toEqual([]);
    expect(parsed.issues.filter((issue) => issue.severity === "ERROR")).toHaveLength(0);
    expect(parsed.valid).toHaveLength(orders.length);
  });

  it("reads a valid xlsx workbook", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Orders");
    sheet.addRow([
      "Order ID",
      "Order date",
      "Customer name",
      "Phone number",
      "Order value",
      "Payment type",
      "Order status",
      "Dispatch date",
      "Expected delivery date",
      "Assigned employee",
      "Delivered date",
    ]);
    sheet.addRow([
      "VN-XLSX-1",
      "2026-10-01T10:00:00.000Z",
      "Meera Kulkarni",
      "919800001111",
      1500,
      "PREPAID",
      "DELIVERED",
      "2026-10-02T10:00:00.000Z",
      "2026-10-04T10:00:00.000Z",
      "Ananya Iyer",
      "2026-10-04T08:00:00.000Z",
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await parseOrderFile("orders.xlsx", buffer);
    expect(parsed.valid).toHaveLength(1);
    expect(parsed.valid[0]?.orderId).toBe("VN-XLSX-1");
  });
});

describe("sample dataset", () => {
  it("contains at least 120 orders and every required exception", () => {
    const now = new Date("2026-10-20T12:00:00.000Z");
    const orders = generateSampleOrders(now);
    expect(orders.length).toBeGreaterThanOrEqual(120);
    const categories = new Set<string>();
    let dataQuality = 0;
    for (const row of orders) {
      const result = evaluateOrder(
        {
          orderStatus: row.orderStatus,
          orderDate: row.orderDate,
          orderValue: row.orderValue,
          dispatchDate: row.dispatchDate,
          expectedDeliveryDate: row.expectedDeliveryDate,
          deliveredDate: row.deliveredDate,
        },
        now,
      );
      for (const task of result.tasks) categories.add(task.category);
      dataQuality += result.dataQuality.length;
    }
    expect([...categories].sort()).toEqual([
      "DISPATCH_DELAY",
      "FAILED_DELIVERY",
      "HIGH_VALUE_OVERDUE",
      "SHIPMENT_DELAY",
      "UNCONFIRMED",
    ]);
    expect(dataQuality).toBeGreaterThan(0);
    expect(new Set(orders.map((order) => order.orderId)).size).toBe(orders.length);
  });
});
