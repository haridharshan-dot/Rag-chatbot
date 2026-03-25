import mongoose from "mongoose";

const agentActivitySchema = new mongoose.Schema(
  {
    agentId: { type: String, required: true, unique: true, index: true },
    email: { type: String, default: null },
    displayName: { type: String, default: null },
    provider: { type: String, default: "local" },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },
  },
  { timestamps: true }
);

export const AgentActivity = mongoose.model("AgentActivity", agentActivitySchema);
