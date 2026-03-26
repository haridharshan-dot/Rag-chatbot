import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusDashboard from "../components/StatusDashboard";
import {
  downloadTranscript,
  downloadDataset,
  fetchAdminReport,
  removeDataset,
  fetchAdminSessions,
  fetchAdminOverview,
  fetchAdminSettings,
  fetchDatasetPreview,
  fetchDatasets,
  fetchStatusLogs,
  forceAssignSession,
  getAgentToken,
  reopenSession,
  runAdminReindex,
  runAdminStatusCheck,
  runAdminOtpProviderHealthCheck,
  runAdminWarmRag,
  uploadDataset,
  updateAdminSettings,
} from "../api";
import { downloadDashboardReportPdf } from "../utils/reportPdf";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildHighlightedPreview(text, query, currentMatchIndex) {
  const source = String(text || "");
  const q = String(query || "").trim();
  if (!q) {
    return {
      html: escapeHtml(source),
      count: 0,
    };
  }

  const regex = new RegExp(escapeRegExp(q), "gi");
  let cursor = 0;
  let count = 0;
  let html = "";
  let match = regex.exec(source);

  while (match) {
    html += escapeHtml(source.slice(cursor, match.index));
    const className = count === currentMatchIndex ? "preview-match current-match" : "preview-match";
    html += `<mark class="${className}">${escapeHtml(match[0])}</mark>`;
    cursor = match.index + match[0].length;
    count += 1;
    match = regex.exec(source);
  }

  html += escapeHtml(source.slice(cursor));

  return {
    html,
    count,
  };
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
  const [datasetPreviewOpen, setDatasetPreviewOpen] = useState(false);
  const [siteConfigOpen, setSiteConfigOpen] = useState(false);
  const [datasetPreviewMeta, setDatasetPreviewMeta] = useState(null);
  const [datasetPreviewText, setDatasetPreviewText] = useState("");
  const [datasetPreviewSearch, setDatasetPreviewSearch] = useState("");
  const [datasetPreviewExpanded, setDatasetPreviewExpanded] = useState(false);
  const [datasetPreviewTruncated, setDatasetPreviewTruncated] = useState(false);
  const [datasetCurrentMatch, setDatasetCurrentMatch] = useState(0);
  const [previewLoadingName, setPreviewLoadingName] = useState("");
  const [datasetDownloading, setDatasetDownloading] = useState(false);
  const [datasetRemovingName, setDatasetRemovingName] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [reportRange, setReportRange] = useState("week");
  const [reportLoading, setReportLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState("control");
  const [savingSettings, setSavingSettings] = useState(false);
  const [runningReindex, setRunningReindex] = useState(false);
  const [runningStatusCheck, setRunningStatusCheck] = useState(false);
  const [runningOtpProviderCheck, setRunningOtpProviderCheck] = useState(false);
  const [warmingRag, setWarmingRag] = useState(false);
  const [otpProviderHealth, setOtpProviderHealth] = useState(null);
  const [feedback, setFeedback] = useState("");
  const previewRef = useRef(null);

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
          if (error?.response?.status === 401) {
            setFeedback("Session expired. Please login again.");
            return;
          }
          setFeedback("Some admin data could not be loaded. Backend may still be deploying.");
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

  async function onWarmRag() {
    setWarmingRag(true);
    setFeedback("");
    try {
      await runAdminWarmRag();
      await refreshAll();
      setFeedback("RAG warm-up complete.");
    } catch (error) {
      console.error(error);
      setFeedback(error?.response?.data?.message || "RAG warm-up failed.");
    } finally {
      setWarmingRag(false);
    }
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

  async function onCheckOtpProviders() {
    setRunningOtpProviderCheck(true);
    setFeedback("");
    try {
      const health = await runAdminOtpProviderHealthCheck();
      setOtpProviderHealth(health);
      if (health?.overallReady) {
        setFeedback("OTP provider check complete. At least one channel is ready.");
      } else {
        setFeedback("OTP provider check complete. Configure SMTP or Twilio to enable live delivery.");
      }
    } catch (error) {
      console.error(error);
      setFeedback(error?.response?.data?.message || "OTP provider check failed.");
    } finally {
      setRunningOtpProviderCheck(false);
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

  async function onPreviewDataset(fileName) {
    setPreviewLoadingName(fileName);
    setPreviewLoading(true);
    setFeedback("");
    try {
      const data = await fetchDatasetPreview(fileName);
      setDatasetPreviewMeta({
        name: data.name,
        size: data.size,
        updatedAt: data.updatedAt,
      });
      setDatasetPreviewText(data.preview || "No preview available");
      setDatasetPreviewTruncated(Boolean(data.truncated));
      setDatasetPreviewExpanded(false);
      setDatasetPreviewSearch("");
      setDatasetCurrentMatch(0);
      setDatasetPreviewOpen(true);
    } catch (error) {
      console.error(error);
      setFeedback(error?.response?.data?.message || "Dataset preview failed.");
    } finally {
      setPreviewLoading(false);
      setPreviewLoadingName("");
    }
  }

  async function onToggleExpandPreview() {
    if (!datasetPreviewMeta?.name) return;
    if (datasetPreviewExpanded) {
      setDatasetPreviewExpanded(false);
      return;
    }

    if (!datasetPreviewTruncated) {
      setDatasetPreviewExpanded(true);
      return;
    }

    setPreviewLoading(true);
    try {
      const data = await fetchDatasetPreview(datasetPreviewMeta.name, true);
      setDatasetPreviewText(data.preview || "No preview available");
      setDatasetPreviewExpanded(true);
      setDatasetPreviewTruncated(false);
      setDatasetCurrentMatch(0);
    } catch (error) {
      console.error(error);
      setFeedback(error?.response?.data?.message || "Failed to load full preview.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function onDownloadDatasetFile() {
    if (!datasetPreviewMeta?.name) return;
    setDatasetDownloading(true);
    try {
      const blob = await downloadDataset(datasetPreviewMeta.name);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = datasetPreviewMeta.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      setFeedback(error?.response?.data?.message || "Dataset download failed.");
    } finally {
      setDatasetDownloading(false);
    }
  }

  async function onRemoveDatasetFile(fileName) {
    if (!fileName) return;
    const confirmed = window.confirm(`Remove dataset ${fileName}? This will trigger re-index.`);
    if (!confirmed) return;

    setDatasetRemovingName(fileName);
    setFeedback("");
    try {
      const result = await removeDataset(fileName);
      if (datasetPreviewMeta?.name === fileName) {
        setDatasetPreviewOpen(false);
        setDatasetPreviewMeta(null);
      }
      await refreshAll();
      setFeedback(
        result?.reindexError
          ? `Dataset removed, but re-index failed: ${result.reindexError}`
          : "Dataset removed and RAG re-indexed."
      );
    } catch (error) {
      console.error(error);
      setFeedback(error?.response?.data?.message || "Failed to remove dataset.");
    } finally {
      setDatasetRemovingName("");
    }
  }

  async function onCopyPreview() {
    try {
      await navigator.clipboard.writeText(datasetPreviewText || "");
      setFeedback("Preview copied to clipboard.");
    } catch {
      setFeedback("Copy failed. Clipboard permission blocked.");
    }
  }

  async function onDownloadAdminReport() {
    setReportLoading(true);
    setFeedback("");
    try {
      const report = await fetchAdminReport(reportRange);
      const summary = report?.summary || {};
      const items = Array.isArray(report?.items) ? report.items : [];

      const tableRows = items.map((item) => [
        String(item.sessionId || "-").slice(-8),
        item.studentId || "-",
        item.status || "-",
        item.agentId || "-",
        item.messageCount ?? 0,
        formatDate(item.updatedAt),
      ]);

      downloadDashboardReportPdf({
        title: "Admin Dashboard Report",
        range: report?.range || reportRange,
        generatedAt: report?.generatedAt || new Date().toISOString(),
        startDate: report?.startDate,
        summaryRows: [
          { label: "Total Sessions", value: summary.totalSessions ?? 0 },
          { label: "Queued", value: summary.queuedSessions ?? 0 },
          { label: "Active", value: summary.activeSessions ?? 0 },
          { label: "Resolved", value: summary.resolvedSessions ?? 0 },
          { label: "Bot", value: summary.botSessions ?? 0 },
          { label: "Escalated", value: summary.escalatedSessions ?? 0 },
          { label: "Avg Resolution (min)", value: summary.avgResolutionMinutes ?? 0 },
        ],
        tableColumns: ["Session", "Student", "Status", "Agent", "Messages", "Updated"],
        tableRows,
        fileName: `admin-report-${report?.range || reportRange}.pdf`,
      });
      setFeedback("Admin report downloaded successfully.");
    } catch (error) {
      console.error(error);
      setFeedback("Failed to download admin report.");
    } finally {
      setReportLoading(false);
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

  const frontendConfig = useMemo(
    () => ({
      msClientId: Boolean(import.meta.env.VITE_MS_CLIENT_ID),
      msTenantId: Boolean(import.meta.env.VITE_MS_TENANT_ID),
      msRedirectUri: Boolean(import.meta.env.VITE_MS_REDIRECT_URI),
    }),
    []
  );

  const siteChecklist = useMemo(() => {
    const backend = readiness?.siteConfig?.backend || {};
    const runtimeEnabled = Boolean(settings?.microsoftAuthEnabled);

    const checks = [
      {
        key: "runtimeToggle",
        label: "Runtime toggle (Enable Microsoft SSO)",
        ok: runtimeEnabled,
      },
      {
        key: "backendEnv",
        label: "Render MICROSOFT_AUTH_ENABLED",
        ok: Boolean(backend.microsoftAuthEnvEnabled),
      },
      {
        key: "backendDomains",
        label: "Render MICROSOFT_ALLOWED_DOMAINS",
        ok: Boolean(backend.microsoftAllowedDomainsConfigured),
      },
      {
        key: "frontendClient",
        label: "Vercel VITE_MS_CLIENT_ID",
        ok: frontendConfig.msClientId,
      },
      {
        key: "frontendTenant",
        label: "Vercel VITE_MS_TENANT_ID",
        ok: frontendConfig.msTenantId,
      },
      {
        key: "frontendRedirect",
        label: "Vercel VITE_MS_REDIRECT_URI",
        ok: frontendConfig.msRedirectUri,
      },
    ];

    const ready = checks.every((item) => item.ok);
    return { checks, ready };
  }, [readiness, settings, frontendConfig]);

  const previewRender = useMemo(
    () => buildHighlightedPreview(datasetPreviewText || "No preview available", datasetPreviewSearch, datasetCurrentMatch),
    [datasetPreviewText, datasetPreviewSearch, datasetCurrentMatch]
  );

  const lastStatusCheckAt = useMemo(() => {
    const latest = Array.isArray(statusLogs) && statusLogs.length ? statusLogs[0] : null;
    return latest?.checkedAt || latest?.createdAt || latest?.timestamp || null;
  }, [statusLogs]);

  const otpReadyLabel = useMemo(() => {
    if (!otpProviderHealth) return "Not checked";
    return otpProviderHealth.overallReady ? "Ready" : "Not ready";
  }, [otpProviderHealth]);

  useEffect(() => {
    setDatasetCurrentMatch(0);
  }, [datasetPreviewSearch, datasetPreviewText]);

  useEffect(() => {
    if (!previewRender.count) return;
    if (datasetCurrentMatch < previewRender.count) return;
    setDatasetCurrentMatch(previewRender.count - 1);
  }, [previewRender.count, datasetCurrentMatch]);

  useEffect(() => {
    if (!datasetPreviewOpen) return;
    const root = previewRef.current;
    if (!root) return;
    const marks = root.querySelectorAll("mark.preview-match");
    if (!marks.length) return;
    const target = marks[Math.max(0, Math.min(datasetCurrentMatch, marks.length - 1))];
    target.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [datasetCurrentMatch, datasetPreviewOpen, previewRender.html]);

  function onPrevMatch() {
    if (!previewRender.count) return;
    setDatasetCurrentMatch((prev) => (prev - 1 + previewRender.count) % previewRender.count);
  }

  function onNextMatch() {
    if (!previewRender.count) return;
    setDatasetCurrentMatch((prev) => (prev + 1) % previewRender.count);
  }

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

        <div className="admin-view-tabs" role="tablist" aria-label="Admin sections">
          <button
            className={`admin-view-tab ${activeView === "control" ? "active" : ""}`}
            role="tab"
            aria-selected={activeView === "control"}
            onClick={() => setActiveView("control")}
          >
            Control Center
          </button>
          <button
            className={`admin-view-tab ${activeView === "queue" ? "active" : ""}`}
            role="tab"
            aria-selected={activeView === "queue"}
            onClick={() => setActiveView("queue")}
          >
            Queue & Teams
          </button>
          <button
            className={`admin-view-tab ${activeView === "status" ? "active" : ""}`}
            role="tab"
            aria-selected={activeView === "status"}
            onClick={() => setActiveView("status")}
          >
            Live Status
          </button>
        </div>

        {activeView === "control" && (
          <div className="admin-chip-row" aria-label="Control center quick metrics">
            <article className="admin-chip">
              <span>Knowledge Chunks</span>
              <strong>{knowledge?.chunkCount ?? 0}</strong>
            </article>
            <article className="admin-chip">
              <span>Dataset Files</span>
              <strong>{datasets?.length ?? 0}</strong>
            </article>
            <article className="admin-chip">
              <span>Report Range</span>
              <strong>{String(reportRange || "week").toUpperCase()}</strong>
            </article>
            <article className="admin-chip">
              <span>Policy State</span>
              <strong>{settings?.autoEscalationEnabled ? "Auto Escalate ON" : "Auto Escalate OFF"}</strong>
            </article>
          </div>
        )}

        {activeView === "queue" && (
          <div className="admin-chip-row" aria-label="Queue quick metrics">
            <article className="admin-chip">
              <span>Visible Sessions</span>
              <strong>{sessions.length}</strong>
            </article>
            <article className="admin-chip">
              <span>Filter</span>
              <strong>{String(sessionFilter || "queued").toUpperCase()}</strong>
            </article>
            <article className="admin-chip">
              <span>Default Agent</span>
              <strong>{assignAgentId || "agent"}</strong>
            </article>
            <article className="admin-chip">
              <span>Last Queue Refresh</span>
              <strong>{formatDate(readiness?.timestamp)}</strong>
            </article>
          </div>
        )}

        {activeView === "status" && (
          <div className="admin-chip-row" aria-label="Status quick metrics">
            <article className="admin-chip">
              <span>API</span>
              <strong>{(readiness?.apiStatus || "unknown").toUpperCase()}</strong>
            </article>
            <article className="admin-chip">
              <span>LLM</span>
              <strong>{(readiness?.llmStatus || "unknown").toUpperCase()}</strong>
            </article>
            <article className="admin-chip">
              <span>OTP Delivery</span>
              <strong>{otpReadyLabel}</strong>
            </article>
            <article className="admin-chip">
              <span>Last Status Check</span>
              <strong>{formatDate(lastStatusCheckAt)}</strong>
            </article>
          </div>
        )}

        {activeView === "control" && (
          <>
            <section className="admin-live-queue admin-report-export admin-compact-card">
              <div className="admin-main-head">
                <h3>Download Reports</h3>
                <div className="queue-controls admin-report-controls">
                  <select
                    className="admin-input admin-report-range"
                    value={reportRange}
                    onChange={(e) => setReportRange(e.target.value)}
                  >
                    <option value="day">Per Day</option>
                    <option value="week">Per Week</option>
                    <option value="month">Per Month</option>
                  </select>
                  <button className="pill-btn admin-report-download" onClick={onDownloadAdminReport} disabled={reportLoading}>
                    {reportLoading ? "Preparing PDF..." : "Download PDF"}
                  </button>
                </div>
              </div>
              <p className="admin-note">Export polished PDF reports with KPI cards, session analytics, and time-filtered data.</p>
            </section>

            <div className="admin-manage-grid admin-manage-grid-compact">
              <article className="manage-card">
                <h4>Knowledge Base</h4>
                <p>Source files: {knowledge?.sourceFileCount ?? 0} • Chunks: {knowledge?.chunkCount ?? 0}</p>
                <p>Last ingest: {formatDate(knowledge?.lastIngestedAt)}</p>
                <button className="pill-btn" onClick={onReindex} disabled={runningReindex}>
                  {runningReindex ? "Re-indexing..." : "Re-index Knowledge Base"}
                </button>
                <div className="dataset-list">
                  {(datasets || []).slice(0, 6).map((file) => (
                    <div className="dataset-item" key={`${file.name}-${file.updatedAt}`}>
                      <p>{file.name} • {Math.max(1, Math.round((file.size || 0) / 1024))} KB</p>
                      <div className="dataset-actions">
                        <button
                          className="pill-btn"
                          onClick={() => onPreviewDataset(file.name)}
                          disabled={previewLoading && previewLoadingName === file.name}
                        >
                          {previewLoading && previewLoadingName === file.name ? "Loading..." : "Preview"}
                        </button>
                        <button
                          className="pill-btn danger-pill"
                          onClick={() => onRemoveDatasetFile(file.name)}
                          disabled={datasetRemovingName === file.name}
                        >
                          {datasetRemovingName === file.name ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    </div>
                  ))}
                  {!datasets.length && <p>No dataset files found.</p>}
                </div>
              </article>
              <article className="manage-card">
                <h4>Site Configuration</h4>
                <p>Configure Microsoft SSO controls for the Agent Dashboard at runtime.</p>
                <p className={siteChecklist.ready ? "config-ready" : "config-missing"}>
                  {siteChecklist.ready ? "Ready to work" : "Setup incomplete"}
                </p>
                <div className="admin-config-summary">
                  <p><strong>Domains:</strong> {(settings?.microsoftAllowedDomains || []).join(", ") || "Not set"}</p>
                  <p><strong>Emails:</strong> {(settings?.microsoftAllowedEmails || []).join(", ") || "Optional / empty"}</p>
                  <p><strong>Runtime Toggle:</strong> {settings?.microsoftAuthEnabled ? "Enabled" : "Disabled"}</p>
                </div>
                <button className="pill-btn" onClick={() => setSiteConfigOpen(true)}>
                  Open Config Modal
                </button>
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
                <button className="pill-btn" onClick={onCheckOtpProviders} disabled={runningOtpProviderCheck}>
                  {runningOtpProviderCheck ? "Checking OTP Providers..." : "Check OTP Providers"}
                </button>
                <p>
                  API: {readiness?.apiStatus?.toUpperCase() || "UNKNOWN"} • LLM: {readiness?.llmStatus?.toUpperCase() || "UNKNOWN"}
                </p>
                {otpProviderHealth ? (
                  <div className="runtime-grid">
                    <p>
                      OTP Overall: <strong>{otpProviderHealth.overallReady ? "ready" : "not ready"}</strong>
                    </p>
                    <p>
                      SMTP: <strong>{otpProviderHealth.email?.status || "unknown"}</strong>
                    </p>
                    <p>
                      Twilio: <strong>{otpProviderHealth.sms?.status || "unknown"}</strong>
                    </p>
                    <p>
                      SMTP Detail: <strong>{otpProviderHealth.email?.message || "-"}</strong>
                    </p>
                    <p>
                      Twilio Detail: <strong>{otpProviderHealth.sms?.message || "-"}</strong>
                    </p>
                    <p>
                      Checked At: <strong>{formatDate(otpProviderHealth.checkedAt)}</strong>
                    </p>
                  </div>
                ) : null}
              </article>
              <article className="manage-card">
                <h4>AI Runtime</h4>
                <p>Live model and retrieval stack currently serving chatbot responses.</p>
                <button className="pill-btn" onClick={onWarmRag} disabled={warmingRag}>
                  {warmingRag ? "Warming..." : "Warm RAG Now"}
                </button>
                <div className="runtime-grid">
                  <p>LLM Provider: <strong>{readiness?.rag?.llmProvider || "unknown"}</strong></p>
                  <p>LLM Model: <strong>{readiness?.rag?.llmModel || "unknown"}</strong></p>
                  <p>Vector DB: <strong>{readiness?.rag?.provider || "unknown"}</strong></p>
                  <p>RAG Ready: <strong>{readiness?.rag?.initialized ? "yes" : "no"}</strong></p>
                  <p>LLM Configured: <strong>{readiness?.rag?.llmConfigured ? "yes" : "no"}</strong></p>
                  <p>Top K: <strong>{settings?.ragTopK ?? "-"}</strong></p>
                  <p>Confidence Threshold: <strong>{settings?.ragConfidenceThreshold ?? "-"}</strong></p>
                  <p>Out-of-Scope Threshold: <strong>{settings?.ragOutOfScopeThreshold ?? "-"}</strong></p>
                </div>
              </article>
            </div>
          </>
        )}

        {activeView === "queue" && (
          <>
            <section className="admin-live-queue admin-compact-card">
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

            <section className="admin-live-queue admin-compact-card">
              <div className="admin-main-head">
                <h3>User Management</h3>
                <button className="pill-btn" onClick={() => navigate("/admin/users")}>Open Users Page</button>
              </div>
              <p className="admin-note">Moved to dedicated route with search and pagination for better performance.</p>
            </section>

            <section className="admin-live-queue admin-compact-card">
              <div className="admin-main-head">
                <h3>Agent Management</h3>
                <button className="pill-btn" onClick={() => navigate("/admin/agents")}>Open Agents Page</button>
              </div>
              <p className="admin-note">Moved to dedicated route with search and pagination for better performance.</p>
            </section>
          </>
        )}

        {activeView === "status" && (
          <section className="admin-status-block admin-compact-card">
            <StatusDashboard />
          </section>
        )}

        {feedback ? <p className="admin-feedback">{feedback}</p> : null}

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

      {datasetPreviewOpen && (
        <div className="admin-modal-backdrop" onClick={() => setDatasetPreviewOpen(false)}>
          <div className="admin-modal modern-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h3>Dataset Preview</h3>
              <button className="pill-btn" onClick={() => setDatasetPreviewOpen(false)}>
                Close
              </button>
            </div>
            <p>
              {datasetPreviewMeta?.name || "-"} • {Math.max(1, Math.round((datasetPreviewMeta?.size || 0) / 1024))} KB
            </p>
            <p>Updated: {formatDate(datasetPreviewMeta?.updatedAt)}</p>

            <div className="preview-toolbar">
              <input
                className="admin-input"
                value={datasetPreviewSearch}
                onChange={(e) => setDatasetPreviewSearch(e.target.value)}
                placeholder="Search in preview"
              />
              <button className="pill-btn" onClick={onPrevMatch} disabled={!previewRender.count}>
                Prev
              </button>
              <button className="pill-btn" onClick={onNextMatch} disabled={!previewRender.count}>
                Next
              </button>
              <button className="pill-btn" onClick={onToggleExpandPreview} disabled={previewLoading}>
                {previewLoading ? "Loading..." : datasetPreviewExpanded ? "Collapse" : "Expand Full"}
              </button>
              <button className="pill-btn" onClick={onDownloadDatasetFile} disabled={datasetDownloading}>
                {datasetDownloading ? "Downloading..." : "Download"}
              </button>
              <button className="pill-btn" onClick={onCopyPreview}>Copy</button>
            </div>

            {datasetPreviewSearch.trim() && (
              <p className="preview-note">
                Matches: {previewRender.count ? `${datasetCurrentMatch + 1}/${previewRender.count}` : "0"}
              </p>
            )}

            {datasetPreviewTruncated && !datasetPreviewExpanded && (
              <p className="preview-note">Showing first part only. Click Expand Full to load complete file.</p>
            )}

            <pre ref={previewRef} className="preview-content" dangerouslySetInnerHTML={{ __html: previewRender.html }} />
            <div className="admin-modal-actions">
              <button className="pill-btn" onClick={() => setDatasetPreviewSearch("")}>
                Clear Search
              </button>
            </div>
          </div>
        </div>
      )}

      {siteConfigOpen && (
        <div className="admin-modal-backdrop" onClick={() => setSiteConfigOpen(false)}>
          <div className="admin-modal site-config-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h3>Site Configuration</h3>
              <button className="pill-btn" onClick={() => setSiteConfigOpen(false)}>
                Close
              </button>
            </div>
            <div className="site-config-modal-body">
              <p>Configure Microsoft SSO controls for the Agent Dashboard at runtime.</p>
              <p className={siteChecklist.ready ? "config-ready" : "config-missing"}>
                {siteChecklist.ready ? "Ready to work" : "Setup incomplete"}
              </p>

              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.microsoftAuthEnabled)}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, microsoftAuthEnabled: e.target.checked }))
                  }
                />
                Enable Microsoft SSO for Agent Dashboard
              </label>

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

              <div className="site-config-list">
                <p><strong>Render (backend)</strong>: MICROSOFT_AUTH_ENABLED, MICROSOFT_ALLOWED_DOMAINS, MICROSOFT_ALLOWED_EMAILS (optional).</p>
                <p><strong>Vercel (frontend)</strong>: VITE_MS_CLIENT_ID, VITE_MS_TENANT_ID, VITE_MS_REDIRECT_URI.</p>
                <p><strong>Entra App</strong>: Add SPA redirect URI for /agent, allow User.Read, enable public client flow for popup login.</p>
              </div>

              <div className="site-config-checklist">
                {siteChecklist.checks.map((item) => (
                  <p key={item.key} className={item.ok ? "check-ok" : "check-missing"}>
                    <span>{item.label}</span>
                    <strong>{item.ok ? "Configured" : "Missing"}</strong>
                  </p>
                ))}
                <p className="check-optional">
                  <span>Render MICROSOFT_ALLOWED_EMAILS</span>
                  <strong>Optional</strong>
                </p>
              </div>
            </div>

            <div className="admin-modal-actions site-config-modal-footer">
              <button className="pill-btn" onClick={onSaveSettings} disabled={savingSettings}>
                {savingSettings ? "Saving..." : "Save"}
              </button>
              <button className="pill-btn" onClick={() => setSiteConfigOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
