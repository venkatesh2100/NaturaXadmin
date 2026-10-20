import { Router } from "express";
import multer from "multer";
import { asyncRoute } from "../http.js";
import { AppError } from "../lib/errors.js";
import { toCsv } from "../lib/csv.js";
import { getPrisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { importOrders } from "../services/import.js";

export const importRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

importRouter.use(requireAuth);

importRouter.post(
  "/",
  upload.single("file"),
  asyncRoute(async (req, res) => {
    if (!req.file) throw new AppError(400, "FILE_REQUIRED", "Choose a CSV or Excel file.");
    const summary = await importOrders({
      filename: req.file.originalname || "upload",
      buffer: req.file.buffer,
      userId: req.user!.id,
    });
    res.status(201).json(summary);
  }),
);

importRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const batches = await getPrisma().importBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { createdBy: { select: { id: true, name: true } } },
    });
    res.json({
      batches: batches.map((batch) => ({
        id: batch.id,
        filename: batch.filename,
        totalRows: batch.totalRows,
        successfulRows: batch.successfulRows,
        rejectedRows: batch.rejectedRows,
        createdAt: batch.createdAt.toISOString(),
        createdBy: batch.createdBy.name,
      })),
    });
  }),
);

importRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const batch = await getPrisma().importBatch.findUnique({
      where: { id: String(req.params.id) },
      include: { issues: { orderBy: { rowNumber: "asc" }, take: 300 } },
    });
    if (!batch) throw new AppError(404, "NOT_FOUND", "Import batch not found.");
    res.json({
      id: batch.id,
      filename: batch.filename,
      totalRows: batch.totalRows,
      successfulRows: batch.successfulRows,
      rejectedRows: batch.rejectedRows,
      createdAt: batch.createdAt.toISOString(),
      issues: batch.issues.map((issue) => ({
        rowNumber: issue.rowNumber,
        orderId: issue.orderId,
        field: issue.field,
        message: issue.message,
        severity: issue.severity,
      })),
    });
  }),
);

importRouter.get(
  "/:id/rejected.csv",
  asyncRoute(async (req, res) => {
    const issues = await getPrisma().importIssue.findMany({
      where: { importBatchId: String(req.params.id), severity: "ERROR" },
      orderBy: { rowNumber: "asc" },
    });
    const csv = toCsv(
      ["Row", "Order ID", "Field", "Message"],
      issues.map((issue) => [issue.rowNumber, issue.orderId ?? "", issue.field ?? "", issue.message]),
    );
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", "attachment; filename=\"rejected-rows.csv\"");
    res.send(csv);
  }),
);
