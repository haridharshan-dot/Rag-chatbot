function parseRupee(text, labelRegex) {
  const pattern = new RegExp(`${labelRegex}[^\\d]*(?:INR|Rs\\.?)?\\s*([\\d,]+)`, "i");
  const match = text.match(pattern);
  return match ? `INR ${match[1]}` : null;
}

function extractFees(text) {
  const tuition = parseRupee(text, "tuition(?:\\s+fee)?");
  const hostel = parseRupee(text, "hostel(?:\\s+fee)?");
  const lab = parseRupee(text, "(?:lab|exam)(?:\\s+and\\s+exam)?\\s+fee");
  const items = [
    tuition ? { key: "Tuition", value: tuition } : null,
    hostel ? { key: "Hostel", value: hostel } : null,
    lab ? { key: "Lab/Exam", value: lab } : null,
  ].filter(Boolean);
  return items;
}

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

function FeeCard({ fees }) {
  return (
    <div className="cc-rich-card">
      <h5>Fee Snapshot</h5>
      <div className="cc-rich-grid">
        {fees.map((fee) => (
          <div key={fee.key} className="cc-rich-metric">
            <span>{fee.key}</span>
            <strong>{fee.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
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
  const fees = extractFees(text);
  const courses = extractCourses(text);
  const months = extractDeadlines(text);

  if (!fees.length && !courses.length && !months.length) return null;

  return (
    <div className="cc-rich-wrap">
      {fees.length > 0 && <FeeCard fees={fees} />}
      {courses.length > 0 && <CourseCard courses={courses} />}
      <DeadlineBadges months={months} />
      <div className="cc-rich-actions">
        <button type="button" onClick={() => onAction("I want to apply now. Please guide me.")}>Apply Now</button>
        <button type="button" onClick={() => onAction("Share more details about this.")}>View Details</button>
      </div>
    </div>
  );
}
