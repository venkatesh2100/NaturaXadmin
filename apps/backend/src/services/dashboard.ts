import type { Prisma } from "../generated/prisma/client.js";
import { getPrisma } from "../lib/prisma.js";
import { taskWhere, type TaskFilters } from "./filters.js";

export async function dashboardMetrics(filters: TaskFilters, now = new Date()) {
  const prisma = getPrisma();
  const where = taskWhere(filters);
  const openStatus: Prisma.TaskWhereInput = filters.status
    ? { status: filters.status }
    : { status: { in: ["OPEN", "IN_PROGRESS"] } };
  const unresolvedStatus: Prisma.TaskWhereInput = filters.status
    ? { status: filters.status }
    : { status: { not: "RESOLVED" } };
  const openWhere: Prisma.TaskWhereInput = { AND: [where, openStatus] };
  const overdueWhere: Prisma.TaskWhereInput =
    filters.status === "RESOLVED"
      ? { id: { in: [] } }
      : { AND: [where, { deadline: { lt: now } }, unresolvedStatus] };

  const orderWhere = {
    ...(filters.from || filters.to
      ? { orderDate: { gte: filters.from, lte: filters.to } }
      : {}),
    ...(filters.employeeId === "unassigned"
      ? { assignedEmployeeId: null }
      : filters.employeeId
        ? { assignedEmployeeId: filters.employeeId }
        : {}),
  };

  const [totalOrders, openTasks, overdueTasks, highPriority, categoryGroups, employeeGroups, attention, recent, dataQuality] =
    await Promise.all([
      prisma.order.count({ where: orderWhere }),
      prisma.task.count({ where: openWhere }),
      prisma.task.count({ where: overdueWhere }),
      prisma.task.count({
        where: {
          AND: [where, { priority: "HIGH" }, { status: filters.status ?? { not: "RESOLVED" } }],
        },
      }),
      prisma.task.groupBy({ by: ["category"], where, _count: { _all: true } }),
      prisma.task.groupBy({
        by: ["assignedEmployeeId"],
        where: { AND: [where, { status: { in: ["OPEN", "IN_PROGRESS"] } }] },
        _count: { _all: true },
      }),
      prisma.task.findMany({
        where: { AND: [where, { status: { in: ["OPEN", "IN_PROGRESS"] } }] },
        distinct: ["orderId"],
        select: { orderId: true },
      }),
      prisma.auditLog.findMany({
        where: filters.employeeId && filters.employeeId !== "unassigned"
          ? { task: { is: { assignedEmployeeId: filters.employeeId } } }
          : undefined,
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          performedBy: { select: { id: true, name: true } },
          order: { select: { orderId: true } },
        },
      }),
      prisma.dataQualityIssue.count({
        where: filters.employeeId && filters.employeeId !== "unassigned"
          ? { order: { assignedEmployeeId: filters.employeeId } }
          : undefined,
      }),
    ]);

  const employees = await prisma.user.findMany({
    where: { id: { in: employeeGroups.flatMap((group) => (group.assignedEmployeeId ? [group.assignedEmployeeId] : [])) } },
    select: { id: true, name: true },
  });
  const names = new Map(employees.map((employee) => [employee.id, employee.name]));

  return {
    totalOrders,
    ordersRequiringAttention: attention.length,
    openTasks,
    overdueTasks,
    highPriority,
    dataQuality,
    byCategory: categoryGroups.map((group) => ({ category: group.category, count: group._count._all })),
    pendingByEmployee: employeeGroups.map((group) => ({
      employeeId: group.assignedEmployeeId,
      employee: group.assignedEmployeeId ? names.get(group.assignedEmployeeId) ?? "Unknown" : "Unassigned",
      count: group._count._all,
    })),
    recentActivity: recent.map((entry) => ({
      id: entry.id,
      action: entry.action,
      orderId: entry.order.orderId,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      performedBy: entry.performedBy?.name ?? "System",
      summary: describeActivity(entry),
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

function describeActivity(entry: {
  action: string;
  newValue: string | null;
  order: { orderId: string };
}): string {
  const orderId = entry.order.orderId;
  if (entry.action === "ORDER_STATUS_UPDATED") {
    return `updated ${orderId} to ${pretty(entry.newValue)}`;
  }
  if (entry.action === "CLAIMED") {
    return `picked ${orderId}`;
  }
  if (entry.action === "REASSIGNED") {
    const name = assignedName(entry.newValue);
    return name ? `assigned ${orderId} to ${name}` : `unassigned ${orderId}`;
  }
  if (entry.action === "STATUS_CHANGED") {
    return `marked ${orderId} ${pretty(entry.newValue)}`;
  }
  return `${entry.action.replaceAll("_", " ").toLowerCase()} ${orderId}`;
}

function pretty(value: string | null): string {
  if (!value) return "unknown";
  return value.replaceAll("_", " ").toLowerCase();
}

function assignedName(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { name?: string | null };
    return parsed.name ?? null;
  } catch {
    return null;
  }
}
