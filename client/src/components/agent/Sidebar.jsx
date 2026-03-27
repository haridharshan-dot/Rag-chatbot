function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function getWaitMinutes(escalationRequestedAt) {
  if (!escalationRequestedAt) return 0;
  const deltaMs = Date.now() - new Date(escalationRequestedAt).getTime();
  return Math.max(0, Math.round(deltaMs / 60000));
}

function getStudentLabel(session) {
  return session?.studentName || session?.studentEmail || session?.studentId || "student";
}

function getLastMessagePreview(session) {
  const messages = Array.isArray(session?.messages) ? session.messages : [];
  const last = messages[messages.length - 1];
  return String(last?.content || "No messages yet").slice(0, 90);
}

export default function Sidebar({
  queue,
  activeSessionId,
  onOpenSession,
  socketConnected,
  lastSyncAt,
  queueLoading,
  queueError,
  avgWait,
  search,
  onSearchChange,
  reportRange,
  onReportRangeChange,
  onDownloadReport,
  reportLoading,
  onOpenAdmin,
  onOpenStatus,
  onLogout,
}) {
  return (
    <aside className="ad-sidebar">
      <div className="ad-side-top">
        <div>
          <p className="eyebrow">Live support</p>
          <h2>Agent Console</h2>
          <p className="ad-side-subtitle">Manage live conversations with real-time updates.</p>
        </div>
        <div className="ad-side-actions">
          <button type="button" className="pill-btn" onClick={onOpenAdmin}>Admin</button>
          <button type="button" className="pill-btn" onClick={onOpenStatus}>Status</button>
          <button type="button" className="ghost-btn" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="ad-kpis">
        <article>
          <span>Queue</span>
          <strong>{queue.length}</strong>
        </article>
        <article>
          <span>Avg wait</span>
          <strong>{avgWait}m</strong>
        </article>
        <article>
          <span>Socket</span>
          <strong className={socketConnected ? "state-up" : "state-down"}>
            {socketConnected ? "Online" : "Offline"}
          </strong>
        </article>
      </div>

      <div className="ad-search-wrap">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name, email, id..."
        />
      </div>

      <div className="ad-report-box">
        <div className="ad-report-head">
          <strong>Reports</strong>
          <small>Day / Week / Month PDF</small>
        </div>
        <div className="ad-report-controls">
          <select
            className="ad-report-select"
            value={reportRange}
            onChange={(event) => onReportRangeChange(event.target.value)}
          >
            <option value="day">Per Day</option>
            <option value="week">Per Week</option>
            <option value="month">Per Month</option>
          </select>
          <button
            type="button"
            className="pill-btn ad-report-download"
            onClick={onDownloadReport}
            disabled={reportLoading}
          >
            {reportLoading ? "Preparing..." : "Download PDF"}
          </button>
        </div>
      </div>

      <p className="ad-side-meta">Last sync: {formatDate(lastSyncAt)}</p>
      {queueLoading ? <p className="ad-side-meta">Refreshing queue...</p> : null}
      {queueError ? <p className="agent-error">{queueError}</p> : null}

      <div className="ad-queue-list">
        {queue.length === 0 ? (
          <p className="ad-side-meta">No students waiting right now.</p>
        ) : (
          queue.map((session) => {
            const sessionId = session?._id || session?.id;
            const wait = getWaitMinutes(session?.escalationRequestedAt);
            const active = activeSessionId === sessionId;
            const status = String(session?.status || "bot");
            const badge = status === "active" ? "Active" : "Waiting";
            const badgeClass = status === "active" ? "active" : "waiting";
            return (
              <button
                key={sessionId}
                className={`ad-queue-card ${active ? "active" : ""}`}
                onClick={() => onOpenSession(sessionId)}
              >
                <div className="ad-queue-head">
                  <strong>{getStudentLabel(session)}</strong>
                  <span className={`ad-badge ${badgeClass}`}>{badge}</span>
                </div>
                <p>{getLastMessagePreview(session)}</p>
                <div className="ad-queue-foot">
                  <small>{formatDate(session?.updatedAt || session?.escalationRequestedAt)}</small>
                  <small>{wait}m</small>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
