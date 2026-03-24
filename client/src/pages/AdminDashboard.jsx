import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusDashboard from "../components/StatusDashboard";
import { fetchReadiness, fetchStatusLogs } from "../api";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [readiness, setReadiness] = useState(null);
  const [statusLogs, setStatusLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [ready, logs] = await Promise.all([fetchReadiness(), fetchStatusLogs()]);
        setReadiness(ready);
        setStatusLogs(logs);
      } catch (error) {
        console.error("Admin dashboard load failed", error);
      } finally {
        setLoading(false);
      }
    }

    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);

  const kpis = useMemo(() => {
    const apiUp = statusLogs.filter((log) => log.apiStatus === "up").length;
    const llmUp = statusLogs.filter((log) => log.llmStatus === "up").length;
    const total = statusLogs.length || 1;
    return {
      apiUptime: Math.round((apiUp / total) * 100),
      llmUptime: Math.round((llmUp / total) * 100),
      totalLogs: statusLogs.length,
    };
  }, [statusLogs]);

  return (
    <div className="admin-layout">
      <aside className="admin-side">
        <p className="eyebrow">Administration</p>
        <h2>Control Center</h2>
        <p className="admin-note">
          Centralized operations panel for service monitoring, escalation governance, and support workflows.
        </p>

        <div className="admin-kpi-grid">
          <article className="admin-kpi">
            <span>Readiness</span>
            <strong>{readiness?.status ? readiness.status.toUpperCase() : loading ? "LOADING" : "UNKNOWN"}</strong>
          </article>
          <article className="admin-kpi">
            <span>API Uptime</span>
            <strong>{kpis.apiUptime}%</strong>
          </article>
          <article className="admin-kpi">
            <span>LLM Uptime</span>
            <strong>{kpis.llmUptime}%</strong>
          </article>
          <article className="admin-kpi">
            <span>Logs (7d)</span>
            <strong>{kpis.totalLogs}</strong>
          </article>
        </div>

        <div className="admin-actions">
          <button className="pill-btn" onClick={() => navigate("/agent")}>Agent Dashboard</button>
          <button className="pill-btn" onClick={() => navigate("/status")}>Status Dashboard</button>
          <button className="pill-btn" onClick={() => navigate("/")}>Student Portal</button>
        </div>
      </aside>

      <section className="admin-main">
        <div className="admin-main-head">
          <h3>Operations Overview</h3>
          <span>Updated: {formatDate(readiness?.timestamp)}</span>
        </div>

        <div className="admin-manage-grid">
          <article className="manage-card">
            <h4>Knowledge Base</h4>
            <p>Maintain curriculum, cutoffs, and admission rules in source data and re-ingest after updates.</p>
          </article>
          <article className="manage-card">
            <h4>Agent Access</h4>
            <p>Review Microsoft allow-list domains and credentials policy before each admission cycle.</p>
          </article>
          <article className="manage-card">
            <h4>Escalation Policy</h4>
            <p>Fine-tune RAG confidence thresholds to balance automation with fast human handoff.</p>
          </article>
          <article className="manage-card">
            <h4>Service Integrity</h4>
            <p>Track readiness, socket stability, and response trends for reliable live support.</p>
          </article>
        </div>

        <section className="admin-status-block">
          <StatusDashboard />
        </section>
      </section>
    </div>
  );
}
