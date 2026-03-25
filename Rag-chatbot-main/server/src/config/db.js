import mongoose from "mongoose";
import { env } from "./env.js";

let lastDbError = "";

function installDbListeners() {
  mongoose.connection.on("connected", () => {
    lastDbError = "";
    console.log("MongoDB connection established");
  });

  mongoose.connection.on("error", (error) => {
    lastDbError = String(error?.message || error || "unknown MongoDB error");
    console.error("MongoDB runtime error:", lastDbError);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected");
  });
}

export function getDatabaseHealth() {
  const stateMap = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  const readyState = mongoose.connection.readyState;
  return {
    readyState,
    state: stateMap[readyState] || "unknown",
    ok: readyState === 1,
    lastError: lastDbError || null,
  };
}

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  installDbListeners();
  
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: env.mongoConnectionPoolSize,
      minPoolSize: 1,
      maxIdleTimeMS: env.mongoMaxIdleTime,
      socketTimeoutMS: 45000,
    });
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    // In production, we might want to exit if DB is critical
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }
}
