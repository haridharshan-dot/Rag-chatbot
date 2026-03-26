import mongoose from "mongoose";

const studentUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    mobile: { type: String, unique: true, sparse: true, trim: true, index: true },
    passwordHash: { type: String, default: "" },
    otpCodeHash: { type: String, default: "" },
    otpChannel: { type: String, enum: ["email", "mobile", ""], default: "" },
    otpTarget: { type: String, default: "" },
    otpExpiresAt: { type: Date, default: null },
    otpAttempts: { type: Number, default: 0 },
    otpRequestedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const StudentUser = mongoose.model("StudentUser", studentUserSchema);
