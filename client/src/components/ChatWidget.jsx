import { useEffect, useMemo, useState } from "react";
import { BRANDING } from "../config/branding";
import ChatContainer from "./chatbot/ChatContainer";

export default function ChatWidget({
  sessionId,
  studentId,
  loading,
  error = "",
  onRetry,
  defaultOpen = false,
  hideFab = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewport, setViewport] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 420,
    height: typeof window !== "undefined" ? window.innerHeight : 700,
  });

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  useEffect(() => {
    const onResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Auto-fullscreen on small screens
  const isMobile = useMemo(() => viewport.width <= 640, [viewport.width]);

  useEffect(() => {
    if (!open) return;
    if (isMobile) {
      setIsFullscreen(true);
    }
  }, [open, isMobile]);

  const openDimensions = useMemo(() => {
    if (isFullscreen || isMobile) {
      return {
        width: viewport.width,
        height: viewport.height,
      };
    }

    // Standard desktop floating widget dimensions
    return {
      width: 400,
      height: 600,
    };
  }, [isFullscreen, isMobile, viewport.height, viewport.width]);

  useEffect(() => {
    const closedDimensions = { width: 124, height: 92 };

    window.parent?.postMessage(
      {
        type: "sona-chatbot:state",
        open,
        dimensions: open ? openDimensions : closedDimensions,
      },
      "*"
    );
  }, [open, openDimensions]);

  return (
    <>
      {!hideFab && !open && (
        <button className="chat-fab chat-fab-logo cc-launcher" onClick={() => setOpen(true)} aria-label="Open Sona chatbot">
          <span className="chat-fab-label">Ask AI</span>
          <span className="chat-fab-logo-card">
            <img src={BRANDING.chatbotLogoUrl} alt={BRANDING.chatbotLogoAlt} className="chat-fab-logo-image" />
          </span>
        </button>
      )}

      {open && (
        <aside className={`chat-widget cc-widget ${isFullscreen ? "cc-widget-full" : ""}`}>
          {error && !loading && !sessionId ? (
            <section className="cc-shell cc-error-shell">
              <div className="cc-error-content">
                <h3>Chat unavailable</h3>
                <p>{error}</p>
                <button className="cc-send" onClick={onRetry}>Retry</button>
              </div>
            </section>
          ) : (
            <ChatContainer
              sessionId={sessionId}
              studentId={studentId}
              loading={loading}
              isFullscreen={isFullscreen}
              setFullscreen={setIsFullscreen}
              onClose={() => {
                setIsFullscreen(false);
                setOpen(false);
              }}
            />
          )}
        </aside>
      )}
    </>
  );
}
