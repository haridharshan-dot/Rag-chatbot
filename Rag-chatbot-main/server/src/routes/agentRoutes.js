import { Router } from "express";
import { ChatSession } from "../models/ChatSession.js";
import { AgentActivity } from "../models/AgentActivity.js";
import { env } from "../config/env.js";
import { requireAgentAuth, signAgentToken } from "../middleware/agentAuth.js";
import { getRuntimeSettings } from "../services/adminSettingsService.js";

const router = Router();

router.post("/login", (req, res) => {
  const emailInput = String(req.body?.email || req.body?.username || "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || "").trim();
  const configuredEmail = String(env.agentEmail || "").trim().toLowerCase();
  const configuredUsername = String(env.agentUsername || "").trim().toLowerCase();

  const validIdentity =
    emailInput === configuredEmail ||
    emailInput === configuredUsername;

  if (!validIdentity || password !== env.agentPassword) {
    return res.status(401).json({ success: false, message: "Invalid credentials" });
  }

  const agentId = configuredEmail.split("@")[0] || configuredUsername || "agent";

  const token = signAgentToken({
    role: "agent",
    agentId,
    email: configuredEmail,
  });

  AgentActivity.findOneAndUpdate(
    { agentId },
    {
      $set: {
        provider: "local",
        email: configuredEmail,
        displayName: agentId,
        lastLoginAt: new Date(),
        lastLoginIp: req.ip || null,
      },
    },
    { upsert: true, new: true }
  ).catch(() => {});

  return res.json({
    success: true,
    data: {
      token,
      agent: {
        id: agentId,
        email: configuredEmail,
      },
      agentId,
      email: configuredEmail,
      expiresIn: env.agentJwtExpiry,
    },
  });
});

router.post("/login/microsoft", async (req, res) => {
  const settings = await getRuntimeSettings();
  if (!settings.microsoftAuthEnabled) {
    return res.status(503).json({
      success: false,
      message: "Microsoft login is disabled in Site Configuration",
    });
  }

  const accessToken = String(req.body?.accessToken || "").trim();
  if (!accessToken) {
    return res.status(400).json({ success: false, message: "accessToken is required" });
  }

  try {
    const graphResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!graphResponse.ok) {
      return res.status(401).json({ success: false, message: "Invalid Microsoft token" });
    }

    const profile = await graphResponse.json();
    const email = String(profile.mail || profile.userPrincipalName || "").toLowerCase();
    if (!email) {
      return res.status(401).json({ success: false, message: "Unable to resolve Microsoft account email" });
    }

    const domain = email.includes("@") ? email.split("@")[1] : "";
    if (settings.microsoftAllowedDomains.length && !settings.microsoftAllowedDomains.includes(domain)) {
      return res.status(403).json({ success: false, message: "Microsoft account domain not allowed" });
    }

    if (settings.microsoftAllowedEmails.length && !settings.microsoftAllowedEmails.includes(email)) {
      return res.status(403).json({ success: false, message: "Microsoft account not allowed" });
    }

    const agentId = email.split("@")[0] || profile.id || "agent";
    const token = signAgentToken({
      role: "agent",
      agentId,
      provider: "microsoft",
      email,
    });

    await AgentActivity.findOneAndUpdate(
      { agentId },
      {
        $set: {
          email,
          displayName: profile.displayName || agentId,
          provider: "microsoft",
          lastLoginAt: new Date(),
          lastLoginIp: req.ip || null,
        },
      },
      { upsert: true, new: true }
    );

    return res.json({
      success: true,
      data: {
        token,
        agentId,
        email,
        displayName: profile.displayName || agentId,
        expiresIn: env.agentJwtExpiry,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Microsoft login failed" });
  }
});

router.use(requireAgentAuth);

router.get("/me", (req, res) => {
  return res.json({
    success: true,
    data: {
      id: req.agent?.agentId || "agent",
      email: req.agent?.email || env.agentEmail,
      role: req.agent?.role || "agent",
    },
  });
});

router.get("/queue", async (req, res, next) => {
  try {
    const queued = await ChatSession.find({ status: { $in: ["bot", "queued", "active"] } })
      .sort({ updatedAt: -1, escalationRequestedAt: 1 })
      .limit(100)
      .lean();

    return res.json({ success: true, data: queued });
  } catch (error) {
    next(error);
  }
});

router.post("/:sessionId/join", async (req, res, next) => {
  try {
    const agentId = String(req.agent?.agentId || req.body?.agentId || "").trim();
    if (!agentId) {
      return res.status(400).json({ success: false, message: "agentId is required" });
    }

    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    const alreadyActiveWithSameAgent =
      session.status === "active" && String(session.assignedAgentId || "") === agentId;

    session.status = "active";
    session.assignedAgentId = agentId;
    if (!alreadyActiveWithSameAgent) {
      session.messages.push({
        sender: "system",
        content: `Agent ${agentId} joined the conversation.`,
      });
    }
    await session.save();

    req.app.locals.io.to(`session:${session.id}`).emit("agent:joined", {
      sessionId: session.id,
      agentId,
    });
    req.app.locals.io.emit("queue:updated");

    return res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

router.post("/:sessionId/message", async (req, res, next) => {
  try {
    const agentId = String(req.agent?.agentId || req.body?.agentId || "").trim();
    const content = String(req.body?.content || "").trim();

    if (!agentId || !content) {
      return res.status(400).json({ success: false, message: "agentId and content are required" });
    }

    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    const message = {
      sender: "agent",
      content,
      meta: { agentId },
    };

    session.messages.push(message);
    await session.save();

    req.app.locals.io.to(`session:${session.id}`).emit("chat:message", message);

    return res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

router.post("/:sessionId/resolve", async (req, res, next) => {
  try {
    const agentId = String(req.agent?.agentId || req.body?.agentId || "").trim();
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    session.status = "resolved";
    session.resolvedAt = new Date();
    session.messages.push({
      sender: "system",
      content: `Conversation resolved by ${agentId || "agent"}.`,
      meta: { agentId },
    });
    await session.save();

    req.app.locals.io.to(`session:${session.id}`).emit("chat:resolved", {
      sessionId: session.id,
      resolvedAt: session.resolvedAt,
    });
    req.app.locals.io.emit("queue:updated");

    return res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

export default router;
