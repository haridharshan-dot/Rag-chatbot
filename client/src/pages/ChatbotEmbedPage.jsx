import { useEffect } from "react";
import { useState } from "react";
import CollegeChatbotWidget from "../components/CollegeChatbotWidget";

export default function ChatbotEmbedPage() {
  const [siteContext, setSiteContext] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.body.classList.add("chatbot-embed-mode");
    return () => {
      document.body.classList.remove("chatbot-embed-mode");
    };
  }, []);

  useEffect(() => {
    function postHeight() {
      const height = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        window.innerHeight
      );
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            type: "sona-chatbot:resize",
            height,
          },
          "*"
        );
      }
    }

    postHeight();
    window.addEventListener("resize", postHeight);
    const timer = setInterval(postHeight, 500);

    return () => {
      window.removeEventListener("resize", postHeight);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    function onMessage(event) {
      const data = event?.data;
      if (!data || data.type !== "sona-chatbot:hostContext") return;
      setSiteContext(data.context || null);
      setReady(true);
    }

    window.addEventListener("message", onMessage);
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "sona-chatbot:requestHostContext" }, "*");
    }

    const fallback = setTimeout(() => setReady(true), 700);

    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(fallback);
    };
  }, []);

  return (
    <div className="chatbot-embed-page">
      {ready ? (
        <CollegeChatbotWidget siteContext={siteContext} />
      ) : null}
    </div>
  );
}
