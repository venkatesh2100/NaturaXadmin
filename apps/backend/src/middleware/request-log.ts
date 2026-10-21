import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { log } from "../logger.js";

export function requestLog(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID().slice(0, 8);
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  const started = Date.now();
  res.on("finish", () => {
    if (req.method === "OPTIONS") return;
    const path = req.originalUrl.split("?")[0];
    if (path === "/health" && res.statusCode < 400) return;
    const ms = Date.now() - started;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 || ms >= 1000 ? "warn" : "info";
    log(level, `${req.method} ${path}`, {
      status: res.statusCode,
      ms,
      user: req.user?.name,
      requestId,
      reason: typeof res.locals.reason === "string" ? res.locals.reason : undefined,
    });
  });
  next();
}
