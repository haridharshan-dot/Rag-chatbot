import React, { useEffect, useState } from 'react';
import { fetchStatusLogs } from '../api';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const StatusDashboard = () => {
  const [statusLogs, setStatusLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        days[date] = { apiUp: 0, apiDown: 0, llmUp: 0, llmDown: 0, apiResponseTimes: [], llmResponseTimes: [] };
      }
      if (log.apiStatus === 'up') days[date].apiUp++;
      else days[date].apiDown++;
      if (log.llmStatus === 'up') days[date].llmUp++;
      else days[date].llmDown++;

      if (log.apiResponseTime) days[date].apiResponseTimes.push(log.apiResponseTime);
      if (log.llmResponseTime) days[date].llmResponseTimes.push(log.llmResponseTime);
    });

    const labels = Object.keys(days).sort((a, b) => new Date(a) - new Date(b));
    const apiUpData = labels.map(label => days[label].apiUp);
    const apiDownData = labels.map(label => days[label].apiDown);
    const llmUpData = labels.map(label => days[label].llmUp);
    const llmDownData = labels.map(label => days[label].llmDown);

    const apiAvgResponseTime = labels.map(label => {
      const times = days[label].apiResponseTimes;
      return times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    });
    const llmAvgResponseTime = labels.map(label => {
      const times = days[label].llmResponseTimes;
      return times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    });

    return {
      labels,
      datasets: [
        {
          label: 'API Up',
          data: apiUpData,
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
        },
        {
          label: 'API Down',
          data: apiDownData,
          backgroundColor: 'rgba(255, 99, 132, 0.6)',
        },
        {
          label: 'LLM Up',
          data: llmUpData,
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
        },
        {
          label: 'LLM Down',
          data: llmDownData,
          backgroundColor: 'rgba(255, 206, 86, 0.6)',
        },
        {
          label: 'API Avg Response Time (ms)',
          data: apiAvgResponseTime,
          backgroundColor: 'rgba(153, 102, 255, 0.6)',
        },
        {
          label: 'LLM Avg Response Time (ms)',
          data: llmAvgResponseTime,
          backgroundColor: 'rgba(255, 159, 64, 0.6)',
        },
      ],
    };
  };

  if (loading) return <div>Loading status...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  const chartData = processChartData();

  const options = {
    responsive: true,
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
        stacked: true,
      },
      y: {
        stacked: true,
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="status-dashboard">
      <h2>API and LLM Status (Last 7 Days)</h2>
      {statusLogs.length === 0 ? (
        <p>No status logs available.</p>
      ) : (
        <div style={{ width: '100%', height: '400px' }}>
          <Bar data={chartData} options={options} />
        </div>
      )}
    </div>
  );
};

export default StatusDashboard;
