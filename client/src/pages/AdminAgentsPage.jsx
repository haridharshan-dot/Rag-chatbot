import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAdminAgents, getAgentToken } from "../api";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminAgentsPage() {
  const navigate = useNavigate();
  const [authToken] = useState(() => getAgentToken());
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1, search: "" });
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
      const result = await fetchAdminAgents({ page, limit: 20, search });
      setItems(result.items || []);
      setPagination(result.pagination || { page: 1, limit: 20, total: 0, totalPages: 1, search });
    } catch (error) {
      console.error(error);
      setFeedback("Unable to load agent management data.");
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
        <h2>Agents</h2>
        <p className="admin-note">Agent access directory with login and workload metrics.</p>
        <div className="admin-actions">
          <button className="pill-btn" onClick={() => navigate("/admin")}>Back to Admin</button>
          <button className="pill-btn" onClick={() => navigate("/admin/users")}>Go to Users</button>
        </div>
      </aside>

      <section className="admin-main">
        <div className="admin-main-head">
          <h3>Agent Management</h3>
          <span>Total: {pagination.total || 0}</span>
        </div>

        <form className="admin-search-bar" onSubmit={onSearchSubmit}>
          <input
            className="admin-input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by agent, email, provider"
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
                <th>Agent</th>
                <th>Provider</th>
                <th>Email</th>
                <th>Last Login</th>
                <th>IP Address</th>
                <th>Active</th>
                <th>Resolved</th>
              </tr>
            </thead>
            <tbody>
              {items.map((agent) => (
                <tr key={agent.agentId}>
                  <td>{agent.displayName || agent.agentId}</td>
                  <td>{agent.provider || "-"}</td>
                  <td>{agent.email || "-"}</td>
                  <td>{formatDate(agent.lastLoginAt)}</td>
                  <td>{agent.lastLoginIp || "-"}</td>
                  <td>{agent.activeSessions ?? 0}</td>
                  <td>{agent.resolvedSessions ?? 0}</td>
                </tr>
              ))}
              {!items.length && !loading && (
                <tr>
                  <td colSpan={7}>No agents found for this filter.</td>
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

        {loading ? <p className="admin-note">Loading agents...</p> : null}
        {feedback ? <p className="admin-feedback">{feedback}</p> : null}
      </section>
    </div>
  );
}
