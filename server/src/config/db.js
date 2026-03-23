import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  
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
