import { useEffect, useMemo, useState } from "react";
import ChatWidget from "./ChatWidget";
import { createSession } from "../api";

let transientStudentId = "";

function getOrCreateStudentId(storageKey) {
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;
    const generated = `stu-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    if (!transientStudentId) {
      transientStudentId = `stu-${Math.random().toString(36).slice(2, 10)}`;
    }
    return transientStudentId;
  }
}

export default function EmbeddedStudentChatbot({
  studentId: providedStudentId,
  defaultOpen = false,
  hideFab = false,
  siteContext = null,
}) {
  const studentId = useMemo(
    () => providedStudentId || getOrCreateStudentId("student-id"),
    [providedStudentId]
  );
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function startSession() {
      setLoading(true);
      setError("");
      try {
        const session = await createSession(studentId, siteContext);
        if (mounted) {
          setSessionId(session._id || session.id);
        }
      } catch (error) {
        console.error("Failed to create chatbot session", error);
        if (mounted) {
          setSessionId("");
          setError("Unable to start chat session. Please retry.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    startSession();
    return () => {
      mounted = false;
    };
  }, [studentId, siteContext]);

  return (
    <ChatWidget
      sessionId={sessionId}
      studentId={studentId}
      loading={loading}
      error={error}
      onRetry={() => {
        setSessionId("");
        setError("");
        setLoading(true);
        createSession(studentId, siteContext)
          .then((session) => {
            setSessionId(session._id || session.id);
          })
          .catch((retryError) => {
            console.error("Retry create session failed", retryError);
            setError("Unable to start chat session. Please retry.");
          })
          .finally(() => setLoading(false));
      }}
      defaultOpen={defaultOpen}
      hideFab={hideFab}
    />
  );
}
