import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import { log } from "../logger.js";
import multer from "multer";

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const message = err.code === "LIMIT_FILE_SIZE" ? "File exceeds the 5 MB limit." : "Upload could not be read.";
    res.status(status).json({ error: { code: err.code, message } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  log("error", "unhandled error", {
    requestId: req.requestId,
    path: req.path,
    error: err instanceof Error ? err.message : "unknown",
  });
  res.status(500).json({
    error: { code: "INTERNAL", message: "Something went wrong. Try again." },
  });
}
