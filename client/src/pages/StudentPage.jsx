import EmbeddedStudentChatbot from "../components/EmbeddedStudentChatbot";

export default function StudentPage() {
  return (
    <div className="student-page">
      <section className="hero-card">
        <p className="eyebrow">Student Portal</p>
        <h2>College Admission Assistant</h2>
        <p>
          Ask about eligibility, fee details, cutoffs, course options, and deadlines.
          The AI assistant answers from your college dataset and can connect you with
          a live support agent when needed.
        </p>
      </section>

      <EmbeddedStudentChatbot />
    </div>
  );
}
