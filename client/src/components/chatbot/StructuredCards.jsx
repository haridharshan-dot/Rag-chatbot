function CourseRecommendationCard({ card }) {
  return (
    <div className="cc-rich-card">
      <h5>{card.title || "Recommended Courses"}</h5>
      <div className="cc-course-list">
        {(card.items || []).map((item, index) => (
          <div className="cc-course-item" key={`${item.branch || item.label || "item"}-${index}`}>
            <strong>{item.branch || item.label || "Course"}</strong>
            {item.chance ? <span>{item.chance} chance</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChecklistCard({ card }) {
  return (
    <div className="cc-rich-card">
      <h5>{card.title || "Checklist"}</h5>
      <ul className="cc-md-list">
        {(card.items || []).map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function AlertsCard({ card }) {
  return (
    <div className="cc-rich-card">
      <h5>{card.title || "Alerts"}</h5>
      <div className="cc-course-list">
        {(card.items || []).map((item, index) => (
          <div className="cc-course-item" key={`${item.title || "alert"}-${index}`}>
            <strong>{item.title || "Alert"}</strong>
            <span>{item.date || item.detail || "Check latest update"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EligibilityCard({ card }) {
  return (
    <div className="cc-rich-card">
      <h5>{card.title || "Eligibility Summary"}</h5>
      <div className="cc-course-list">
        {(card.items || []).map((item, index) => (
          <div className="cc-course-item" key={`${item.label || "eligible"}-${index}`}>
            <strong>{item.label || "Eligible"}</strong>
          </div>
        ))}
      </div>
      {(card.warnings || []).length ? (
        <div className="cc-rich-actions">
          {(card.warnings || []).map((warning, index) => (
            <button type="button" key={`${warning}-${index}`} className="cc-rich-warning">
              {warning}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function StructuredCards({ cards = [] }) {
  if (!Array.isArray(cards) || !cards.length) return null;

  return (
    <div className="cc-rich-wrap">
      {cards.map((card, index) => {
        const type = String(card?.type || "").toLowerCase();
        if (type === "course_recommendation") return <CourseRecommendationCard key={`card-${index}`} card={card} />;
        if (type === "checklist") return <ChecklistCard key={`card-${index}`} card={card} />;
        if (type === "alerts") return <AlertsCard key={`card-${index}`} card={card} />;
        if (type === "eligibility") return <EligibilityCard key={`card-${index}`} card={card} />;
        return null;
      })}
    </div>
  );
}
