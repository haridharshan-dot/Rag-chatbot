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
      intent: { type: String },
      needsAgent: { type: Boolean },
      outOfScope: { type: Boolean },
      guidedFlow: { type: Boolean },
      suggestions: [{ type: String }],
      cards: [{ type: mongoose.Schema.Types.Mixed }],
      seenByAgentAt: { type: Date },
      seenByAgentId: { type: String },
    },
  },
  { timestamps: true }
);

const chatSessionSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    studentEmail: { type: String, default: null, index: true },
    studentName: { type: String, default: null },
    clientIp: { type: String, default: null },
    userAgent: { type: String, default: null },
    siteContext: {
      title: { type: String, default: null },
      url: { type: String, default: null },
      description: { type: String, default: null },
      headings: [{ type: String }],
      text: { type: String, default: null },
      capturedAt: { type: Date, default: null },
    },
    studentProfile: {
      name: { type: String, default: null },
      language: { type: String, default: "en" },
      cutoffMarks: { type: Number, default: null },
      category: { type: String, default: null },
      preferredBranch: { type: String, default: null },
      stream: { type: String, default: null },
    },
    assistantState: {
      flow: { type: String, default: null },
      step: { type: String, default: null },
      lastIntent: { type: String, default: null },
      context: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
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
