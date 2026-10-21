import type { Prisma } from "../generated/prisma/client.js";
import { getPrisma } from "../lib/prisma.js";
import { safeFilename } from "../lib/csv.js";
import { deadlineFor, evaluateOrder } from "./rules.js";
import { parseOrderFile } from "./parse-file.js";
import { planTaskSync } from "./task-sync.js";
import { log } from "../logger.js";
import { isUniqueViolation, notifyTaskEvents } from "./notifications.js";
import type { RowIssue, ValidOrder } from "./validate-row.js";

export type ImportSummary = {
  batchId: string;
  filename: string;
  totalRows: number;
  successfulRows: number;
  rejectedRows: number;
  warningCount: number;
  tasksCreated: number;
  issues: RowIssue[];
};

export async function importOrders(input: {
  filename: string;
  buffer: Buffer;
  userId: string;
  now?: Date;
}): Promise<ImportSummary> {
  const started = Date.now();
  const now = input.now ?? new Date();
  const filename = safeFilename(input.filename);
  log("info", "import started", { filename, bytes: input.buffer.length });
  const parsed = await parseOrderFile(filename, input.buffer);
  const prisma = getPrisma();
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
  const issues = [...parsed.issues];

  if (parsed.missingColumns.length > 0) {
    issues.push({
      rowNumber: 1,
      orderId: null,
      field: "headers",
      message: `Missing required columns: ${parsed.missingColumns.join(", ")}.`,
      severity: "ERROR",
      raw: {},
    });
  }

  const prepared = parsed.missingColumns.length
    ? []
    : parsed.valid.map((row) => {
        const match = matchEmployee(users, row.assignedEmployee);
        if (match.warning) {
          issues.push({
            rowNumber: row.rowNumber,
            orderId: row.orderId,
            field: "assignedEmployee",
            message: match.warning,
            severity: "WARNING",
            raw: row.raw,
          });
        }
        return { row, employeeId: match.id };
      });

  const existing = prepared.length
    ? await prisma.order.findMany({
        where: { orderId: { in: prepared.map((item) => item.row.orderId) } },
        select: { orderId: true },
      })
    : [];
  const existingIds = new Set(existing.map((order) => order.orderId));
  const fresh = prepared.filter((item) => {
    if (!existingIds.has(item.row.orderId)) return true;
    issues.push({
      rowNumber: item.row.rowNumber,
      orderId: item.row.orderId,
      field: "orderId",
      message: "This order already exists. Duplicate orders were not imported.",
      severity: "ERROR",
      raw: item.row.raw,
    });
    return false;
  });

  const errorRows = new Set(issues.filter((issue) => issue.severity === "ERROR").map((issue) => issue.rowNumber));
  const rejectedRows = parsed.missingColumns.length > 0 ? parsed.totalRows : errorRows.size;
  log("info", "import checked", {
    filename,
    totalRows: parsed.totalRows,
    ready: fresh.length,
    rejected: rejectedRows,
    duplicates: prepared.length - fresh.length,
  });

  const createdTaskIds: string[] = [];
  const batch = await prisma.$transaction(
    async (tx) => {
      const createdBatch = await tx.importBatch.create({
        data: {
          filename,
          totalRows: parsed.totalRows,
          successfulRows: fresh.length,
          rejectedRows,
          createdById: input.userId,
        },
      });
      createdTaskIds.push(...(await writeFreshOrders(tx, fresh, createdBatch.id, now)));
      if (issues.length > 0) {
        await tx.importIssue.createMany({
          data: issues.map((issue) => ({
            importBatchId: createdBatch.id,
            rowNumber: issue.rowNumber,
            orderId: issue.orderId,
            field: issue.field,
            message: issue.message,
            severity: issue.severity,
            raw: issue.raw,
          })),
        });
      }
      return createdBatch;
    },
    { timeout: 60_000 },
  );

  void notifyTaskEvents(createdTaskIds, "created");
  log("info", "import finished", {
    filename,
    batchId: batch.id,
    imported: fresh.length,
    rejected: rejectedRows,
    tasks: createdTaskIds.length,
    ms: Date.now() - started,
  });

  return {
    batchId: batch.id,
    filename,
    totalRows: parsed.totalRows,
    successfulRows: fresh.length,
    rejectedRows,
    warningCount: issues.filter((issue) => issue.severity === "WARNING").length,
    tasksCreated: createdTaskIds.length,
    issues: issues.slice(0, 300),
  };
}

async function writeFreshOrders(
  tx: Prisma.TransactionClient,
  fresh: Array<{ row: ValidOrder; employeeId: string | null }>,
  importBatchId: string,
  now: Date,
): Promise<string[]> {
  if (fresh.length === 0) return [];
  const orders = await tx.order.createManyAndReturn({
    data: fresh.map((item) => ({
      orderId: item.row.orderId,
      orderDate: item.row.orderDate,
      customerName: item.row.customerName,
      phone: item.row.phone,
      orderValue: item.row.orderValue.toFixed(2),
      paymentType: item.row.paymentType,
      orderStatus: item.row.orderStatus,
      fulfillmentStatus: item.row.fulfillmentStatus,
      dispatchDate: item.row.dispatchDate,
      expectedDeliveryDate: item.row.expectedDeliveryDate,
      deliveredDate: item.row.deliveredDate,
      assignedEmployeeId: item.employeeId,
      importBatchId,
    })),
  });
  const saved = new Map(orders.map((order) => [order.orderId, order]));
  const tasks: Prisma.TaskCreateManyInput[] = [];
  const quality: Prisma.DataQualityIssueCreateManyInput[] = [];
  for (const item of fresh) {
    const order = saved.get(item.row.orderId);
    if (!order) continue;
    const evaluation = evaluateOrder(
      {
        orderStatus: item.row.orderStatus,
        fulfillmentStatus: item.row.fulfillmentStatus,
        orderDate: item.row.orderDate,
        orderValue: item.row.orderValue,
        dispatchDate: item.row.dispatchDate,
        expectedDeliveryDate: item.row.expectedDeliveryDate,
        deliveredDate: item.row.deliveredDate,
      },
      now,
    );
    for (const hit of evaluation.tasks) {
      tasks.push({
        orderId: order.id,
        category: hit.category,
        reason: hit.reason,
        priority: hit.priority,
        actionRequired: hit.actionRequired,
        deadline: deadlineFor(hit.priority, now),
        assignedEmployeeId: item.employeeId,
        status: "OPEN",
      });
    }
    for (const finding of evaluation.dataQuality) {
      quality.push({ orderId: order.id, code: finding.code, message: finding.message });
    }
  }
  const created = tasks.length
    ? await tx.task.createManyAndReturn({
        data: tasks,
        select: { id: true, orderId: true, category: true, priority: true },
      })
    : [];
  if (created.length > 0) {
    await tx.auditLog.createMany({
      data: created.map((task) => ({
        taskId: task.id,
        orderId: task.orderId,
        action: "TASK_CREATED" as const,
        newValue: JSON.stringify({ category: task.category, priority: task.priority }),
      })),
    });
  }
  if (quality.length > 0) await tx.dataQualityIssue.createMany({ data: quality });
  return created.map((task) => task.id);
}

function matchEmployee(
  users: Array<{ id: string; name: string; email: string }>,
  assigned: string | null,
): { id: string | null; warning: string | null } {
  if (!assigned) return { id: null, warning: null };
  const needle = assigned.trim().toLowerCase();
  const match = users.find((user) => user.email.toLowerCase() === needle || user.name.toLowerCase() === needle);
  if (!match) {
    return { id: null, warning: `No employee matches "${assigned}". The order was imported unassigned.` };
  }
  return { id: match.id, warning: null };
}

export function scheduleReevaluate(
  order: Parameters<typeof reevaluateOrder>[1],
  assigneeId: string | null,
): void {
  void getPrisma()
    .$transaction((tx) => reevaluateOrder(tx, order, assigneeId, new Date()))
    .then((created) => notifyTaskEvents(created, "created"))
    .catch((error: unknown) => {
      log("warn", "rule check failed", { error: error instanceof Error ? error.message : "unknown" });
    });
}

export async function reevaluateOrder(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    orderStatus: "UNCONFIRMED" | "CONFIRMED" | "DISPATCHED" | "DELIVERED" | "FAILED_DELIVERY";
    fulfillmentStatus: "pending" | "confirmed" | "shipped" | "out_for_delivery" | "delivered" | "cancelled" | "failed" | "paid";
    orderDate: Date;
    orderValue: { toString(): string } | number | string;
    dispatchDate: Date | null;
    expectedDeliveryDate: Date | null;
    deliveredDate: Date | null;
  },
  assigneeId: string | null,
  now: Date,
): Promise<string[]> {
  const evaluation = evaluateOrder(
    {
      orderStatus: order.orderStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      orderDate: order.orderDate,
      orderValue: Number(order.orderValue),
      dispatchDate: order.dispatchDate,
      expectedDeliveryDate: order.expectedDeliveryDate,
      deliveredDate: order.deliveredDate,
    },
    now,
  );
  const taskIds = await syncOrderTasks(tx, order.id, assigneeId, evaluation.tasks, now);
  await syncDataQuality(tx, order.id, evaluation.dataQuality);
  return taskIds;
}

async function syncOrderTasks(
  tx: Prisma.TransactionClient,
  orderDbId: string,
  employeeId: string | null,
  hits: ReturnType<typeof evaluateOrder>["tasks"],
  now: Date,
): Promise<string[]> {
  const existing = await tx.task.findMany({ where: { orderId: orderDbId } });
  const actions = planTaskSync(existing, hits);
  const created: string[] = [];

  for (const action of actions) {
    if (action.type === "create") {
      try {
        const task = await tx.task.create({
          data: {
            orderId: orderDbId,
            category: action.hit.category,
            reason: action.hit.reason,
            priority: action.hit.priority,
            actionRequired: action.hit.actionRequired,
            deadline: deadlineFor(action.hit.priority, now),
            assignedEmployeeId: employeeId,
            status: "OPEN",
          },
        });
        await tx.auditLog.create({
          data: {
            taskId: task.id,
            orderId: orderDbId,
            action: "TASK_CREATED",
            newValue: JSON.stringify({ category: action.hit.category, priority: action.hit.priority }),
          },
        });
        created.push(task.id);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
      continue;
    }

    if (action.type === "update") {
      const current = existing.find((task) => task.category === action.hit.category);
      if (!current) continue;
      await tx.task.update({
        where: { id: current.id },
        data: {
          reason: action.hit.reason,
          priority: action.hit.priority,
          actionRequired: action.hit.actionRequired,
        },
      });
      await tx.auditLog.create({
        data: {
          taskId: current.id,
          orderId: orderDbId,
          action: "TASK_UPDATED",
          oldValue: JSON.stringify({ reason: current.reason, priority: current.priority }),
          newValue: JSON.stringify({ reason: action.hit.reason, priority: action.hit.priority }),
        },
      });
      continue;
    }

    if (action.type === "auto_resolve") {
      const current = existing.find((task) => task.category === action.category);
      if (!current) continue;
      await tx.task.update({
        where: { id: current.id },
        data: { status: "RESOLVED", resolvedAt: now },
      });
      await tx.auditLog.create({
        data: {
          taskId: current.id,
          orderId: orderDbId,
          action: "AUTO_RESOLVED",
          oldValue: current.status,
          newValue: "RESOLVED",
        },
      });
    }
  }

  return created;
}

async function syncDataQuality(
  tx: Prisma.TransactionClient,
  orderDbId: string,
  findings: Array<{ code: string; message: string }>,
): Promise<void> {
  const codes = findings.map((finding) => finding.code);
  if (codes.length === 0) {
    await tx.dataQualityIssue.deleteMany({ where: { orderId: orderDbId } });
    return;
  }
  for (const finding of findings) {
    await tx.dataQualityIssue.upsert({
      where: { orderId_code: { orderId: orderDbId, code: finding.code } },
      create: { orderId: orderDbId, code: finding.code, message: finding.message },
      update: { message: finding.message },
    });
  }
  await tx.dataQualityIssue.deleteMany({ where: { orderId: orderDbId, code: { notIn: codes } } });
}
