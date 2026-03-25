const AGENT_TOKEN_KEY = "agent-auth-token";
const AGENT_SESSION_TOKEN_KEY = "agent-auth-token-session";
const STUDENT_TOKEN_KEY = "student-auth-token";

function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1] || "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(normalized)
        .split("")
        .map((ch) => `%${`00${ch.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  return Boolean(payload?.exp && Date.now() >= payload.exp * 1000);
}

export function getAgentToken() {
  const token =
    localStorage.getItem(AGENT_TOKEN_KEY) ||
    sessionStorage.getItem(AGENT_SESSION_TOKEN_KEY) ||
    "";
  if (!token) return "";

  if (isTokenExpired(token)) {
    localStorage.removeItem(AGENT_TOKEN_KEY);
    sessionStorage.removeItem(AGENT_SESSION_TOKEN_KEY);
    return "";
  }

  return token;
}

export function setAgentToken(token, { remember = true } = {}) {
  if (!token) {
    localStorage.removeItem(AGENT_TOKEN_KEY);
    sessionStorage.removeItem(AGENT_SESSION_TOKEN_KEY);
    return;
  }
  if (remember) {
    localStorage.setItem(AGENT_TOKEN_KEY, token);
    sessionStorage.removeItem(AGENT_SESSION_TOKEN_KEY);
    return;
  }
  sessionStorage.setItem(AGENT_SESSION_TOKEN_KEY, token);
  localStorage.removeItem(AGENT_TOKEN_KEY);
}

export function clearAgentToken() {
  localStorage.removeItem(AGENT_TOKEN_KEY);
  sessionStorage.removeItem(AGENT_SESSION_TOKEN_KEY);
}

export function isAgentAuthenticated() {
  return Boolean(getAgentToken());
}

export function getAgentFromToken() {
  const token = getAgentToken();
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  return {
    id: payload?.agentId || "agent",
    email: payload?.email || "",
  };
}

export function getStudentToken() {
  const token = localStorage.getItem(STUDENT_TOKEN_KEY) || "";
  if (!token) return "";

  if (isTokenExpired(token)) {
    localStorage.removeItem(STUDENT_TOKEN_KEY);
    return "";
  }

  return token;
}

export function setStudentToken(token) {
  if (!token) {
    localStorage.removeItem(STUDENT_TOKEN_KEY);
    return;
  }
  localStorage.setItem(STUDENT_TOKEN_KEY, token);
}

export function clearStudentToken() {
  localStorage.removeItem(STUDENT_TOKEN_KEY);
}

export function isStudentAuthenticated() {
  return Boolean(getStudentToken());
}

export function getStudentFromToken() {
  const token = getStudentToken();
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  return {
    id: payload?.studentId || "",
    email: payload?.email || "",
    name: payload?.name || "Student",
  };
}
