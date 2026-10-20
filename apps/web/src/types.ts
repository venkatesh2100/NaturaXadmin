export type Role = "ADMIN" | "STAFF";
export type Priority = "HIGH" | "MEDIUM" | "LOW";
export type TaskStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";
export type Category =
  | "UNCONFIRMED"
  | "DISPATCH_DELAY"
  | "SHIPMENT_DELAY"
  | "FAILED_DELIVERY"
  | "HIGH_VALUE_OVERDUE";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
};

export type Employee = { id: string; name: string; email: string } | null;

export const ORDER_STATUS_OPTIONS = [
  "pending",
  "confirmed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "failed",
  "paid",
] as const;

export type OrderProgress = (typeof ORDER_STATUS_OPTIONS)[number];

export type Order = {
  id: string;
  orderId: string;
  orderDate: string;
  customerName: string;
  phone: string;
  orderValue: number;
  paymentType: "PREPAID" | "COD";
  orderStatus: string;
  fulfillmentStatus: OrderProgress;
  dispatchDate: string | null;
  expectedDeliveryDate: string | null;
  deliveredDate: string | null;
  assignedEmployee: Employee;
};

export type Task = {
  id: string;
  category: Category;
  reason: string;
  priority: Priority;
  actionRequired: string;
  deadline: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  overdue: boolean;
  assignedEmployee: Employee;
  order: Order;
};

export type Page<T> = { data: T[]; meta: { page: number; pageSize: number; total: number } };

export const CATEGORY_LABELS: Record<Category, string> = {
  UNCONFIRMED: "Unconfirmed",
  DISPATCH_DELAY: "Dispatch delay",
  SHIPMENT_DELAY: "Shipment delay",
  FAILED_DELIVERY: "Failed delivery",
  HIGH_VALUE_OVERDUE: "High-value overdue",
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
};
