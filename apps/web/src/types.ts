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

export type Metrics = {
  totalOrders: number;
  ordersRequiringAttention: number;
  openTasks: number;
  overdueTasks: number;
  highPriority: number;
  dataQuality: number;
  byCategory?: { category: Category; count: number }[];
  pendingByEmployee: { employeeId: string | null; employee: string; count: number }[];
  recentActivity: { id: string; performedBy: string; summary: string; createdAt: string }[];
};

export const CATEGORY_LABELS: Record<Category, string> = {
  UNCONFIRMED: "Unconfirmed",
  DISPATCH_DELAY: "Dispatch delay",
  SHIPMENT_DELAY: "Shipment delay",
  FAILED_DELIVERY: "Failed delivery",
  HIGH_VALUE_OVERDUE: "High-value overdue",
};

export const CATEGORY_HELP: Record<Category, string> = {
  UNCONFIRMED: "Still pending more than 2 hours after the order was placed.",
  DISPATCH_DELAY: "Confirmed, but not dispatched within 24 hours.",
  SHIPMENT_DELAY: "Expected delivery date has passed and it is not delivered.",
  FAILED_DELIVERY: "A delivery attempt failed and needs a reattempt.",
  HIGH_VALUE_OVERDUE: "Above ₹5,000 and still undelivered past the expected date.",
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
};

export const STATUS_HELP: Record<TaskStatus, string> = {
  OPEN: "Nobody has started it yet.",
  IN_PROGRESS: "Someone is working on it.",
  RESOLVED: "Finished. It leaves the active queue.",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const PRIORITY_HELP: Record<Priority, string> = {
  HIGH: "Act this shift. Deadline is 2 hours after the task is created.",
  MEDIUM: "Check courier tracking. Deadline is 8 hours after the task is created.",
  LOW: "Reserved. No current rule creates a low-priority task. Deadline would be 24 hours.",
};
