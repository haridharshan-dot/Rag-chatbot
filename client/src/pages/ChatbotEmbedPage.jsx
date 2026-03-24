import EmbeddedStudentChatbot from "../components/EmbeddedStudentChatbot";

export default function ChatbotEmbedPage() {
  return (
    <div className="chatbot-embed-page">
      <EmbeddedStudentChatbot defaultOpen={true} hideFab={true} />
    </div>
  );
}
