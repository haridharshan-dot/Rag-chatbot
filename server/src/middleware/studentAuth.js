import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signStudentToken(payload) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: "7d",
  });
}

export function verifyStudentToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

export function attachOptionalStudentAuth(req, _res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return next();

  try {
    const decoded = verifyStudentToken(token);
    if (decoded.role === "student") {
      req.student = decoded;
    }
  } catch {
    // ignore invalid optional token
  }

  return next();
}

export function requireStudentAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return res.status(401).json({ success: false, message: "Missing student token" });
  }

  try {
    const decoded = verifyStudentToken(token);
    if (decoded.role !== "student") {
      return res.status(403).json({ success: false, message: "Invalid student role" });
    }
    req.student = decoded;
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}
