import express from "express";
import { getEnv } from "./env.js";
import { allowedOrigin } from "./lib/origin.js";
import { errorMiddleware } from "./middleware/error.js";
import { csrfProtection } from "./middleware/csrf.js";
import { requestLog } from "./middleware/request-log.js";
import { authRouter } from "./routes/auth.js";
import { importRouter } from "./routes/imports.js";
import { taskRouter } from "./routes/tasks.js";
import {
  dashboardRouter,
  dataQualityRouter,
  healthRouter,
  internalRouter,
  jobRouter,
  orderRouter,
  reportRouter,
  userRouter,
} from "./routes/resources.js";

export function createApp() {
  const app = express();
  getEnv();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(requestLog);
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    const origin = allowedOrigin(req.headers.origin);
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use(csrfProtection);

  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use("/dashboard", dashboardRouter);
  app.use("/data-quality", dataQualityRouter);
  app.use("/orders", orderRouter);
  app.use("/imports", importRouter);
  app.use("/tasks", taskRouter);
  app.use("/reports", reportRouter);
  app.use("/users", userRouter);
  app.use("/jobs", jobRouter);
  app.use("/internal", internalRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } });
  });
  app.use(errorMiddleware);
  return app;
}
