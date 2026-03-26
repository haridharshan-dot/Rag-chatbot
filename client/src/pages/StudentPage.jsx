import CollegeChatbotWidget from "../components/CollegeChatbotWidget";

export default function StudentPage() {
  return (
    <div className="student-page">
      <section className="hero-card">
        <p className="eyebrow">Sona College</p>
        <h2>AI Admission Assistant</h2>
        <p>
          Use the chatbot widget to sign up, login, reset password with OTP, and chat with the
          assistant. If needed, you can also request live agent support from the same widget.
        </p>
      </section>

      <CollegeChatbotWidget />
    </div>
  );
}
