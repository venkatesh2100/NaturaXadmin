import "dotenv/config";
import { createApp } from "./app.js";
import { getEnv } from "./env.js";
import { log } from "./logger.js";
import { disconnectPrisma } from "./lib/prisma.js";
import { runOverdueCheck } from "./services/overdue.js";

const env = getEnv();
const app = createApp();
const server = app.listen(env.PORT, () => {
  log("info", "api listening", { port: env.PORT });
});

if (env.OVERDUE_CHECK_INTERVAL_MS > 0) {
  setInterval(() => {
    runOverdueCheck().catch((error: unknown) => {
      log("error", "overdue check failed", { error: error instanceof Error ? error.message : "unknown" });
    });
  }, env.OVERDUE_CHECK_INTERVAL_MS);
  log("info", "overdue scheduler started", { intervalMs: env.OVERDUE_CHECK_INTERVAL_MS });
}

async function shutdown() {
  server.close();
  await disconnectPrisma();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
