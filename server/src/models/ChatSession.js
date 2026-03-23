import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      enum: ["student", "bot", "agent", "system"],
      required: true,
    },
    content: { type: String, required: true, trim: true },
    meta: {
      confidence: { type: Number },
      sources: [{ type: String }],
      escalationSuggested: { type: Boolean },
      agentId: { type: String },
    },
  },
  { timestamps: true }
);

const chatSessionSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["bot", "queued", "active", "resolved"],
      default: "bot",
      index: true,
    },
    assignedAgentId: { type: String, default: null },
    escalationRequestedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    messages: [messageSchema],
  },
  { timestamps: true }
);

export const ChatSession = mongoose.model("ChatSession", chatSessionSchema);
