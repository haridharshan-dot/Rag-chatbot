import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signAgentToken(payload) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.agentJwtExpiry,
  });
}

export function verifyAgentToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

function requireRole(role) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : "";

    if (!token) {
      return res.status(401).json({ success: false, message: "Missing agent token" });
    }

    try {
      const decoded = verifyAgentToken(token);
      if (decoded.role !== role) {
        return res.status(403).json({ success: false, message: "Invalid agent role" });
      }

      req.agent = decoded;
      return next();
    } catch {
      return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }
  };
}

export const requireAgentAuth = requireRole("agent");

export const requireAdminAuth = requireRole("admin");

export function requireAnyStaffAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) {
    return res.status(401).json({ success: false, message: "Missing agent token" });
  }

  try {
    const decoded = verifyAgentToken(token);
    if (!["agent", "admin"].includes(decoded.role)) {
      return res.status(403).json({ success: false, message: "Invalid agent role" });
    }

    req.agent = decoded;
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}
