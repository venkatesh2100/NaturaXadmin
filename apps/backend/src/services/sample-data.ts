import { toCsv } from "../lib/csv.js";
import { HOUR_MS } from "./rules.js";
import type { OrderStatusName, PaymentTypeName } from "./validate-row.js";

export const SAMPLE_EMPLOYEES = ["Ananya Iyer", "Rohan Mehta", "Kavya Nair", "Dev Patel"] as const;

const NAMES = [
  "Meera Kulkarni",
  "Arjun Deshpande",
  "Sana Qureshi",
  "Nikhil Bhandari",
  "Pooja Menon",
  "Rahul Shenoy",
  "Aisha Fernandes",
  "Vikram Sethi",
  "Lakshmi Iyer",
  "Farhan Kapadia",
  "Diya Nambiar",
  "Harsh Vardhan",
  "Neelam Joshi",
  "Kabir Lalwani",
  "Tara Krishnan",
  "Imran Shaikh",
  "Revathi Pillai",
  "Aditya Gokhale",
  "Sneha Reddy",
  "Yusuf Merchant",
];

export type SampleOrder = {
  orderId: string;
  orderDate: Date;
  customerName: string;
  phone: string;
  orderValue: number;
  paymentType: PaymentTypeName;
  orderStatus: OrderStatusName;
  dispatchDate: Date | null;
  expectedDeliveryDate: Date | null;
  deliveredDate: Date | null;
  assignedEmployee: string | null;
};

export const SAMPLE_HEADERS = [
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
];

export function generateSampleOrders(now: Date): SampleOrder[] {
  const rows: SampleOrder[] = [];
  let sequence = 1000;

  const add = (input: Omit<SampleOrder, "orderId" | "customerName" | "phone" | "paymentType" | "assignedEmployee"> & Partial<SampleOrder>) => {
    const index = rows.length;
    sequence += 1;
    rows.push({
      orderId: input.orderId ?? `VN-${sequence}`,
      customerName: input.customerName ?? NAMES[index % NAMES.length]!,
      phone: input.phone ?? `9198${String(80000000 + sequence).slice(0, 8)}`,
      paymentType: input.paymentType ?? (index % 2 === 0 ? "PREPAID" : "COD"),
      assignedEmployee: input.assignedEmployee === undefined ? SAMPLE_EMPLOYEES[index % SAMPLE_EMPLOYEES.length]! : input.assignedEmployee,
      orderDate: input.orderDate,
      orderValue: input.orderValue,
      orderStatus: input.orderStatus,
      dispatchDate: input.dispatchDate,
      expectedDeliveryDate: input.expectedDeliveryDate,
      deliveredDate: input.deliveredDate,
    });
  };

  for (let i = 0; i < 40; i += 1) {
    const orderDate = hoursAgo(now, 24 * (8 + (i % 12)));
    const dispatchDate = new Date(orderDate.getTime() + 20 * HOUR_MS);
    const expectedDeliveryDate = new Date(dispatchDate.getTime() + 48 * HOUR_MS);
    const deliveredDate = new Date(expectedDeliveryDate.getTime() - 3 * HOUR_MS);
    add({
      orderDate,
      orderValue: 650 + i * 80,
      orderStatus: "DELIVERED",
      dispatchDate,
      expectedDeliveryDate,
      deliveredDate,
    });
  }

  for (let i = 0; i < 8; i += 1) {
    add({
      orderDate: new Date(now.getTime() - (20 + i * 8) * 60 * 1000),
      orderValue: 900 + i * 40,
      orderStatus: "UNCONFIRMED",
      dispatchDate: null,
      expectedDeliveryDate: new Date(now.getTime() + 3 * 24 * HOUR_MS),
      deliveredDate: null,
    });
  }

  for (let i = 0; i < 12; i += 1) {
    add({
      orderDate: hoursAgo(now, 3 + i),
      orderValue: 1100 + i * 50,
      orderStatus: "UNCONFIRMED",
      dispatchDate: null,
      expectedDeliveryDate: new Date(now.getTime() + 2 * 24 * HOUR_MS),
      deliveredDate: null,
    });
  }

  for (let i = 0; i < 6; i += 1) {
    add({
      orderDate: hoursAgo(now, 2 + i),
      orderValue: 1400 + i * 60,
      orderStatus: "CONFIRMED",
      dispatchDate: null,
      expectedDeliveryDate: new Date(now.getTime() + 4 * 24 * HOUR_MS),
      deliveredDate: null,
    });
  }

  for (let i = 0; i < 12; i += 1) {
    add({
      orderDate: hoursAgo(now, 25 + i),
      orderValue: 1600 + i * 70,
      orderStatus: "CONFIRMED",
      dispatchDate: null,
      expectedDeliveryDate: new Date(now.getTime() + 24 * HOUR_MS),
      deliveredDate: null,
      assignedEmployee: i === 11 ? null : undefined,
    });
  }

  for (let i = 0; i < 8; i += 1) {
    const orderDate = hoursAgo(now, 30 + i);
    add({
      orderDate,
      orderValue: 1800 + i * 40,
      orderStatus: "DISPATCHED",
      dispatchDate: new Date(orderDate.getTime() + 6 * HOUR_MS),
      expectedDeliveryDate: new Date(now.getTime() + (2 + i) * 24 * HOUR_MS),
      deliveredDate: null,
    });
  }

  for (let i = 0; i < 12; i += 1) {
    const orderDate = hoursAgo(now, 24 * 6);
    add({
      orderDate,
      orderValue: 2100 + i * 90,
      orderStatus: "DISPATCHED",
      dispatchDate: hoursAgo(now, 24 * 4),
      expectedDeliveryDate: hoursAgo(now, 24 + i),
      deliveredDate: null,
    });
  }

  for (let i = 0; i < 8; i += 1) {
    const orderDate = hoursAgo(now, 48);
    add({
      orderDate,
      orderValue: 1900 + i * 30,
      orderStatus: "FAILED_DELIVERY",
      dispatchDate: hoursAgo(now, 30),
      expectedDeliveryDate: new Date(now.getTime() + 24 * HOUR_MS),
      deliveredDate: null,
    });
  }

  for (let i = 0; i < 6; i += 1) {
    add({
      orderDate: hoursAgo(now, 24 * 7),
      orderValue: 7600 + i * 250,
      orderStatus: "FAILED_DELIVERY",
      dispatchDate: hoursAgo(now, 24 * 5),
      expectedDeliveryDate: hoursAgo(now, 24),
      deliveredDate: null,
    });
  }

  for (let i = 0; i < 8; i += 1) {
    add({
      orderDate: hoursAgo(now, 24 * 5),
      orderValue: 9100 + i * 300,
      orderStatus: "DISPATCHED",
      dispatchDate: hoursAgo(now, 24 * 3),
      expectedDeliveryDate: hoursAgo(now, 12 + i),
      deliveredDate: null,
    });
  }

  for (let i = 0; i < 5; i += 1) {
    const orderDate = hoursAgo(now, 24 * 9);
    const dispatchDate = new Date(orderDate.getTime() + 12 * HOUR_MS);
    const expectedDeliveryDate = new Date(dispatchDate.getTime() + 48 * HOUR_MS);
    add({
      orderDate,
      orderValue: 8200 + i * 100,
      orderStatus: "DELIVERED",
      dispatchDate,
      expectedDeliveryDate,
      deliveredDate: new Date(expectedDeliveryDate.getTime() - HOUR_MS),
    });
  }

  for (let i = 0; i < 4; i += 1) {
    add({
      orderDate: hoursAgo(now, 24 * 3),
      orderValue: 1300 + i * 20,
      orderStatus: "DISPATCHED",
      dispatchDate: null,
      expectedDeliveryDate: null,
      deliveredDate: null,
    });
  }

  for (let i = 0; i < 3; i += 1) {
    add({
      orderDate: hoursAgo(now, 50),
      orderValue: 6400 + i * 100,
      orderStatus: "CONFIRMED",
      dispatchDate: null,
      expectedDeliveryDate: null,
      deliveredDate: null,
    });
  }

  return rows;
}

export function sampleOrdersToCsv(orders: SampleOrder[]): string {
  return toCsv(
    SAMPLE_HEADERS,
    orders.map((order) => [
      order.orderId,
      order.orderDate.toISOString(),
      order.customerName,
      order.phone,
      order.orderValue.toFixed(2),
      order.paymentType,
      order.orderStatus,
      order.dispatchDate?.toISOString() ?? "",
      order.expectedDeliveryDate?.toISOString() ?? "",
      order.assignedEmployee ?? "",
      order.deliveredDate?.toISOString() ?? "",
    ]),
  );
}

export const INVALID_SAMPLE_CSV = `Order ID,Order date,Customer name,Phone number,Order value,Payment type,Order status,Dispatch date,Expected delivery date,Assigned employee,Delivered date
,2026-10-01T10:00:00.000Z,Missing Id,919800009001,1200,PREPAID,CONFIRMED,,,,
VN-BAD-DATE,yesterday,Bad Date,919800009002,1500,COD,UNCONFIRMED,,,,
VN-BAD-PAY,2026-10-01T10:00:00.000Z,Bad Pay,919800009003,1500,BITCOIN,CONFIRMED,,,,
VN-BAD-STATUS,2026-10-01T10:00:00.000Z,Bad Status,919800009004,1500,PREPAID,RETURNED,,,,
VN-BAD-VALUE,2026-10-01T10:00:00.000Z,Bad Value,919800009005,free,COD,CONFIRMED,,,,
VN-BAD-PHONE,2026-10-01T10:00:00.000Z,Bad Phone,123,900,PREPAID,CONFIRMED,,,,
VN-NO-NAME,2026-10-01T10:00:00.000Z,,919800009006,900,PREPAID,CONFIRMED,,,,
VN-DUP,2026-10-01T10:00:00.000Z,Dup One,919800009007,2200,PREPAID,DELIVERED,2026-10-02T10:00:00.000Z,2026-10-04T10:00:00.000Z,Ananya Iyer,2026-10-04T10:00:00.000Z
VN-DUP,2026-10-01T11:00:00.000Z,Dup Two,919800009008,2300,COD,DELIVERED,2026-10-02T10:00:00.000Z,2026-10-04T10:00:00.000Z,Rohan Mehta,2026-10-04T10:00:00.000Z
VN-NEG,2026-10-01T10:00:00.000Z,Negative Value,919800009009,-50,COD,CONFIRMED,,,,
VN-BAD-ISO,not-a-date,Invalid Date,919800009010,800,PREPAID,UNCONFIRMED,,,,
VN-EARLY-DISPATCH,2026-10-05T10:00:00.000Z,Early Dispatch,919800009011,800,PREPAID,DISPATCHED,2026-10-01T10:00:00.000Z,2026-10-06T10:00:00.000Z,Kavya Nair,
`;

function hoursAgo(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * HOUR_MS);
}
