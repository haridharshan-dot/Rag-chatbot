import { useEffect, useMemo, useState } from "react";
import ChatContainer from "./chatbot/ChatContainer";
import { trackChatFunnelEvent } from "../utils/chatAnalytics";

function BotIcon() {
  return (
    <svg className="chat-fab-bot-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="7" width="16" height="12" rx="4" fill="currentColor" opacity="0.14" />
      <rect x="6" y="9" width="12" height="9" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="10" cy="13" r="1.1" fill="currentColor" />
      <circle cx="14" cy="13" r="1.1" fill="currentColor" />
      <path d="M9 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 6V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function ChatWidget({
  sessionId,
  studentId,
  loading,
  error = "",
  onRetry,
  defaultOpen = false,
  hideFab = false,
  preChatContent = null,
  chatContainerProps = {},
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewport, setViewport] = useState({
    width: window.innerWidth || 420,
    height: window.innerHeight || 700,
  });

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  useEffect(() => {
    const onResize = () => {
      setViewport({
        width: window.innerWidth || 420,
        height: window.innerHeight || 700,
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (viewport.width <= 760) {
      setIsFullscreen(true);
    }
  }, [open, viewport.width]);

  useEffect(() => {
    if (!open) return;
    trackChatFunnelEvent("widget_open");
  }, [open]);

  const openDimensions = useMemo(() => {
    const viewportWidth = viewport.width;
    const viewportHeight = viewport.height;

      if (isFullscreen) {
        return {
        width: Math.max(320, viewportWidth - 6),
        height: Math.max(560, viewportHeight - 6),
      };
    }

    const isSmallScreen = viewportWidth <= 640;
    return isSmallScreen
      ? {
          width: Math.max(300, viewportWidth - 8),
          height: Math.round(Math.max(560, viewportHeight * 0.94)),
        }
      : {
          width: Math.max(400, Math.min(540, viewportWidth - 24)),
          height: Math.round(Math.max(680, Math.min(840, viewportHeight * 0.94))),
        };
  }, [isFullscreen, viewport.height, viewport.width]);

  useEffect(() => {
    const closedDimensions = { width: 124, height: 92 };

    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          type: "sona-chatbot:state",
          open,
          dimensions: open ? openDimensions : closedDimensions,
        },
        "*"
      );
    }
  }, [open, openDimensions]);

  return (
    <>
      {!hideFab && !open && (
        <button className="chat-fab chat-fab-logo cc-launcher" onClick={() => setOpen(true)} aria-label="Open Sona chatbot">
          <span className="chat-fab-label">Ask AI</span>
          <span className="chat-fab-logo-card">
            <span className="chat-fab-bot-icon-wrap" aria-hidden="true">
              <BotIcon />
            </span>
          </span>
        </button>
      )}

      {open && (
        <aside className={`chat-widget cc-widget ${isFullscreen ? "cc-widget-full" : ""}`}>
          {preChatContent ? (
            typeof preChatContent === "function" ? (
              preChatContent({
                onClose: () => {
                  setIsFullscreen(false);
                  setOpen(false);
                },
              })
            ) : (
              preChatContent
            )
          ) : error && !loading && !sessionId ? (
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
              {...chatContainerProps}
            />
          )}
        </aside>
      )}
    </>
  );
}
