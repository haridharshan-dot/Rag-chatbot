function extractCourses(text) {
  const matches = [...text.matchAll(/(CSE|ECE|Mechanical|Mech|Civil|IT|AI\/ML)[^\n.]{0,40}(\d\s*years?)/gi)];
  const seen = new Set();
  return matches
    .map((match) => {
      const rawName = String(match[1] || "");
      const normalizedName = rawName.toLowerCase() === "mech" ? "Mechanical" : rawName;
      return { name: normalizedName, duration: match[2] };
    })
    .filter((course) => {
      const key = `${course.name}-${course.duration}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function extractDeadlines(text) {
  const mentions = [...text.matchAll(/(January|February|March|April|May|June|July|August|September|October|November|December)/gi)]
    .map((item) => item[1]);
  return [...new Set(mentions)].slice(0, 3);
}

function detectScholarship(text) {
  return /(scholarship|stipend|financial aid|tuition waiver)/i.test(text);
}

function detectHostel(text) {
  return /(hostel|mess|accommodation|room|warden)/i.test(text);
}

function CourseCard({ courses }) {
  return (
    <div className="cc-rich-card">
      <h5>Popular Programs</h5>
      <div className="cc-course-list">
        {courses.map((course) => (
          <div key={`${course.name}-${course.duration}`} className="cc-course-item">
            <strong>{course.name}</strong>
            <span>{course.duration}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeadlineBadges({ months }) {
  if (!months.length) return null;
  return (
    <div className="cc-deadline-row">
      <span>Deadlines</span>
      <div className="cc-deadline-badges">
        {months.map((month) => (
          <b key={month}>{month}</b>
        ))}
      </div>
    </div>
  );
}

export default function RichCards({ message, onAction }) {
  const text = String(message || "");
  const courses = extractCourses(text);
  const months = extractDeadlines(text);
  const hasScholarship = detectScholarship(text);
  const hasHostel = detectHostel(text);

  if (!courses.length && !months.length && !hasScholarship && !hasHostel) return null;

  return (
    <div className="cc-rich-wrap">
      {courses.length > 0 && <CourseCard courses={courses} />}
      <DeadlineBadges months={months} />
      <div className="cc-rich-actions">
        <button type="button" onClick={() => onAction("I want to apply now. Please guide me with exact steps and required documents.")}>Apply Now</button>
        {hasScholarship ? (
          <button type="button" onClick={() => onAction("List scholarship options, eligibility, and deadlines in a table.")}>Scholarships</button>
        ) : null}
        {hasHostel ? (
          <button type="button" onClick={() => onAction("Share hostel facilities, room types, rules, and hostel admission process.")}>Hostel Info</button>
        ) : null}
      </div>
    </div>
  );
}
