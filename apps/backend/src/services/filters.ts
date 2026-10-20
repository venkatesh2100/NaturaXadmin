import type { Prisma, TaskCategory, TaskPriority, TaskStatus } from "../generated/prisma/client.js";

export type TaskFilters = {
  from?: Date;
  to?: Date;
  category?: TaskCategory;
  employeeId?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  search?: string;
};

export function taskWhere(filters: TaskFilters): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {};
  if (filters.category) where.category = filters.category;
  if (filters.priority) where.priority = filters.priority;
  if (filters.status) where.status = filters.status;
  if (filters.employeeId === "unassigned") where.assignedEmployeeId = null;
  else if (filters.employeeId) where.assignedEmployeeId = filters.employeeId;

  const order: Prisma.OrderWhereInput = {};
  if (filters.from || filters.to) {
    order.orderDate = {};
    if (filters.from) order.orderDate.gte = filters.from;
    if (filters.to) order.orderDate.lte = filters.to;
  }
  if (filters.search) {
    where.OR = [
      { reason: { contains: filters.search, mode: "insensitive" } },
      { order: { is: { orderId: { contains: filters.search, mode: "insensitive" } } } },
      { order: { is: { customerName: { contains: filters.search, mode: "insensitive" } } } },
      { order: { is: { phone: { contains: filters.search } } } },
    ];
  }
  if (order.orderDate) where.order = { is: order };
  return where;
}

export function taskOrderBy(
  sort: string,
  direction: "asc" | "desc",
): Prisma.TaskOrderByWithRelationInput {
  if (sort === "createdAt") return { createdAt: direction };
  if (sort === "priority") return { priority: direction };
  if (sort === "customer") return { order: { customerName: direction } };
  return { deadline: direction };
}
