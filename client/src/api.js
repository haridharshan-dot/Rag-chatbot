import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

const AGENT_TOKEN_KEY = "agent-auth-token";

export function getAgentToken() {
  return localStorage.getItem(AGENT_TOKEN_KEY) || "";
}

export function setAgentToken(token) {
  if (!token) {
    localStorage.removeItem(AGENT_TOKEN_KEY);
    return;
  }
  localStorage.setItem(AGENT_TOKEN_KEY, token);
}

function agentAuthConfig() {
  const token = getAgentToken();
  return token
    ? {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    : {};
}

export async function agentLogin(username, password) {
  const response = await api.post("/agent/login", { username, password });
  return response.data.data;
}

export async function createSession(studentId) {
  const response = await api.post("/chat/session", { studentId });
  return response.data.data;
}

export async function sendStudentMessage(sessionId, text) {
  const response = await api.post(`/chat/${sessionId}/message`, {
    sender: "student",
    content: text,
  });
  return response.data.data;
}

export async function escalateToAgent(sessionId) {
  const response = await api.post(`/chat/${sessionId}/escalate`);
  return response.data.data;
}

export async function fetchHistory(sessionId) {
  const response = await api.get(`/chat/${sessionId}/history`);
  return response.data.data;
}

export async function fetchAgentQueue() {
  const response = await api.get("/agent/queue", agentAuthConfig());
  return response.data.data;
}

export async function joinAgentSession(sessionId, agentId) {
  const response = await api.post(
    `/agent/${sessionId}/join`,
    { agentId },
    agentAuthConfig()
  );
  return response.data.data;
}

export async function sendAgentMessage(sessionId, content, agentId) {
  const response = await api.post(
    `/agent/${sessionId}/message`,
    {
      content,
      agentId,
    },
    agentAuthConfig()
  );
  return response.data.data;
}

export async function resolveSession(sessionId, agentId) {
  const response = await api.post(
    `/agent/${sessionId}/resolve`,
    { agentId },
    agentAuthConfig()
  );
  return response.data.data;
}

export async function fetchStatusLogs() {
  const response = await api.get('/status/status-logs');
  return response.data.data;
}

export async function fetchReadiness() {
  const response = await api.get('/ready');
  return response.data.data;
}
