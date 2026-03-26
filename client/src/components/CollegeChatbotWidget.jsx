import EmbeddedStudentChatbot from "./EmbeddedStudentChatbot";

export default function CollegeChatbotWidget({ siteContext = null }) {
  return (
    <EmbeddedStudentChatbot
      defaultOpen={false}
      hideFab={false}
      siteContext={siteContext}
    />
  );
}
