import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAdminUsers, getAgentToken } from "../api";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function isLikelyPublicIp(value) {
  const ip = String(value || "").trim();
  if (!ip || ip === "-") return false;
  if (ip.startsWith("10.")) return false;
  if (ip.startsWith("192.168.")) return false;
  if (ip.startsWith("172.")) {
    const block = Number(ip.split(".")[1] || 0);
    if (block >= 16 && block <= 31) return false;
  }
  return true;
}

export default function AdminUsersPage() {
  const PAGE_SIZE = 10;
  const navigate = useNavigate();
  const [authToken] = useState(() => getAgentToken());
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1, search: "" });
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (authToken) return;
    navigate("/agent", { replace: true });
  }, [authToken, navigate]);

  async function load(page = 1, search = "") {
    setLoading(true);
    setFeedback("");
    try {
      const result = await fetchAdminUsers({ page, limit: PAGE_SIZE, search });
      setItems(result.items || []);
      setPagination(result.pagination || { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1, search });
    } catch (error) {
      console.error(error);
      setFeedback("Unable to load user management data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1, "");
  }, []);

  function onSearchSubmit(event) {
    event.preventDefault();
    load(1, searchInput.trim());
  }

  function goPage(nextPage) {
    const page = Math.max(1, Math.min(nextPage, pagination.totalPages || 1));
    load(page, pagination.search || "");
  }

  return (
    <div className="admin-layout">
      <aside className="admin-side">
        <p className="eyebrow">Administration</p>
        <h2>Users</h2>
        <p className="admin-note">Student sessions directory with latest status and network metadata.</p>
        <div className="admin-actions">
          <button className="pill-btn" onClick={() => navigate("/admin")}>Back to Admin</button>
          <button className="pill-btn" onClick={() => navigate("/admin/agents")}>Go to Agents</button>
        </div>
      </aside>

      <section className="admin-main">
        <div className="admin-main-head">
          <h3>User Management</h3>
          <span>Total: {pagination.total || 0}</span>
        </div>

        <form className="admin-search-bar" onSubmit={onSearchSubmit}>
          <input
            className="admin-input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by student, status, agent, ip"
          />
          <button className="pill-btn" type="submit">Search</button>
          <button
            className="pill-btn"
            type="button"
            onClick={() => {
              setSearchInput("");
              load(1, "");
            }}
          >
            Reset
          </button>
        </form>

        <div className="queue-table-wrap">
          <table className="queue-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Sessions</th>
                <th>Current Status</th>
                <th>Assigned Agent</th>
                <th>Last Seen</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.studentId}>
                  <td>{user.studentId}</td>
                  <td>{user.sessions}</td>
                  <td>{user.currentStatus || "-"}</td>
                  <td>{user.assignedAgentId || "-"}</td>
                  <td>{formatDate(user.lastSeenAt)}</td>
                  <td>
                    {isLikelyPublicIp(user.lastIp) ? (
                      <span className="ip-map-wrap">
                        <a
                          className="ip-map-link"
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(user.lastIp)}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Open approximate geo lookup in Google Maps"
                        >
                          {user.lastIp}
                        </a>
                        <span className="ip-map-pop" aria-hidden="true">Maps</span>
                      </span>
                    ) : (
                      user.lastIp || "-"
                    )}
                  </td>
                </tr>
              ))}
              {!items.length && !loading && (
                <tr>
                  <td colSpan={6}>No users found for this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-pagination">
          <button className="pill-btn" onClick={() => goPage(1)} disabled={pagination.page <= 1}>First</button>
          <button className="pill-btn" onClick={() => goPage(pagination.page - 1)} disabled={pagination.page <= 1}>Prev</button>
          <span>Page {pagination.page} / {pagination.totalPages || 1}</span>
          <button
            className="pill-btn"
            onClick={() => goPage(pagination.page + 1)}
            disabled={pagination.page >= (pagination.totalPages || 1)}
          >
            Next
          </button>
        </div>

        {loading ? <p className="admin-note">Loading users...</p> : null}
        {feedback ? <p className="admin-feedback">{feedback}</p> : null}
      </section>
    </div>
  );
}
