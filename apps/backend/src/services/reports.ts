import { toCsv } from "../lib/csv.js";
import { startOfTodayIst } from "../lib/dates.js";
import { getPrisma } from "../lib/prisma.js";
import { taskWhere, type TaskFilters } from "./filters.js";

const taskInclude = {
  assignedEmployee: { select: { id: true, name: true, email: true } },
  order: true,
} as const;

export async function buildDailyReport(filters: TaskFilters, now = new Date()) {
  const prisma = getPrisma();
  const from = filters.from ?? startOfTodayIst(now);
  const to = filters.to ?? now;
  const base = taskWhere({ ...filters, from: undefined, to: undefined });
  const orderDate = taskWhere(filters);

  const [created, unresolved, overdue, highPriority] = await Promise.all([
    prisma.task.findMany({
      where: { AND: [orderDate, { createdAt: { gte: from, lte: to } }] },
      include: taskInclude,
      orderBy: { createdAt: "desc" },
    }),
    prisma.task.findMany({
      where: { AND: [base, { status: { not: "RESOLVED" } }] },
      include: taskInclude,
      orderBy: { deadline: "asc" },
    }),
    prisma.task.findMany({
      where: { AND: [base, { status: { not: "RESOLVED" }, deadline: { lt: now } }] },
      include: taskInclude,
      orderBy: { deadline: "asc" },
    }),
    prisma.task.findMany({
      where: { AND: [base, { priority: "HIGH", status: { not: "RESOLVED" } }] },
      include: taskInclude,
      orderBy: { deadline: "asc" },
    }),
  ]);

  const pendingByEmployee = new Map<string, number>();
  for (const task of unresolved) {
    const name = task.assignedEmployee?.name ?? "Open";
    pendingByEmployee.set(name, (pendingByEmployee.get(name) ?? 0) + 1);
  }

  return {
    generatedAt: now.toISOString(),
    range: { from: from.toISOString(), to: to.toISOString() },
    newExceptions: created.map(serializeReportTask),
    unresolved: unresolved.map(serializeReportTask),
    overdue: overdue.map(serializeReportTask),
    highPriority: highPriority.map(serializeReportTask),
    pendingByEmployee: [...pendingByEmployee.entries()].map(([employee, count]) => ({ employee, count })),
  };
}

export function reportToCsv(report: Awaited<ReturnType<typeof buildDailyReport>>): string {
  const headers = [
    "Section",
    "Order ID",
    "Customer",
    "Phone",
    "Category",
    "Reason",
    "Priority",
    "Employee",
    "Action",
    "Deadline",
    "Status",
    "Overdue",
  ];
  const rows: unknown[][] = [];
  const push = (section: string, tasks: ReturnType<typeof serializeReportTask>[]) => {
    for (const task of tasks) {
      rows.push([
        section,
        task.orderId,
        task.customerName,
        task.phone,
        task.category,
        task.reason,
        task.priority,
        task.employee,
        task.actionRequired,
        task.deadline,
        task.status,
        task.overdue ? "yes" : "no",
      ]);
    }
  };
  push("New exceptions", report.newExceptions);
  push("Unresolved", report.unresolved);
  push("Overdue", report.overdue);
  push("High priority", report.highPriority);
  for (const item of report.pendingByEmployee) {
    rows.push(["Employee pending", "", "", "", "", "", "", item.employee, `${item.count} pending`, "", "", ""]);
  }
  return toCsv(headers, rows);
}

function serializeReportTask(task: {
  category: string;
  reason: string;
  priority: string;
  actionRequired: string;
  deadline: Date;
  status: string;
  assignedEmployee: { name: string } | null;
  order: { orderId: string; customerName: string; phone: string };
}) {
  return {
    orderId: task.order.orderId,
    customerName: task.order.customerName,
    phone: task.order.phone,
    category: task.category,
    reason: task.reason,
    priority: task.priority,
    employee: task.assignedEmployee?.name ?? "Open",
    actionRequired: task.actionRequired,
    deadline: task.deadline.toISOString(),
    status: task.status,
    overdue: task.status !== "RESOLVED" && task.deadline.getTime() < Date.now(),
  };
}
