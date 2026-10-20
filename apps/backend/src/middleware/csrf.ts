import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";
import { allowedOrigin } from "../lib/origin.js";

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method)) {
    next();
    return;
  }
  if (req.path.startsWith("/internal/")) {
    next();
    return;
  }
  if (!allowedOrigin(req.headers.origin)) {
    next(new AppError(403, "CSRF", "This request was blocked because its origin is not allowed."));
    return;
  }
  next();
}
