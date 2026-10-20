import { z } from "zod";

const boolFromString = z
  .string()
  .optional()
  .transform((value) => value === "true" || value === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.url(),
  SESSION_SECRET: z.string().min(16),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(168),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_CALLBACK_URL: z.string().default(""),
  ALLOWED_EMAIL_DOMAINS: z.string().default(""),
  BOOTSTRAP_ADMIN_EMAILS: z.string().default(""),
  DISCORD_WEBHOOK_URL: z.string().default(""),
  DISCORD_NOTIFICATIONS_ENABLED: boolFromString,
  CRON_SECRET: z.string().default(""),
  DEV_LOGIN_ENABLED: boolFromString,
  OVERDUE_CHECK_INTERVAL_MS: z.coerce.number().int().nonnegative().default(900_000),
});

export type Env = z.infer<typeof envSchema> & {
  googleEnabled: boolean;
  allowedEmailDomains: string[];
  bootstrapAdminEmails: string[];
};

let cached: Env | null = null;

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.parse(process.env);
  if (parsed.NODE_ENV === "production" && parsed.DEV_LOGIN_ENABLED) {
    throw new Error("DEV_LOGIN_ENABLED cannot be true in production");
  }
  const googleEnabled = Boolean(
    parsed.GOOGLE_CLIENT_ID && parsed.GOOGLE_CLIENT_SECRET && parsed.GOOGLE_CALLBACK_URL,
  );
  cached = {
    ...parsed,
    WEB_ORIGIN: parsed.WEB_ORIGIN.replace(/\/$/, ""),
    googleEnabled,
    allowedEmailDomains: splitList(parsed.ALLOWED_EMAIL_DOMAINS),
    bootstrapAdminEmails: splitList(parsed.BOOTSTRAP_ADMIN_EMAILS),
  };
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}
