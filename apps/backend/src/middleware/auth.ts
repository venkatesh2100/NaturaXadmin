import type { NextFunction, Request, Response } from "express";
import { getEnv } from "../env.js";
import { readCookie, safeEqual, SESSION_COOKIE, sha256 } from "../lib/cookies.js";
import { AppError } from "../lib/errors.js";
import { getPrisma } from "../lib/prisma.js";

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) throw new AppError(401, "UNAUTHENTICATED", "Sign in required.");
    const session = await getPrisma().session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw new AppError(401, "UNAUTHENTICATED", "Sign in required.");
    }
    req.user = session.user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new AppError(401, "UNAUTHENTICATED", "Sign in required."));
    return;
  }
  if (req.user.role !== "ADMIN") {
    next(new AppError(403, "FORBIDDEN", "Only an admin can do that."));
    return;
  }
  next();
}

export function requireCron(req: Request, _res: Response, next: NextFunction): void {
  const secret = getEnv().CRON_SECRET;
  const provided = req.header("x-cron-secret") ?? "";
  if (!secret || !safeEqual(provided, secret)) {
    next(new AppError(401, "UNAUTHENTICATED", "Invalid cron secret."));
    return;
  }
  next();
}
