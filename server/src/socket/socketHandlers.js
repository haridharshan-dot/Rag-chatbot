import { verifyAgentToken } from "../middleware/agentAuth.js";
import { markStudentMessagesSeenByAgent } from "../services/chat/readReceiptService.js";

export function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    socket.on("agent:register", ({ token }) => {
      try {
        const decoded = verifyAgentToken(token || "");
        if (decoded.role !== "agent") return;

        socket.data.agentId = decoded.agentId;
        socket.join("agents");
      } catch {
        // Ignore unauthenticated registration.
      }
    });

    socket.on("session:join", ({ sessionId, role, token }) => {
      if (!sessionId) return;
      if (role === "agent") {
        try {
          const decoded = verifyAgentToken(token || "");
          if (decoded.role !== "agent") return;
          socket.data.agentId = decoded.agentId;
        } catch {
          return;
        }
      }

      socket.join(`session:${sessionId}`);
      socket.data.role = role || "student";
    });

    socket.on("agent:seen", async ({ sessionId, seenAt }) => {
      if (!sessionId) return;
      if (socket.data.role !== "agent") return;
      const agentId = String(socket.data.agentId || "").trim();
      if (!agentId) return;

      try {
        const result = await markStudentMessagesSeenByAgent(sessionId, agentId, seenAt);
        if (!result.seenAt) return;

        io.to(`session:${sessionId}`).emit("chat:seen", {
          sessionId: String(sessionId),
          seenAt: result.seenAt,
          agentId,
        });
      } catch {
        // Ignore transient persistence errors for read receipts.
      }
    });

    socket.on("agent:typing", ({ sessionId }) => {
      if (!sessionId) return;
      if (socket.data.role !== "agent") return;
      socket.to(`session:${sessionId}`).emit("agent:typing", {
        sessionId,
      });
    });

    socket.on("chat:typing", ({ sessionId, role }) => {
      if (!sessionId) return;
      const currentRole = role || socket.data.role || "student";
      if (currentRole === "student") {
        socket.to(`session:${sessionId}`).emit("chat:typing", {
          sessionId,
          role: "student",
        });
      }
    });

    socket.on("disconnect", () => {
      // No-op for now; the server relies on persisted chat state.
    });
  });
}
