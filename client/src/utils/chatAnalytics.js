const STORAGE_KEY = "sona-chatbot:funnel:v1";

export const CHAT_FUNNEL_STEPS = [
  "widget_open",
  "auth_start",
  "auth_success",
  "chat_started",
  "agent_escalation",
];

function nowIso() {
  return new Date().toISOString();
}

function emptySnapshot() {
  const counts = {};
  for (const step of CHAT_FUNNEL_STEPS) {
    counts[step] = 0;
  }
  return {
    counts,
    lastEventAt: "",
  };
}

export function getChatFunnelSnapshot() {
  if (typeof window === "undefined" || !window.localStorage) {
    return emptySnapshot();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySnapshot();
    const parsed = JSON.parse(raw);
    const snapshot = emptySnapshot();
    for (const step of CHAT_FUNNEL_STEPS) {
      snapshot.counts[step] = Number(parsed?.counts?.[step] || 0);
    }
    snapshot.lastEventAt = String(parsed?.lastEventAt || "");
    return snapshot;
  } catch {
    return emptySnapshot();
  }
}

export function trackChatFunnelEvent(step) {
  if (!CHAT_FUNNEL_STEPS.includes(step)) return;
  if (typeof window === "undefined" || !window.localStorage) return;

  const snapshot = getChatFunnelSnapshot();
  snapshot.counts[step] += 1;
  snapshot.lastEventAt = nowIso();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota failures.
  }
}
