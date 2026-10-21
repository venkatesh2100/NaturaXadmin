import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "./lib/errors.js";
import type { TaskFilters } from "./services/filters.js";

export function asyncRoute(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const filterSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category: z.enum(["UNCONFIRMED", "DISPATCH_DELAY", "SHIPMENT_DELAY", "FAILED_DELIVERY", "HIGH_VALUE_OVERDUE"]).optional(),
  employeeId: z.string().optional(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).optional(),
  search: z.string().max(120).optional(),
  sort: z.enum(["deadline", "priority", "createdAt", "customer"]).default("priority"),
  order: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
});

export function parseFilters(query: Request["query"]): TaskFilters & {
  sort: "deadline" | "priority" | "createdAt" | "customer";
  order: "asc" | "desc";
  page?: number;
  pageSize?: number;
} {
  const parsed = filterSchema.parse(query);
  return {
    from: parseBound(parsed.from, "from"),
    to: parseBound(parsed.to, "to"),
    category: parsed.category,
    employeeId: parsed.employeeId || undefined,
    priority: parsed.priority,
    status: parsed.status,
    search: parsed.search?.trim() || undefined,
    sort: parsed.sort,
    order: parsed.order,
    page: parsed.page,
    pageSize: parsed.pageSize,
  };
}

function parseBound(value: string | undefined, field: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, "VALIDATION_ERROR", `${field} is not a valid date.`);
  }
  return date;
}

type OrderRow = {
  id: string;
  orderId: string;
  orderDate: Date;
  customerName: string;
  phone: string;
  orderValue: { toString(): string } | number | string;
  paymentType: string;
  orderStatus: string;
  fulfillmentStatus?: string;
  dispatchDate: Date | null;
  expectedDeliveryDate: Date | null;
  deliveredDate: Date | null;
  assignedEmployee?: { id: string; name: string; email: string } | null;
};

export function serializeOrder(order: OrderRow) {
  return {
    id: order.id,
    orderId: order.orderId,
    orderDate: order.orderDate.toISOString(),
    customerName: order.customerName,
    phone: order.phone,
    orderValue: Number(order.orderValue),
    paymentType: order.paymentType,
    orderStatus: order.orderStatus,
    fulfillmentStatus: order.fulfillmentStatus ?? "pending",
    dispatchDate: order.dispatchDate?.toISOString() ?? null,
    expectedDeliveryDate: order.expectedDeliveryDate?.toISOString() ?? null,
    deliveredDate: order.deliveredDate?.toISOString() ?? null,
    assignedEmployee: order.assignedEmployee
      ? { id: order.assignedEmployee.id, name: order.assignedEmployee.name, email: order.assignedEmployee.email }
      : null,
  };
}

type TaskRow = {
  id: string;
  category: string;
  reason: string;
  priority: string;
  actionRequired: string;
  deadline: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  assignedEmployee: { id: string; name: string; email: string } | null;
  order: OrderRow;
};

export function serializeTask(task: TaskRow, now = new Date()) {
  return {
    id: task.id,
    category: task.category,
    reason: task.reason,
    priority: task.priority,
    actionRequired: task.actionRequired,
    deadline: task.deadline.toISOString(),
    status: task.status,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    resolvedAt: task.resolvedAt?.toISOString() ?? null,
    overdue: task.status !== "RESOLVED" && task.deadline.getTime() < now.getTime(),
    assignedEmployee: task.assignedEmployee
      ? { id: task.assignedEmployee.id, name: task.assignedEmployee.name, email: task.assignedEmployee.email }
      : null,
    order: serializeOrder(task.order),
  };
}

export function publicUser(user: { id: string; name: string; email: string; role: string; createdAt: Date }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}
