import { Router } from "express";
import { StudentUser } from "../models/StudentUser.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { requireStudentAuth, signStudentToken } from "../middleware/studentAuth.js";
import { ChatSession } from "../models/ChatSession.js";

const router = Router();

router.post("/register", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "name, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const exists = await StudentUser.findOne({ email }).lean();
    if (exists) {
      return res.status(409).json({ success: false, message: "Email already registered" });
    }

    const user = await StudentUser.create({
      name,
      email,
      passwordHash: hashPassword(password),
    });

    const token = signStudentToken({
      role: "student",
      studentId: String(user._id),
      email: user.email,
      name: user.name,
    });

    return res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: String(user._id), name: user.name, email: user.email },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "email and password are required" });
    }

    const user = await StudentUser.findOne({ email });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = signStudentToken({
      role: "student",
      studentId: String(user._id),
      email: user.email,
      name: user.name,
    });

    return res.json({
      success: true,
      data: {
        token,
        user: { id: String(user._id), name: user.name, email: user.email },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireStudentAuth, (req, res) => {
  return res.json({
    success: true,
    data: {
      id: req.student.studentId,
      name: req.student.name || "Student",
      email: req.student.email || "",
    },
  });
});

router.get("/history", requireStudentAuth, async (req, res, next) => {
  try {
    const sessions = await ChatSession.find({ studentId: req.student.studentId })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();

    return res.json({ success: true, data: sessions });
  } catch (error) {
    next(error);
  }
});

export default router;
