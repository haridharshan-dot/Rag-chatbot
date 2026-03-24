import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchReadiness, fetchStatusLogs } from '../api';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const StatusPage = () => {
  const [statusLogs, setStatusLogs] = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshAt, setLastRefreshAt] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const getLogs = async () => {
      try {
        const [logs, ready] = await Promise.all([fetchStatusLogs(), fetchReadiness()]);
        setStatusLogs(logs);
        setReadiness(ready);
        setError(null);
        setLastRefreshAt(new Date().toISOString());
      } catch (err) {
        setError('Failed to fetch status logs.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    getLogs();

    const timer = setInterval(getLogs, 30000);
    return () => clearInterval(timer);
  }, []);

  const processChartData = () => {
    const days = {};
    statusLogs.forEach(log => {
      const date = new Date(log.timestamp).toLocaleDateString();
      if (!days[date]) {
        days[date] = { apiUp: 0, apiDown: 0, llmUp: 0, llmDown: 0 };
      }
      if (log.apiStatus === 'up') days[date].apiUp++;
      else days[date].apiDown++;
      if (log.llmStatus === 'up') days[date].llmUp++;
      else days[date].llmDown++;
    });

    const labels = Object.keys(days).sort((a, b) => new Date(a) - new Date(b));
    const apiUpData = labels.map(label => days[label].apiUp);
    const apiDownData = labels.map(label => days[label].apiDown);
    const llmUpData = labels.map(label => days[label].llmUp);
    const llmDownData = labels.map(label => days[label].llmDown);

    return {
      labels,
      datasets: [
        {
          label: 'API Up',
          data: apiUpData,
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1,
        },
        {
          label: 'API Down',
          data: apiDownData,
          backgroundColor: 'rgba(255, 99, 132, 0.6)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 1,
        },
        {
          label: 'LLM Up',
          data: llmUpData,
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1,
        },
        {
          label: 'LLM Down',
          data: llmDownData,
          backgroundColor: 'rgba(255, 206, 86, 0.6)',
          borderColor: 'rgba(255, 206, 86, 1)',
          borderWidth: 1,
        },
      ],
    };
  };

  const getLatestStatus = () => {
    if (statusLogs.length === 0) return null;
    return statusLogs[statusLogs.length - 1];
  };

  const latestStatus = getLatestStatus();
  const effectiveApiStatus = latestStatus?.apiStatus || readiness?.apiStatus || 'unknown';
  const effectiveLlmStatus = latestStatus?.llmStatus || readiness?.llmStatus || 'unknown';

  const uptimeRatio = statusLogs.length
    ? Math.round((statusLogs.filter((log) => log.apiStatus === 'up').length / statusLogs.length) * 100)
    : 0;
  const llmRatio = statusLogs.length
    ? Math.round((statusLogs.filter((log) => log.llmStatus === 'up').length / statusLogs.length) * 100)
    : 0;

  const chartData = processChartData();

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
    },
    scales: {
      x: {
        stacked: false,
      },
      y: {
        stacked: false,
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="status-layout">
      <aside className="status-sidebar">
        <div className="sidebar-header">
          <div>
            <p className="eyebrow">Production Monitoring</p>
            <h3>Service Health Center</h3>
          </div>
        </div>

        <div className="status-summary">
          <div className={`status-item ${effectiveApiStatus === 'up' ? 'up' : 'down'}`}>
            <h4>API Server</h4>
            <p className="status-value">{effectiveApiStatus.toUpperCase()}</p>
            {latestStatus?.apiResponseTime && <p className="response-time">{latestStatus.apiResponseTime}ms</p>}
          </div>

          <div className={`status-item ${effectiveLlmStatus === 'up' ? 'up' : 'down'}`}>
            <h4>LLM Service</h4>
            <p className="status-value">{effectiveLlmStatus.toUpperCase()}</p>
            {latestStatus?.llmResponseTime && <p className="response-time">{latestStatus.llmResponseTime}ms</p>}
          </div>

          <div className="status-item info">
            <h4>Readiness</h4>
            <p className="last-updated">
              {readiness?.status ? readiness.status.toUpperCase() : 'UNKNOWN'}
            </p>
            <p className="response-time">DB: {readiness?.db?.state || 'unknown'}</p>
          </div>

          <div className="status-item info">
            <h4>Last Refresh</h4>
            <p className="last-updated">{lastRefreshAt ? new Date(lastRefreshAt).toLocaleString() : 'N/A'}</p>
          </div>
        </div>

        <button className="nav-btn" onClick={() => navigate('/')}>
          ← Back to Chat
        </button>
      </aside>

      <section className="status-main">
        <div className="status-header">
          <h2>Operations Dashboard</h2>
          <button className="nav-btn agent-btn" onClick={() => navigate('/agent')}>
            Agent Dashboard
          </button>
        </div>

        <div className="ops-strip">
          <article className="ops-card">
            <p>API Uptime (7d)</p>
            <strong>{uptimeRatio}%</strong>
          </article>
          <article className="ops-card">
            <p>LLM Uptime (7d)</p>
            <strong>{llmRatio}%</strong>
          </article>
          <article className="ops-card">
            <p>RAG Provider</p>
            <strong>{readiness?.rag?.provider || 'n/a'}</strong>
          </article>
          <article className="ops-card">
            <p>LLM Provider</p>
            <strong>{readiness?.rag?.llmProvider || 'n/a'}</strong>
          </article>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading-state">Loading status data...</div>
        ) : statusLogs.length === 0 ? (
          <div className="empty-state">No status logs available yet. Status will be tracked over time.</div>
        ) : (
          <>
            <div className="chart-container">
              <h3>7-Day Status Trend</h3>
              <Bar data={chartData} options={options} />
            </div>

            <div className="status-logs">
              <h3>Recent Status Logs</h3>
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>API Status</th>
                    <th>API Response</th>
                    <th>LLM Status</th>
                    <th>LLM Response</th>
                  </tr>
                </thead>
                <tbody>
                  {statusLogs.slice().reverse().slice(0, 15).map((log) => (
                    <tr key={log._id}>
                      <td>{new Date(log.timestamp).toLocaleString()}</td>
                      <td><span className={`badge ${log.apiStatus}`}>{log.apiStatus}</span></td>
                      <td>{log.apiResponseTime ? `${log.apiResponseTime}ms` : 'N/A'}</td>
                      <td><span className={`badge ${log.llmStatus}`}>{log.llmStatus}</span></td>
                      <td>{log.llmResponseTime ? `${log.llmResponseTime}ms` : 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default StatusPage;
