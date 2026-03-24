import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusDashboard from "../components/StatusDashboard";
import {
  fetchAdminOverview,
  fetchAdminSettings,
  fetchStatusLogs,
  runAdminReindex,
  runAdminStatusCheck,
  updateAdminSettings,
} from "../api";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [readiness, setReadiness] = useState(null);
  const [knowledge, setKnowledge] = useState(null);
  const [settings, setSettings] = useState(null);
  const [statusLogs, setStatusLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [runningReindex, setRunningReindex] = useState(false);
  const [runningStatusCheck, setRunningStatusCheck] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [overview, runtime, logs] = await Promise.all([
          fetchAdminOverview(),
          fetchAdminSettings(),
          fetchStatusLogs(),
        ]);
        setReadiness(overview.readiness);
        setKnowledge(overview.knowledge);
        setSettings(runtime);
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

  async function refreshAll() {
    const [overview, runtime, logs] = await Promise.all([
      fetchAdminOverview(),
      fetchAdminSettings(),
      fetchStatusLogs(),
    ]);
    setReadiness(overview.readiness);
    setKnowledge(overview.knowledge);
    setSettings(runtime);
    setStatusLogs(logs);
  }

  async function onSaveSettings() {
    if (!settings) return;
    setSavingSettings(true);
    setFeedback("");
    try {
      const updated = await updateAdminSettings(settings);
      setSettings(updated);
      setFeedback("Escalation and access settings updated.");
    } catch (error) {
      console.error(error);
      setFeedback("Failed to save settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function onReindex() {
    setRunningReindex(true);
    setFeedback("");
    try {
      const result = await runAdminReindex();
      await refreshAll();
      setFeedback(`Re-index complete (${result.chunkCount} chunks to ${result.provider}).`);
    } catch (error) {
      console.error(error);
      setFeedback("Re-index failed.");
    } finally {
      setRunningReindex(false);
    }
  }

  async function onRecordStatus() {
    setRunningStatusCheck(true);
    setFeedback("");
    try {
      await runAdminStatusCheck();
      await refreshAll();
      setFeedback("Status check recorded.");
    } catch (error) {
      console.error(error);
      setFeedback("Status check failed.");
    } finally {
      setRunningStatusCheck(false);
    }
  }

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
            <p>Source files: {knowledge?.sourceFileCount ?? 0} • Chunks: {knowledge?.chunkCount ?? 0}</p>
            <p>Last ingest: {formatDate(knowledge?.lastIngestedAt)}</p>
            <button className="pill-btn" onClick={onReindex} disabled={runningReindex}>
              {runningReindex ? "Re-indexing..." : "Re-index Knowledge Base"}
            </button>
          </article>
          <article className="manage-card">
            <h4>Agent Access</h4>
            <p>Manage Microsoft allow-list to control who can access live support console.</p>
            <input
              className="admin-input"
              value={(settings?.microsoftAllowedDomains || []).join(",")}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  microsoftAllowedDomains: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                }))
              }
              placeholder="allowed domains (comma-separated)"
            />
            <input
              className="admin-input"
              value={(settings?.microsoftAllowedEmails || []).join(",")}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  microsoftAllowedEmails: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                }))
              }
              placeholder="allowed emails (optional, comma-separated)"
            />
          </article>
          <article className="manage-card">
            <h4>Escalation Policy</h4>
            <p>Fine-tune retrieval and escalation thresholds.</p>
            <div className="admin-field-grid">
              <label>
                Top K
                <input
                  className="admin-input"
                  type="number"
                  min="1"
                  max="12"
                  value={settings?.ragTopK ?? 5}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, ragTopK: Number(e.target.value || 5) }))
                  }
                />
              </label>
              <label>
                Confidence Threshold
                <input
                  className="admin-input"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={settings?.ragConfidenceThreshold ?? 0.6}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      ragConfidenceThreshold: Number(e.target.value || 0.6),
                    }))
                  }
                />
              </label>
              <label>
                Out-of-Scope Threshold
                <input
                  className="admin-input"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={settings?.ragOutOfScopeThreshold ?? 0.45}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      ragOutOfScopeThreshold: Number(e.target.value || 0.45),
                    }))
                  }
                />
              </label>
            </div>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={Boolean(settings?.autoEscalationEnabled)}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, autoEscalationEnabled: e.target.checked }))
                }
              />
              Enable auto-escalation for out-of-scope questions
            </label>
            <button className="pill-btn" onClick={onSaveSettings} disabled={savingSettings}>
              {savingSettings ? "Saving..." : "Save Policy"}
            </button>
          </article>
          <article className="manage-card">
            <h4>Service Integrity</h4>
            <p>Run immediate health checks and write status logs on demand.</p>
            <button className="pill-btn" onClick={onRecordStatus} disabled={runningStatusCheck}>
              {runningStatusCheck ? "Running..." : "Record Status Now"}
            </button>
            <p>
              API: {readiness?.apiStatus?.toUpperCase() || "UNKNOWN"} • LLM: {readiness?.llmStatus?.toUpperCase() || "UNKNOWN"}
            </p>
          </article>
        </div>

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        <section className="admin-status-block">
          <StatusDashboard />
        </section>
      </section>
    </div>
  );
}
