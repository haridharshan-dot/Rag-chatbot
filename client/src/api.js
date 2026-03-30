import axios from "axios";
import {
  clearAgentToken,
  getAgentToken as getStoredAgentToken,
  getStudentToken as getStoredStudentToken,
  setAgentToken as setStoredAgentToken,
  setStudentToken as setStoredStudentToken,
} from "./utils/auth";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  // Keep chat snappy; backend should fallback quickly on slow model calls.
  timeout: 18000,
});

export function getAgentToken() {
  return getStoredAgentToken();
}

export function setAgentToken(token) {
  if (!token) {
    clearAgentToken();
    return;
  }
  setStoredAgentToken(token);
}

export function getStudentToken() {
  return getStoredStudentToken();
}

export function setStudentToken(token) {
  if (!token) {
    setStoredStudentToken("");
    return;
  }
  setStoredStudentToken(token);
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = String(error?.config?.url || "");
    if (status === 401 && (url.includes("/admin") || url.includes("/agent"))) {
      clearAgentToken();
      localStorage.setItem("agent-session-expired", "true");
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.assign("/login");
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

function studentAuthConfig() {
  const token = getStudentToken();
  return token
    ? {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    : {};
}

export async function agentLogin(username, password) {
  const response = await api.post("/agent/login", { email: username, password });
  return response.data.data;
}

export async function agentMicrosoftLogin(accessToken) {
  const response = await api.post("/agent/login/microsoft", { accessToken });
  return response.data.data;
}

export async function adminLogin(email, password) {
  const response = await api.post("/admin/login", { email, password });
  return response.data.data;
}

export async function fetchAgentMe() {
  const response = await api.get("/agent/me", agentAuthConfig());
  return response.data.data;
}

export async function createSession(studentId, siteContext = null) {
  const response = await api.post(
    "/chat/session",
    {
      studentId,
      siteContext,
    },
    studentAuthConfig()
  );
  return response.data.data;
}

export async function sendStudentMessage(sessionId, text) {
  const response = await api.post(
    `/chat/${sessionId}/message`,
    {
      sender: "student",
      content: text,
    },
    studentAuthConfig()
  );
  return response.data.data;
}

export async function escalateToAgent(sessionId) {
  const response = await api.post(`/chat/${sessionId}/escalate`, {}, studentAuthConfig());
  return response.data.data;
}

export async function fetchHistory(sessionId) {
  const response = await api.get(`/chat/${sessionId}/history`, studentAuthConfig());
  return response.data.data;
}

export async function clearStudentChat(sessionId) {
  const response = await api.post(`/chat/${sessionId}/clear`, {}, studentAuthConfig());
  return response.data.data;
}

export async function fetchChatNotifications(sessionId) {
  const response = await api.get(`/chat/${sessionId}/notifications`, studentAuthConfig());
  return response.data.data;
}

export async function analyzeStudentDocument(sessionId, payload) {
  const response = await api.post(`/chat/${sessionId}/document/analyze`, payload, studentAuthConfig());
  return response.data.data;
}

export async function studentRegister(payload) {
  const response = await api.post("/auth/register", payload);
  return response.data.data;
}

export async function studentLogin(payload) {
  const response = await api.post("/auth/login", payload);
  return response.data.data;
}

export async function studentGoogleLogin(credential, mobile = "") {
  const response = await api.post("/auth/login/google", { credential, mobile });
  return response.data.data;
}

export async function studentSignup(payload) {
  const response = await api.post("/auth/signup", payload);
  return response.data.data;
}

export async function requestStudentOtp(payload) {
  const response = await api.post("/auth/otp/request", payload);
  return response.data.data;
}

export async function verifyStudentOtp(payload) {
  const response = await api.post("/auth/otp/verify", payload);
  return response.data.data;
}

export async function requestStudentForgotPasswordOtp(payload) {
  const response = await api.post("/auth/password/forgot/request", payload);
  return response.data.data;
}

export async function verifyStudentForgotPasswordOtp(payload) {
  const response = await api.post("/auth/password/forgot/verify", payload);
  return response.data.data;
}

export async function fetchStudentMe() {
  const response = await api.get("/auth/me", studentAuthConfig());
  return response.data.data;
}

export async function updateStudentMobile(payload) {
  const response = await api.post("/auth/mobile", payload, studentAuthConfig());
  return response.data.data;
}

export async function fetchStudentHistory() {
  const response = await api.get("/auth/history", studentAuthConfig());
  return response.data.data;
}

export async function fetchAgentQueue() {
  const response = await api.get("/agent/queue", agentAuthConfig());
  return response.data.data;
}

export async function fetchAgentReport(range = "week") {
  const response = await api.get(`/agent/reports?range=${encodeURIComponent(range)}`, agentAuthConfig());
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

export async function runAdminOtpProviderHealthCheck() {
  const response = await api.post('/admin/actions/check-otp-providers', {}, agentAuthConfig());
  return response.data.data;
}

export async function fetchAdminSessions(status = 'queued', limit = 50) {
  const response = await api.get(`/admin/sessions?status=${encodeURIComponent(status)}&limit=${limit}`, agentAuthConfig());
  return response.data.data;
}

export async function fetchAdminReport(range = "week") {
  const response = await api.get(`/admin/reports?range=${encodeURIComponent(range)}`, agentAuthConfig());
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

export async function deleteAdminUser(userId) {
  const response = await api.delete(`/admin/users/${encodeURIComponent(userId)}`, agentAuthConfig());
  return response.data.data;
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
