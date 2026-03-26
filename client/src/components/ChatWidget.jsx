import { useEffect, useMemo, useState } from "react";
import { BRANDING } from "../config/branding";
import ChatContainer from "./chatbot/ChatContainer";
import { trackChatFunnelEvent } from "../utils/chatAnalytics";

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
        width: Math.max(320, viewportWidth - 12),
        height: Math.max(540, viewportHeight - 12),
      };
    }

    const isSmallScreen = viewportWidth <= 640;
    return isSmallScreen
      ? {
          width: Math.max(300, viewportWidth - 16),
          height: Math.round(Math.max(520, viewportHeight * 0.84)),
        }
      : {
          width: Math.max(380, Math.min(520, viewportWidth - 34)),
          height: Math.round(Math.max(640, Math.min(760, viewportHeight * 0.9))),
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
            <img src={BRANDING.chatbotLogoUrl} alt={BRANDING.chatbotLogoAlt} className="chat-fab-logo-image" />
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
