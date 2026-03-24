import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusDashboard from "../components/StatusDashboard";
import {
  downloadTranscript,
  fetchAdminSessions,
  fetchAdminOverview,
  fetchAdminSettings,
  fetchDatasets,
  fetchStatusLogs,
  forceAssignSession,
  getAgentToken,
  reopenSession,
  runAdminReindex,
  runAdminStatusCheck,
  uploadDataset,
  updateAdminSettings,
} from "../api";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [authToken] = useState(() => getAgentToken());
  const [readiness, setReadiness] = useState(null);
  const [knowledge, setKnowledge] = useState(null);
  const [settings, setSettings] = useState(null);
  const [statusLogs, setStatusLogs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionFilter, setSessionFilter] = useState("queued");
  const [assignAgentId, setAssignAgentId] = useState("agent");
  const [datasets, setDatasets] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadContent, setUploadContent] = useState("");
  const [uploadPreview, setUploadPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [runningReindex, setRunningReindex] = useState(false);
  const [runningStatusCheck, setRunningStatusCheck] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (authToken) return;
    navigate("/agent", { replace: true });
  }, [authToken, navigate]);

  useEffect(() => {
    async function load() {
      try {
        const [overview, runtime, logs, queueData, datasetsData] = await Promise.all([
          fetchAdminOverview(),
          fetchAdminSettings(),
          fetchStatusLogs(),
          fetchAdminSessions(sessionFilter),
          fetchDatasets(),
        ]);
        setReadiness(overview.readiness);
        setKnowledge(overview.knowledge);
        setSettings(runtime);
        setStatusLogs(logs);
        setSessions(queueData);
        setDatasets(datasetsData);
      } catch (error) {
        console.error("Admin dashboard load failed", error);
      } finally {
        setLoading(false);
      }
    }

    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [sessionFilter]);

  async function refreshAll() {
    const [overview, runtime, logs, queueData, datasetsData] = await Promise.all([
      fetchAdminOverview(),
      fetchAdminSettings(),
      fetchStatusLogs(),
      fetchAdminSessions(sessionFilter),
      fetchDatasets(),
    ]);
    setReadiness(overview.readiness);
    setKnowledge(overview.knowledge);
    setSettings(runtime);
    setStatusLogs(logs);
    setSessions(queueData);
    setDatasets(datasetsData);
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

  async function onForceAssign(sessionId) {
    if (!assignAgentId.trim()) {
      setFeedback("Enter an agent id before force-assign.");
      return;
    }
    try {
      await forceAssignSession(sessionId, assignAgentId.trim());
      await refreshAll();
      setFeedback(`Session force-assigned to ${assignAgentId.trim()}.`);
    } catch (error) {
      console.error(error);
      setFeedback("Force-assign failed.");
    }
  }

  async function onReopen(sessionId) {
    try {
      await reopenSession(sessionId);
      await refreshAll();
      setFeedback("Session reopened and moved to queue.");
    } catch (error) {
      console.error(error);
      setFeedback("Reopen failed.");
    }
  }

  async function onDownloadTranscript(sessionId, format) {
    try {
      const blob = await downloadTranscript(sessionId, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `transcript-${sessionId}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      setFeedback("Transcript export failed.");
    }
  }

  function onPickFile(file) {
    if (!file) return;
    setUploadName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setUploadContent(text);
      setUploadPreview(text.split(/\r?\n/).slice(0, 30).join("\n"));
      setUploadOpen(true);
    };
    reader.readAsText(file);
  }

  async function onUploadDataset() {
    if (!uploadName || !uploadContent) {
      setFeedback("Select a valid dataset file first.");
      return;
    }
    setUploading(true);
    try {
      await uploadDataset(uploadName, uploadContent);
      setUploadOpen(false);
      setUploadName("");
      setUploadContent("");
      setUploadPreview("");
      await refreshAll();
      setFeedback("Dataset uploaded. Run re-index to apply new content.");
    } catch (error) {
      console.error(error);
      setFeedback(error?.response?.data?.message || "Dataset upload failed.");
    } finally {
      setUploading(false);
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
          <label className="pill-btn upload-pill">
            Upload Dataset
            <input
              type="file"
              accept=".json,.txt,.md"
              onChange={(e) => onPickFile(e.target.files?.[0])}
              hidden
            />
          </label>
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
            <div className="dataset-list">
              {(datasets || []).slice(0, 5).map((file) => (
                <p key={`${file.name}-${file.updatedAt}`}>{file.name} • {Math.round((file.size || 0) / 1024)} KB</p>
              ))}
            </div>
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

        <section className="admin-live-queue">
          <div className="admin-main-head">
            <h3>Live Queue Management</h3>
            <div className="queue-controls">
              <select
                className="admin-input"
                value={sessionFilter}
                onChange={(e) => setSessionFilter(e.target.value)}
              >
                <option value="queued">Queued</option>
                <option value="active">Active</option>
                <option value="resolved">Resolved</option>
                <option value="bot">Bot</option>
              </select>
              <input
                className="admin-input"
                value={assignAgentId}
                onChange={(e) => setAssignAgentId(e.target.value)}
                placeholder="agent id"
              />
            </div>
          </div>

          <div className="queue-table-wrap">
            <table className="queue-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Student</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const sessionId = session._id || session.id;
                  return (
                    <tr key={sessionId}>
                      <td>{sessionId?.slice(-8)}</td>
                      <td>{session.studentId}</td>
                      <td>{session.status}</td>
                      <td>{formatDate(session.updatedAt)}</td>
                      <td>
                        <div className="queue-actions">
                          <button className="pill-btn" onClick={() => onForceAssign(sessionId)}>
                            Force Assign
                          </button>
                          <button className="pill-btn" onClick={() => onReopen(sessionId)}>
                            Reopen
                          </button>
                          <button className="pill-btn" onClick={() => onDownloadTranscript(sessionId, "txt")}>
                            Export TXT
                          </button>
                          <button className="pill-btn" onClick={() => onDownloadTranscript(sessionId, "json")}>
                            Export JSON
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!sessions.length && (
                  <tr>
                    <td colSpan={5}>No sessions found for this filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

        <section className="admin-status-block">
          <StatusDashboard />
        </section>
      </section>

      {uploadOpen && (
        <div className="admin-modal-backdrop" onClick={() => setUploadOpen(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Upload Dataset Preview</h3>
            <p>{uploadName}</p>
            <pre>{uploadPreview || "No preview available"}</pre>
            <div className="admin-modal-actions">
              <button className="pill-btn" onClick={() => setUploadOpen(false)}>Cancel</button>
              <button className="pill-btn" onClick={onUploadDataset} disabled={uploading}>
                {uploading ? "Uploading..." : "Upload Dataset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
