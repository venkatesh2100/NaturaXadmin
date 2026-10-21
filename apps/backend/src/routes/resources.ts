import { Router } from "express";
import { z } from "zod";
import { asyncRoute, parseFilters, publicUser, serializeOrder } from "../http.js";
import { pageParams } from "../lib/pagination.js";
import { AppError } from "../lib/errors.js";
import { getPrisma } from "../lib/prisma.js";
import { requireAdmin, requireAuth, requireCron } from "../middleware/auth.js";
import { dashboardMetrics } from "../services/dashboard.js";
import { scheduleReevaluate } from "../services/import.js";
import { assertCanUpdateOrder, canUpdateOrder } from "../services/permissions.js";
import { FULFILLMENT_STATUSES } from "../services/rules.js";
import { buildDailyReport, reportToCsv } from "../services/reports.js";
import { runOverdueCheck } from "../services/overdue.js";

export const healthRouter = Router();
healthRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    try {
      await getPrisma().$queryRaw`SELECT 1`;
      res.json({ ok: true, db: "up" });
    } catch {
      res.status(503).json({ ok: false, db: "down" });
    }
  }),
);

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);
dashboardRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    res.json(await dashboardMetrics(parseFilters(req.query)));
  }),
);

export const orderRouter = Router();
orderRouter.use(requireAuth);
orderRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const filters = parseFilters(req.query);
    const page = pageParams(filters);
    const where = {
      ...(filters.search
        ? {
            OR: [
              { orderId: { contains: filters.search, mode: "insensitive" as const } },
              { customerName: { contains: filters.search, mode: "insensitive" as const } },
              { phone: { contains: filters.search } },
            ],
          }
        : {}),
      ...(filters.from || filters.to ? { orderDate: { gte: filters.from, lte: filters.to } } : {}),
      ...(filters.employeeId === "unassigned"
        ? { assignedEmployeeId: null }
        : filters.employeeId
          ? { assignedEmployeeId: filters.employeeId }
          : {}),
    };
    const prisma = getPrisma();
    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        include: {
          assignedEmployee: { select: { id: true, name: true, email: true } },
          tasks: { select: { id: true, category: true, priority: true, status: true, assignedEmployeeId: true } },
        },
        orderBy: { orderDate: "desc" },
        skip: page.skip,
        take: page.pageSize,
      }),
    ]);
    res.json({
      data: orders.map((order) => ({
        ...serializeOrder(order),
        editable: canUpdateOrder(req.user!, order),
        openTasks: order.tasks.filter((task) => task.status !== "RESOLVED"),
      })),
      meta: { page: page.page, pageSize: page.pageSize, total },
    });
  }),
);

orderRouter.patch(
  "/:id/status",
  asyncRoute(async (req, res) => {
    const body = z.object({ status: z.enum(FULFILLMENT_STATUSES) }).parse(req.body);
    const prisma = getPrisma();
    const current = await prisma.order.findUnique({
      where: { id: String(req.params.id) },
      include: { tasks: { select: { id: true, assignedEmployeeId: true } } },
    });
    if (!current) throw new AppError(404, "NOT_FOUND", "Order not found.");
    assertCanUpdateOrder(req.user!, current);
    if (current.fulfillmentStatus === body.status) {
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: current.id },
        include: {
          assignedEmployee: { select: { id: true, name: true, email: true } },
          tasks: { select: { id: true, category: true, priority: true, status: true, assignedEmployeeId: true } },
        },
      });
      res.json({
        ...serializeOrder(order),
        editable: true,
        openTasks: order.tasks.filter((task) => task.status !== "RESOLVED"),
      });
      return;
    }

    const saved = await prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id: current.id },
        data: { fulfillmentStatus: body.status },
      });
      const auditTask = current.tasks[0];
      if (auditTask) {
        await tx.auditLog.create({
          data: {
            taskId: auditTask.id,
            orderId: order.id,
            action: "ORDER_STATUS_UPDATED",
            oldValue: current.fulfillmentStatus,
            newValue: body.status,
            performedById: req.user!.id,
          },
        });
      }
      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          assignedEmployee: { select: { id: true, name: true, email: true } },
          tasks: { select: { id: true, category: true, priority: true, status: true, assignedEmployeeId: true } },
        },
      });
    });
    res.json({
      ...serializeOrder(saved),
      editable: true,
      openTasks: saved.tasks.filter((task) => task.status !== "RESOLVED"),
    });
    scheduleReevaluate(saved, saved.assignedEmployeeId ?? (req.user!.role === "STAFF" ? req.user!.id : null));
  }),
);

orderRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const order = await getPrisma().order.findUnique({
      where: { id: String(req.params.id) },
      include: {
        assignedEmployee: { select: { id: true, name: true, email: true } },
        tasks: { include: { assignedEmployee: { select: { id: true, name: true, email: true } } } },
        dataQualityIssues: true,
      },
    });
    if (!order) throw new AppError(404, "NOT_FOUND", "Order not found.");
    res.json({
      ...serializeOrder(order),
      editable: canUpdateOrder(req.user!, order),
      tasks: order.tasks.map((task) => ({
        id: task.id,
        category: task.category,
        priority: task.priority,
        status: task.status,
        reason: task.reason,
        deadline: task.deadline.toISOString(),
        assignedEmployeeId: task.assignedEmployeeId,
        assignedEmployee: task.assignedEmployee?.name ?? "Open",
      })),
      dataQuality: order.dataQualityIssues.map((issue) => ({ code: issue.code, message: issue.message })),
    });
  }),
);

export const reportRouter = Router();
reportRouter.use(requireAuth);
reportRouter.get(
  "/daily",
  asyncRoute(async (req, res) => {
    res.json(await buildDailyReport(parseFilters(req.query)));
  }),
);
reportRouter.get(
  "/daily.csv",
  asyncRoute(async (req, res) => {
    const csv = reportToCsv(await buildDailyReport(parseFilters(req.query)));
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", "attachment; filename=\"daily-exceptions.csv\"");
    res.send(csv);
  }),
);

export const userRouter = Router();
userRouter.use(requireAuth);
userRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const users = await getPrisma().user.findMany({ orderBy: { name: "asc" } });
    res.json({ users: users.map(publicUser) });
  }),
);
userRouter.patch(
  "/:id/role",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const body = z.object({ role: z.enum(["ADMIN", "STAFF"]) }).parse(req.body);
    if (req.user!.id === req.params.id && body.role !== "ADMIN") {
      throw new AppError(400, "VALIDATION_ERROR", "You cannot remove your own admin access.");
    }
    const user = await getPrisma().user.update({
      where: { id: String(req.params.id) },
      data: { role: body.role },
    });
    res.json({ user: publicUser(user) });
  }),
);

export const dataQualityRouter = Router();
dataQualityRouter.use(requireAuth);
dataQualityRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const issues = await getPrisma().dataQualityIssue.findMany({
      include: { order: { select: { id: true, orderId: true, customerName: true, orderStatus: true } } },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    res.json({
      issues: issues.map((issue) => ({
        id: issue.id,
        code: issue.code,
        message: issue.message,
        order: issue.order,
      })),
    });
  }),
);

export const jobRouter = Router();
jobRouter.post(
  "/overdue",
  requireAuth,
  requireAdmin,
  asyncRoute(async (_req, res) => {
    res.json(await runOverdueCheck());
  }),
);

export const internalRouter = Router();
internalRouter.post(
  "/jobs/overdue",
  requireCron,
  asyncRoute(async (_req, res) => {
    res.json(await runOverdueCheck());
  }),
);
