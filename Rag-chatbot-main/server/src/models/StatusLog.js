import mongoose from "mongoose";

const StatusLogSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
    apiStatus: {
      type: String,
      enum: ["up", "down"],
      required: true,
    },
    llmStatus: {
      type: String,
      enum: ["up", "down"],
      required: true,
    },
    apiResponseTime: {
      type: Number,
      required: false,
    },
    llmResponseTime: {
      type: Number,
      required: false,
    },
  },
  { timestamps: true }
);

export const StatusLog = mongoose.model("StatusLog", StatusLogSchema);
