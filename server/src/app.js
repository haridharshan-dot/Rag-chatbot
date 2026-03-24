import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { env } from "./config/env.js";
import chatRoutes from "./routes/chatRoutes.js";
import agentRoutes from "./routes/agentRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import statusRoutes from "./routes/statusRoutes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export function buildApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        const allowedOrigins = [env.clientUrl, "http://localhost:5173", "http://localhost:3000"];
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

  app.use(
    rateLimit({
      windowMs: env.rateLimitWindowMs,
      max: env.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.use("/api", healthRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/agent", agentRoutes);
  app.use("/api/status", statusRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
