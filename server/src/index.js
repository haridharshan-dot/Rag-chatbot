import http from "node:http";
import { Server as SocketServer } from "socket.io";
import { buildApp } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env, validateEnvironment } from "./config/env.js";
import { registerSocketHandlers } from "./socket/socketHandlers.js";
import { ragService } from "./services/rag/ragService.js";

function normalizeOrigin(origin) {
  return String(origin || "")
    .trim()
    .replace(/\/$/, "");
}

function buildAllowedOrigins() {
  return new Set(
    [
      ...env.clientUrls,
      "http://localhost:5173",
      "http://localhost:3000",
    ].map(normalizeOrigin)
  );
}

async function bootstrap() {
  validateEnvironment();
  await connectDatabase();
  // ragService.init() is now called within the status check or on first use
  // This ensures it doesn't block server startup if data ingestion is slow or fails

  const app = buildApp();
  const server = http.createServer(app);
  const allowedOrigins = buildAllowedOrigins();

  const io = new SocketServer(server, {
    cors: {
      origin: (origin, callback) => {
        const normalized = normalizeOrigin(origin);
        if (!origin || allowedOrigins.has(normalized)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by Socket.IO CORS"));
        }
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  registerSocketHandlers(io);
  app.locals.io = io;

  const shutdown = (signal) => {
    console.log(`${signal} received. Starting graceful shutdown...`);
    server.close((error) => {
      if (error) {
        console.error("Error while closing HTTP server", error);
        process.exit(1);
      }
      io.close(() => {
        console.log("Graceful shutdown complete.");
        process.exit(0);
      });
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  server.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
