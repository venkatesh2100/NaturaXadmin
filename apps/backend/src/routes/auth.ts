import { Router } from "express";
import { z } from "zod";
import { getEnv } from "../env.js";
import { asyncRoute, publicUser } from "../http.js";
import {
  clearOAuthStateCookie,
  clearSessionCookie,
  OAUTH_STATE_COOKIE,
  randomToken,
  readCookie,
  SESSION_COOKIE,
  safeEqual,
  setOAuthStateCookie,
  setSessionCookie,
  sha256,
} from "../lib/cookies.js";
import { AppError } from "../lib/errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { getPrisma } from "../lib/prisma.js";
import { createHash } from "node:crypto";

export const authRouter = Router();

authRouter.get("/config", (_req, res) => {
  const env = getEnv();
  res.json({
    googleEnabled: env.googleEnabled,
    devLoginEnabled: env.DEV_LOGIN_ENABLED && env.NODE_ENV !== "production",
  });
});

authRouter.get(
  "/google",
  asyncRoute(async (req, res) => {
    const env = getEnv();
    if (!env.googleEnabled) {
      throw new AppError(400, "OAUTH_DISABLED", "Google sign-in is not configured.");
    }
    const state = randomToken(24);
    const nonce = randomToken(24);
    const codeVerifier = randomToken(32);
    const returnTo = safeReturnTo(req.query.returnTo);
    const prisma = getPrisma();
    await prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await prisma.oAuthState.create({
      data: {
        state,
        nonce,
        codeVerifier,
        returnTo,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    setOAuthStateCookie(res, state);
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: createHash("sha256").update(codeVerifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  }),
);

authRouter.get(
  "/google/callback",
  asyncRoute(async (req, res) => {
    const env = getEnv();
    try {
      const state = String(req.query.state ?? "");
      const code = String(req.query.code ?? "");
      const cookieState = readCookie(req, OAUTH_STATE_COOKIE);
      if (!state || !code || !cookieState || !safeEqual(state, cookieState)) {
        throw new AppError(400, "OAUTH_STATE", "Sign-in could not be verified. Try again.");
      }
      const prisma = getPrisma();
      const record = await prisma.oAuthState.findUnique({ where: { state } });
      if (!record || record.expiresAt.getTime() < Date.now()) {
        throw new AppError(400, "OAUTH_STATE", "Sign-in expired. Try again.");
      }
      await prisma.oAuthState.delete({ where: { id: record.id } });
      clearOAuthStateCookie(res);

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: env.GOOGLE_CALLBACK_URL,
          grant_type: "authorization_code",
          code_verifier: record.codeVerifier,
        }),
      });
      if (!tokenResponse.ok) throw new AppError(401, "OAUTH_TOKEN", "Google did not accept the sign-in.");
      const tokenJson = (await tokenResponse.json()) as { access_token?: string };
      if (!tokenJson.access_token) throw new AppError(401, "OAUTH_TOKEN", "Google did not return an access token.");

      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { authorization: `Bearer ${tokenJson.access_token}` },
      });
      if (!profileResponse.ok) throw new AppError(401, "OAUTH_PROFILE", "Google profile could not be read.");
      const profile = (await profileResponse.json()) as {
        sub?: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
      };
      if (!profile.sub || !profile.email || profile.email_verified !== true) {
        throw new AppError(401, "OAUTH_PROFILE", "Google account email is not verified.");
      }
      const email = profile.email.toLowerCase();
      const domain = email.split("@")[1] ?? "";
      if (env.allowedEmailDomains.length > 0 && !env.allowedEmailDomains.includes(domain)) {
        throw new AppError(403, "DOMAIN", "This email domain is not allowed.");
      }

      const role = env.bootstrapAdminEmails.includes(email) ? "ADMIN" : undefined;
      const existing = await prisma.user.findFirst({ where: { OR: [{ googleId: profile.sub }, { email }] } });
      const user = existing
        ? await prisma.user.update({
            where: { id: existing.id },
            data: {
              googleId: profile.sub,
              email,
              name: profile.name?.trim() || existing.name,
              ...(role ? { role } : {}),
            },
          })
        : await prisma.user.create({
            data: {
              googleId: profile.sub,
              email,
              name: profile.name?.trim() || email,
              role: role ?? "STAFF",
            },
          });

      const token = await createSession(user.id);
      setSessionCookie(res, token);
      res.redirect(`${env.WEB_ORIGIN}${record.returnTo}`);
    } catch (error) {
      const code = error instanceof AppError ? error.code : "OAUTH";
      res.redirect(`${env.WEB_ORIGIN}/login?error=${encodeURIComponent(code)}`);
    }
  }),
);

const credentials = z.object({
  email: z.email(),
  password: z.string().min(8).max(72),
});

authRouter.post(
  "/register",
  asyncRoute(async (req, res) => {
    const body = credentials.extend({ name: z.string().trim().min(1).max(80) }).parse(req.body);
    const email = body.email.toLowerCase();
    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError(409, "EMAIL_TAKEN", "An account with that email already exists.");
    const env = getEnv();
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email,
        googleId: `password:${email}`,
        passwordHash: await hashPassword(body.password),
        role: env.bootstrapAdminEmails.includes(email) ? "ADMIN" : "STAFF",
      },
    });
    const token = await createSession(user.id);
    setSessionCookie(res, token);
    res.status(201).json({ user: publicUser(user) });
  }),
);

authRouter.post(
  "/login",
  asyncRoute(async (req, res) => {
    const body = credentials.parse(req.body);
    const user = await getPrisma().user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new AppError(401, "INVALID_LOGIN", "Email or password is incorrect.");
    }
    const token = await createSession(user.id);
    setSessionCookie(res, token);
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post(
  "/dev",
  asyncRoute(async (req, res) => {
    const env = getEnv();
    if (!env.DEV_LOGIN_ENABLED || env.NODE_ENV === "production") {
      throw new AppError(404, "NOT_FOUND", "Not found.");
    }
    const body = z.object({ email: z.email() }).parse(req.body);
    const user = await getPrisma().user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user) throw new AppError(404, "NOT_FOUND", "No seeded user uses that email.");
    const token = await createSession(user.id);
    setSessionCookie(res, token);
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post(
  "/logout",
  asyncRoute(async (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) {
      await getPrisma().session.deleteMany({ where: { tokenHash: sha256(token) } });
    }
    clearSessionCookie(res);
    res.status(204).end();
  }),
);

authRouter.get(
  "/me",
  asyncRoute(async (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) throw new AppError(401, "UNAUTHENTICATED", "Sign in required.");
    const session = await getPrisma().session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw new AppError(401, "UNAUTHENTICATED", "Sign in required.");
    }
    res.json({ user: publicUser(session.user) });
  }),
);

export async function createSession(userId: string): Promise<string> {
  const env = getEnv();
  const token = randomToken();
  await getPrisma().session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + env.SESSION_TTL_HOURS * 3600 * 1000),
    },
  });
  return token;
}

function safeReturnTo(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value.slice(0, 200);
}
