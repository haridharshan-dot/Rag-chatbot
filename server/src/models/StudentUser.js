import mongoose from "mongoose";

const studentUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

export const StudentUser = mongoose.model("StudentUser", studentUserSchema);
