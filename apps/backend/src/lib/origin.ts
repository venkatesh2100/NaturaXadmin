import { getEnv } from "../env.js";

export function allowedOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  const expected = getEnv().WEB_ORIGIN;
  if (origin === expected) return origin;
  if (getEnv().NODE_ENV === "production") return null;
  const swapped = expected.includes("://localhost")
    ? expected.replace("://localhost", "://127.0.0.1")
    : expected.includes("://127.0.0.1")
      ? expected.replace("://127.0.0.1", "://localhost")
      : null;
  return swapped && origin === swapped ? origin : null;
}
