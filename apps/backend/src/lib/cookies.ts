import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { parseCookie, stringifySetCookie } from "cookie";
import type { Request, Response } from "express";
import { getEnv } from "../env.js";

export const SESSION_COOKIE = "nx_session";
export const OAUTH_STATE_COOKIE = "nx_oauth_state";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function writeCookie(res: Response, name: string, value: string, maxAge: number, sameSite: "lax" | "none"): void {
  const env = getEnv();
  res.appendHeader(
    "Set-Cookie",
    stringifySetCookie({
      name,
      value,
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite,
      path: "/",
      maxAge,
    }),
  );
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  return parseCookie(header)[name] ?? null;
}

export function setSessionCookie(res: Response, token: string): void {
  const env = getEnv();
  const sameSite = env.NODE_ENV === "production" ? "none" : "lax";
  writeCookie(res, SESSION_COOKIE, token, env.SESSION_TTL_HOURS * 3600, sameSite);
}

export function clearSessionCookie(res: Response): void {
  const env = getEnv();
  const sameSite = env.NODE_ENV === "production" ? "none" : "lax";
  writeCookie(res, SESSION_COOKIE, "", 0, sameSite);
}

export function setOAuthStateCookie(res: Response, state: string): void {
  writeCookie(res, OAUTH_STATE_COOKIE, state, 10 * 60, "lax");
}

export function clearOAuthStateCookie(res: Response): void {
  writeCookie(res, OAUTH_STATE_COOKIE, "", 0, "lax");
}
