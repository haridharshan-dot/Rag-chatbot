import { useEffect } from "react";
import EmbeddedStudentChatbot from "../components/EmbeddedStudentChatbot";

export default function ChatbotEmbedPage() {
  useEffect(() => {
    function postHeight() {
      const height = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        window.innerHeight
      );
      window.parent?.postMessage(
        {
          type: "sona-chatbot:resize",
          height,
        },
        "*"
      );
    }

    postHeight();
    window.addEventListener("resize", postHeight);
    const timer = setInterval(postHeight, 500);

    return () => {
      window.removeEventListener("resize", postHeight);
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="chatbot-embed-page">
      <EmbeddedStudentChatbot defaultOpen={true} hideFab={true} />
    </div>
  );
}
