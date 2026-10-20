import { Router } from "express";
import { z } from "zod";
import { asyncRoute, parseFilters, serializeTask } from "../http.js";
import { pageParams } from "../lib/pagination.js";
import { AppError } from "../lib/errors.js";
import { getPrisma } from "../lib/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { taskOrderBy, taskWhere } from "../services/filters.js";
import { reevaluateOrder } from "../services/import.js";
import { notifyTaskEvents } from "../services/notifications.js";
import { assertCanChangeStatus, assertCanClaim, assertCanReassign } from "../services/permissions.js";

const ORDER_STATUS_OPTIONS = [
  "pending",
  "confirmed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "failed",
  "paid",
] as const;

export const taskRouter = Router();
const taskInclude = {
  assignedEmployee: { select: { id: true, name: true, email: true } },
  order: { include: { assignedEmployee: { select: { id: true, name: true, email: true } } } },
} as const;

taskRouter.use(requireAuth);

taskRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const filters = parseFilters(req.query);
    const page = pageParams(filters);
    const where = taskWhere(filters);
    const prisma = getPrisma();
    const [total, tasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        include: taskInclude,
        orderBy: taskOrderBy(filters.sort, filters.order),
        skip: page.skip,
        take: page.pageSize,
      }),
    ]);
    res.json({
      data: tasks.map((task) => serializeTask(task)),
      meta: { page: page.page, pageSize: page.pageSize, total },
    });
  }),
);

taskRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const task = await getPrisma().task.findUnique({
      where: { id: String(req.params.id) },
      include: {
        ...taskInclude,
        auditLogs: {
          orderBy: { createdAt: "desc" },
          include: { performedBy: { select: { id: true, name: true } } },
        },
        order: {
          include: {
            assignedEmployee: { select: { id: true, name: true, email: true } },
            dataQualityIssues: true,
          },
        },
      },
    });
    if (!task) throw new AppError(404, "NOT_FOUND", "Task not found.");
    res.json({
      ...serializeTask(task),
      dataQuality: task.order.dataQualityIssues.map((issue) => ({
        code: issue.code,
        message: issue.message,
      })),
      audit: task.auditLogs.map((entry) => ({
        id: entry.id,
        action: entry.action,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        performedBy: entry.performedBy?.name ?? "System",
        createdAt: entry.createdAt.toISOString(),
      })),
    });
  }),
);

taskRouter.patch(
  "/:id/assignment",
  requireAdmin,
  asyncRoute(async (req, res) => {
    assertCanReassign(req.user!);
    const body = z.object({ employeeId: z.string().min(1).nullable() }).parse(req.body);
    const prisma = getPrisma();
    const task = await prisma.task.findUnique({ where: { id: String(req.params.id) } });
    if (!task) throw new AppError(404, "NOT_FOUND", "Task not found.");
    const nextEmployee = body.employeeId
      ? await prisma.user.findUnique({ where: { id: body.employeeId } })
      : null;
    if (body.employeeId && !nextEmployee) throw new AppError(400, "VALIDATION_ERROR", "Employee not found.");
    if (nextEmployee && nextEmployee.role !== "STAFF") {
      throw new AppError(400, "VALIDATION_ERROR", "Tasks can only be assigned to employees.");
    }
    if ((task.assignedEmployeeId ?? null) === (nextEmployee?.id ?? null)) {
      const current = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude });
      res.json(serializeTask(current));
      return;
    }
    const previous = task.assignedEmployeeId
      ? await prisma.user.findUnique({ where: { id: task.assignedEmployeeId } })
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.task.update({
        where: { id: task.id },
        data: { assignedEmployeeId: nextEmployee?.id ?? null },
        include: taskInclude,
      });
      await tx.auditLog.create({
        data: {
          taskId: task.id,
          orderId: task.orderId,
          action: "REASSIGNED",
          oldValue: JSON.stringify({ employeeId: previous?.id ?? null, name: previous?.name ?? null }),
          newValue: JSON.stringify({ employeeId: nextEmployee?.id ?? null, name: nextEmployee?.name ?? null }),
          performedById: req.user!.id,
        },
      });
      return saved;
    });
    res.json(serializeTask(updated));
  }),
);

taskRouter.post(
  "/:id/claim",
  asyncRoute(async (req, res) => {
    assertCanClaim(req.user!);
    const prisma = getPrisma();
    const task = await prisma.task.findUnique({ where: { id: String(req.params.id) } });
    if (!task) throw new AppError(404, "NOT_FOUND", "Task not found.");
    if (task.assignedEmployeeId === req.user!.id) {
      const current = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude });
      res.json(serializeTask(current));
      return;
    }
    if (task.assignedEmployeeId) {
      throw new AppError(409, "ALREADY_ASSIGNED", "This task is already assigned. Only an admin can reassign it.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.task.updateMany({
        where: { id: task.id, assignedEmployeeId: null },
        data: { assignedEmployeeId: req.user!.id },
      });
      if (claimed.count !== 1) {
        throw new AppError(409, "ALREADY_ASSIGNED", "Another employee already picked this task.");
      }
      await tx.auditLog.create({
        data: {
          taskId: task.id,
          orderId: task.orderId,
          action: "CLAIMED",
          oldValue: null,
          newValue: req.user!.name,
          performedById: req.user!.id,
        },
      });
      return tx.task.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude });
    });
    res.json(serializeTask(updated));
  }),
);

taskRouter.patch(
  "/:id/order-status",
  asyncRoute(async (req, res) => {
    const body = z.object({ status: z.enum(ORDER_STATUS_OPTIONS) }).parse(req.body);
    const prisma = getPrisma();
    const task = await prisma.task.findUnique({
      where: { id: String(req.params.id) },
      include: { order: true },
    });
    if (!task) throw new AppError(404, "NOT_FOUND", "Task not found.");
    assertCanChangeStatus(req.user!, task);
    if (task.order.fulfillmentStatus === body.status) {
      const current = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude });
      res.json(serializeTask(current));
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id: task.orderId },
        data: { fulfillmentStatus: body.status },
      });
      await tx.auditLog.create({
        data: {
          taskId: task.id,
          orderId: task.orderId,
          action: "ORDER_STATUS_UPDATED",
          oldValue: task.order.fulfillmentStatus,
          newValue: body.status,
          performedById: req.user!.id,
        },
      });
      const created = await reevaluateOrder(tx, order, task.assignedEmployeeId, new Date());
      const saved = await tx.task.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude });
      return { saved, created };
    });
    await notifyTaskEvents(updated.created, "created");
    res.json(serializeTask(updated.saved));
  }),
);

taskRouter.patch(
  "/:id/status",
  asyncRoute(async (req, res) => {
    const body = z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]) }).parse(req.body);
    const prisma = getPrisma();
    const task = await prisma.task.findUnique({ where: { id: String(req.params.id) } });
    if (!task) throw new AppError(404, "NOT_FOUND", "Task not found.");
    assertCanChangeStatus(req.user!, task);
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.task.update({
        where: { id: task.id },
        data: {
          status: body.status,
          resolvedAt: body.status === "RESOLVED" ? new Date() : null,
        },
        include: taskInclude,
      });
      await tx.auditLog.create({
        data: {
          taskId: task.id,
          orderId: task.orderId,
          action: "STATUS_CHANGED",
          oldValue: task.status,
          newValue: body.status,
          performedById: req.user!.id,
        },
      });
      return saved;
    });
    res.json(serializeTask(updated));
  }),
);
