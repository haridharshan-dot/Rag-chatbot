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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = String(error?.config?.url || "");
    if (status === 401 && (url.includes("/admin") || url.includes("/agent"))) {
      setAgentToken("");
      localStorage.setItem("agent-session-expired", "true");
      if (typeof window !== "undefined" && window.location.pathname !== "/agent") {
        window.location.assign("/agent");
      }
    }
    return Promise.reject(error);
  }
);

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

export async function agentMicrosoftLogin(accessToken) {
  const response = await api.post("/agent/login/microsoft", { accessToken });
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

export async function fetchAdminOverview() {
  const response = await api.get('/admin/overview', agentAuthConfig());
  return response.data.data;
}

export async function fetchAdminSettings() {
  const response = await api.get('/admin/settings', agentAuthConfig());
  return response.data.data;
}

export async function updateAdminSettings(payload) {
  const response = await api.put('/admin/settings', payload, agentAuthConfig());
  return response.data.data;
}

export async function runAdminReindex() {
  const response = await api.post('/admin/actions/reindex', {}, agentAuthConfig());
  return response.data.data;
}

export async function runAdminStatusCheck() {
  const response = await api.post('/admin/actions/record-status', {}, agentAuthConfig());
  return response.data.data;
}

export async function runAdminWarmRag() {
  const response = await api.post('/admin/actions/warm-rag', {}, agentAuthConfig());
  return response.data.data;
}

export async function fetchAdminSessions(status = 'queued', limit = 50) {
  const response = await api.get(`/admin/sessions?status=${encodeURIComponent(status)}&limit=${limit}`, agentAuthConfig());
  return response.data.data;
}

export async function fetchAdminAgents({ page = 1, limit = 20, search = "" } = {}) {
  try {
    const response = await api.get(
      `/admin/agents?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`,
      agentAuthConfig()
    );
    const payload = response.data.data;
    if (Array.isArray(payload)) {
      return {
        items: payload,
        pagination: { page, limit, total: payload.length, totalPages: 1, search },
      };
    }
    return payload;
  } catch (error) {
    if (error?.response?.status === 404) {
      return { items: [], pagination: { page, limit, total: 0, totalPages: 1, search } };
    }
    throw error;
  }
}

export async function fetchAdminUsers({ page = 1, limit = 20, search = "" } = {}) {
  try {
    const response = await api.get(
      `/admin/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`,
      agentAuthConfig()
    );
    const payload = response.data.data;
    if (Array.isArray(payload)) {
      return {
        items: payload,
        pagination: { page, limit, total: payload.length, totalPages: 1, search },
      };
    }
    return payload;
  } catch (error) {
    if (error?.response?.status === 404) {
      return { items: [], pagination: { page, limit, total: 0, totalPages: 1, search } };
    }
    throw error;
  }
}

export async function forceAssignSession(sessionId, agentId) {
  const response = await api.post(`/admin/sessions/${sessionId}/force-assign`, { agentId }, agentAuthConfig());
  return response.data.data;
}

export async function reopenSession(sessionId) {
  const response = await api.post(`/admin/sessions/${sessionId}/reopen`, {}, agentAuthConfig());
  return response.data.data;
}

export async function downloadTranscript(sessionId, format = 'txt') {
  const response = await api.get(`/admin/sessions/${sessionId}/transcript?format=${encodeURIComponent(format)}`, {
    ...agentAuthConfig(),
    responseType: 'blob',
  });
  return response.data;
}

export async function fetchDatasets() {
  const response = await api.get('/admin/datasets', agentAuthConfig());
  return response.data.data;
}

export async function fetchDatasetPreview(fileName, full = false) {
  try {
    const response = await api.get(
      `/admin/datasets/${encodeURIComponent(fileName)}/preview?full=${full ? "true" : "false"}`,
      agentAuthConfig()
    );
    return response.data.data;
  } catch (error) {
    if (error?.response?.status === 404) {
      const fallback = await api.get(
        `/admin/datasets/preview?fileName=${encodeURIComponent(fileName)}&full=${full ? "true" : "false"}`,
        agentAuthConfig()
      );
      return fallback.data.data;
    }
    throw error;
  }
}

export async function downloadDataset(fileName) {
  const response = await api.get(`/admin/datasets/${encodeURIComponent(fileName)}/download`, {
    ...agentAuthConfig(),
    responseType: 'blob',
  });
  return response.data;
}

export async function removeDataset(fileName) {
  const response = await api.delete(`/admin/datasets/${encodeURIComponent(fileName)}`, agentAuthConfig());
  return response.data.data;
}

export async function uploadDataset(fileName, content) {
  const response = await api.post('/admin/datasets/upload', { fileName, content }, agentAuthConfig());
  return response.data.data;
}
