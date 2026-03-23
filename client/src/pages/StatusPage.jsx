import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchStatusLogs } from '../api';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const StatusPage = () => {
  const [statusLogs, setStatusLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const getLogs = async () => {
      try {
        const logs = await fetchStatusLogs();
        setStatusLogs(logs);
      } catch (err) {
        setError('Failed to fetch status logs.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    getLogs();
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

  if (loading) return <div className="status-page"><p>Loading status...</p></div>;

  const chartData = processChartData();

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'API and LLM Status Over Last 7 Days',
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
    <div className="status-page">
      <div className="status-nav">
        <button onClick={() => navigate('/')} className="nav-btn">← Back to Chat</button>
        <button onClick={() => navigate('/agent')} className="nav-btn agent-btn">Agent Dashboard</button>
      </div>

      <div className="status-container">
        <h1>System Status Dashboard</h1>

        {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}

        <div className="status-cards">
          <div className={`status-card ${latestStatus?.apiStatus === 'up' ? 'up' : 'down'}`}>
            <h3>API Server</h3>
            <p className="status-indicator">{latestStatus?.apiStatus.toUpperCase() || 'UNKNOWN'}</p>
            {latestStatus?.apiResponseTime && <p className="response-time">{latestStatus.apiResponseTime}ms</p>}
          </div>

          <div className={`status-card ${latestStatus?.llmStatus === 'up' ? 'up' : 'down'}`}>
            <h3>LLM Service</h3>
            <p className="status-indicator">{latestStatus?.llmStatus.toUpperCase() || 'UNKNOWN'}</p>
            {latestStatus?.llmResponseTime && <p className="response-time">{latestStatus.llmResponseTime}ms</p>}
          </div>

          <div className="status-card info">
            <h3>Last Updated</h3>
            <p className="last-updated">{latestStatus ? new Date(latestStatus.timestamp).toLocaleString() : 'N/A'}</p>
          </div>
        </div>

        <div className="chart-wrapper">
          {statusLogs.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px' }}>No status logs available yet. Status will be tracked over time.</p>
          ) : (
            <Bar data={chartData} options={options} />
          )}
        </div>

        <div className="status-logs">
          <h2>Recent Status Logs (Last 10)</h2>
          {statusLogs.length === 0 ? (
            <p>No logs available.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>API Status</th>
                  <th>API Response (ms)</th>
                  <th>LLM Status</th>
                  <th>LLM Response (ms)</th>
                </tr>
              </thead>
              <tbody>
                {statusLogs.slice().reverse().slice(0, 10).map((log) => (
                  <tr key={log._id}>
                    <td>{new Date(log.timestamp).toLocaleString()}</td>
                    <td><span className={`badge ${log.apiStatus}`}>{log.apiStatus}</span></td>
                    <td>{log.apiResponseTime || 'N/A'}</td>
                    <td><span className={`badge ${log.llmStatus}`}>{log.llmStatus}</span></td>
                    <td>{log.llmResponseTime || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatusPage;
