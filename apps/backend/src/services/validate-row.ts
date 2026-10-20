import { parseFlexibleDate } from "../lib/dates.js";
import type { FulfillmentName, OrderStatusName } from "./rules.js";

export const ORDER_STATUSES = [
  "UNCONFIRMED",
  "CONFIRMED",
  "DISPATCHED",
  "DELIVERED",
  "FAILED_DELIVERY",
] as const;

export type { OrderStatusName };
export type PaymentTypeName = "PREPAID" | "COD";

const STATUS_FROM_FILE: Record<string, { orderStatus: OrderStatusName; fulfillmentStatus: FulfillmentName }> = {
  UNCONFIRMED: { orderStatus: "UNCONFIRMED", fulfillmentStatus: "pending" },
  PENDING: { orderStatus: "UNCONFIRMED", fulfillmentStatus: "pending" },
  CONFIRMED: { orderStatus: "CONFIRMED", fulfillmentStatus: "confirmed" },
  DISPATCHED: { orderStatus: "DISPATCHED", fulfillmentStatus: "shipped" },
  SHIPPED: { orderStatus: "DISPATCHED", fulfillmentStatus: "shipped" },
  OUT_FOR_DELIVERY: { orderStatus: "DISPATCHED", fulfillmentStatus: "out_for_delivery" },
  DELIVERED: { orderStatus: "DELIVERED", fulfillmentStatus: "delivered" },
  FAILED_DELIVERY: { orderStatus: "FAILED_DELIVERY", fulfillmentStatus: "failed" },
  FAILED: { orderStatus: "FAILED_DELIVERY", fulfillmentStatus: "failed" },
  CANCELLED: { orderStatus: "DELIVERED", fulfillmentStatus: "cancelled" },
  CANCELED: { orderStatus: "DELIVERED", fulfillmentStatus: "cancelled" },
  PAID: { orderStatus: "DELIVERED", fulfillmentStatus: "paid" },
};

export type ValidOrder = {
  rowNumber: number;
  orderId: string;
  orderDate: Date;
  customerName: string;
  phone: string;
  orderValue: number;
  paymentType: PaymentTypeName;
  orderStatus: OrderStatusName;
  fulfillmentStatus: FulfillmentName;
  dispatchDate: Date | null;
  expectedDeliveryDate: Date | null;
  deliveredDate: Date | null;
  assignedEmployee: string | null;
  raw: Record<string, string>;
};

export type RowIssue = {
  rowNumber: number;
  orderId: string | null;
  field: string | null;
  message: string;
  severity: "ERROR" | "WARNING";
  raw: Record<string, string>;
};

const HEADER_ALIASES: Record<string, string> = {
  "order id": "orderId",
  orderid: "orderId",
  order_id: "orderId",
  "order date": "orderDate",
  orderdate: "orderDate",
  "customer name": "customerName",
  customer: "customerName",
  "phone number": "phone",
  phone: "phone",
  mobile: "phone",
  "order value": "orderValue",
  value: "orderValue",
  amount: "orderValue",
  "payment type": "paymentType",
  payment: "paymentType",
  "order status": "orderStatus",
  status: "orderStatus",
  "dispatch date": "dispatchDate",
  "expected delivery date": "expectedDeliveryDate",
  "expected delivery": "expectedDeliveryDate",
  "assigned employee": "assignedEmployee",
  employee: "assignedEmployee",
  "delivered date": "deliveredDate",
};

const REQUIRED_COLUMNS = [
  "orderId",
  "orderDate",
  "customerName",
  "phone",
  "orderValue",
  "paymentType",
  "orderStatus",
] as const;

export function normalizeHeader(header: string): string | null {
  const key = header.trim().toLowerCase().replace(/[*]+/g, "").replace(/\s+/g, " ");
  return HEADER_ALIASES[key] ?? null;
}

export function mapHeaders(headers: string[]): { canonical: Map<string, string>; missing: string[] } {
  const canonical = new Map<string, string>();
  for (const header of headers) {
    const mapped = normalizeHeader(header);
    if (mapped && !canonical.has(mapped)) canonical.set(mapped, header);
  }
  const missing = REQUIRED_COLUMNS.filter((column) => !canonical.has(column));
  return { canonical, missing };
}

function cell(raw: Record<string, string>, canonical: Map<string, string>, key: string): string {
  const header = canonical.get(key);
  if (!header) return "";
  return (raw[header] ?? "").trim();
}

export function normalizePhone(value: string): string | null {
  const compact = value.replace(/[\s()-]/g, "");
  if (!/^\+?[0-9]{10,15}$/.test(compact)) return null;
  return compact;
}

export function parseMoney(value: string): number | null {
  const cleaned = value.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return null;
  return amount;
}

export function interpretStatus(value: string): { orderStatus: OrderStatusName; fulfillmentStatus: FulfillmentName } | null {
  const key = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return STATUS_FROM_FILE[key] ?? null;
}

export function normalizeStatus(value: string): OrderStatusName | null {
  return interpretStatus(value)?.orderStatus ?? null;
}

export function normalizePayment(value: string): PaymentTypeName | null {
  const key = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (key === "PREPAID" || key === "PRE_PAID") return "PREPAID";
  if (key === "COD" || key === "CASH_ON_DELIVERY") return "COD";
  return null;
}

export function validateMappedRows(
  rows: Array<{ rowNumber: number; raw: Record<string, string> }>,
  canonical: Map<string, string>,
): { valid: ValidOrder[]; issues: RowIssue[] } {
  const issues: RowIssue[] = [];
  const candidates: ValidOrder[] = [];

  for (const row of rows) {
    const rowIssues: RowIssue[] = [];
    const orderIdRaw = cell(row.raw, canonical, "orderId");
    const orderId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(orderIdRaw) ? orderIdRaw : "";
    if (!orderId) {
      rowIssues.push(issue(row, orderIdRaw || null, "orderId", "Order ID is missing or uses unsupported characters."));
    }

    const orderDate = readDate(row, canonical, "orderDate", true, rowIssues, orderId || null);
    const customerName = cell(row.raw, canonical, "customerName");
    if (!/^[\p{L}][\p{L} .'-]{0,119}$/u.test(customerName)) {
      rowIssues.push(issue(row, orderId || null, "customerName", "Customer name is missing or invalid."));
    }
    const phone = normalizePhone(cell(row.raw, canonical, "phone"));
    if (!phone) rowIssues.push(issue(row, orderId || null, "phone", "Phone number must contain 10 to 15 digits."));
    const orderValue = parseMoney(cell(row.raw, canonical, "orderValue"));
    if (orderValue == null) {
      rowIssues.push(issue(row, orderId || null, "orderValue", "Order value must be a positive amount."));
    }
    const paymentType = normalizePayment(cell(row.raw, canonical, "paymentType"));
    if (!paymentType) {
      rowIssues.push(issue(row, orderId || null, "paymentType", "Payment type must be PREPAID or COD."));
    }
    const interpreted = interpretStatus(cell(row.raw, canonical, "orderStatus"));
    if (!interpreted) {
      rowIssues.push(
        issue(
          row,
          orderId || null,
          "orderStatus",
          "Order status must be pending, confirmed, shipped, out for delivery, delivered, cancelled, failed, or paid.",
        ),
      );
    }

    const dispatchDate = readDate(row, canonical, "dispatchDate", false, rowIssues, orderId || null);
    const expectedDeliveryDate = readDate(row, canonical, "expectedDeliveryDate", false, rowIssues, orderId || null);
    const deliveredDate = readDate(row, canonical, "deliveredDate", false, rowIssues, orderId || null);
    const assignedRaw = cell(row.raw, canonical, "assignedEmployee");
    const assignedEmployee = assignedRaw ? assignedRaw.slice(0, 120) : null;

    if (orderDate && dispatchDate && dispatchDate.getTime() < orderDate.getTime()) {
      rowIssues.push(issue(row, orderId || null, "dispatchDate", "Dispatch date is before the order date."));
    }
    if (orderDate && expectedDeliveryDate && expectedDeliveryDate.getTime() < orderDate.getTime()) {
      rowIssues.push(
        issue(row, orderId || null, "expectedDeliveryDate", "Expected delivery date is before the order date."),
      );
    }
    if (orderDate && deliveredDate && deliveredDate.getTime() < orderDate.getTime()) {
      rowIssues.push(issue(row, orderId || null, "deliveredDate", "Delivered date is before the order date."));
    }

    issues.push(...rowIssues);
    if (
      rowIssues.length === 0 &&
      orderId &&
      orderDate &&
      phone &&
      orderValue != null &&
      paymentType &&
      interpreted
    ) {
      candidates.push({
        rowNumber: row.rowNumber,
        orderId,
        orderDate,
        customerName,
        phone,
        orderValue,
        paymentType,
        orderStatus: interpreted.orderStatus,
        fulfillmentStatus: interpreted.fulfillmentStatus,
        dispatchDate,
        expectedDeliveryDate,
        deliveredDate,
        assignedEmployee,
        raw: row.raw,
      });
    }
  }

  const counts = new Map<string, number>();
  for (const row of candidates) counts.set(row.orderId, (counts.get(row.orderId) ?? 0) + 1);
  const valid: ValidOrder[] = [];
  for (const row of candidates) {
    if ((counts.get(row.orderId) ?? 0) > 1) {
      issues.push(
        issue(
          { rowNumber: row.rowNumber, raw: row.raw },
          row.orderId,
          "orderId",
          "Order ID is duplicated in this file. Duplicate rows were not imported.",
        ),
      );
      continue;
    }
    valid.push(row);
  }

  issues.sort((a, b) => a.rowNumber - b.rowNumber || a.field?.localeCompare(b.field ?? "") || 0);
  return { valid, issues };
}

function readDate(
  row: { rowNumber: number; raw: Record<string, string> },
  canonical: Map<string, string>,
  key: string,
  required: boolean,
  issues: RowIssue[],
  orderId: string | null,
): Date | null {
  const text = cell(row.raw, canonical, key);
  if (!text && !required) return null;
  const parsed = parseFlexibleDate(text, { required });
  if (parsed === "invalid") {
    issues.push(issue(row, orderId, key, required ? `${label(key)} is missing or invalid.` : `${label(key)} is invalid.`));
    return null;
  }
  return parsed;
}

function label(key: string): string {
  return key.replace(/[A-Z]/g, (char) => ` ${char.toLowerCase()}`).replace(/^./, (char) => char.toUpperCase());
}

function issue(
  row: { rowNumber: number; raw: Record<string, string> },
  orderId: string | null,
  field: string | null,
  message: string,
): RowIssue {
  return { rowNumber: row.rowNumber, orderId, field, message, severity: "ERROR", raw: row.raw };
}
