import { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function fmtPct(rate) {
  return (rate * 100).toFixed(2) + '%';
}

function fmtNum(n) {
  if (!n) return '0';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}

function slugToTitle(url) {
  try {
    const match = url.match(/\/posts\/([^/?]+)/);
    if (!match) return url.slice(0, 60);
    return decodeURIComponent(match[1])
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .slice(0, 60);
  } catch {
    return url.slice(0, 60);
  }
}

function engagementColor(rate) {
  if (rate >= 0.03) return 'text-green-600 bg-green-50';
  if (rate >= 0.01) return 'text-yellow-700 bg-yellow-50';
  return 'text-red-600 bg-red-50';
}

export default function Analytics() {
  const [summary, setSummary] = useState(null);
  const [posts, setPosts] = useState([]);
  const [daily, setDaily] = useState([]);
  const [metric, setMetric] = useState('impressions');
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    const [s, p, d] = await Promise.all([
      fetch(`${API}/api/analytics/summary`).then(r => r.json()).catch(() => null),
      fetch(`${API}/api/analytics/posts`).then(r => r.json()).catch(() => []),
      fetch(`${API}/api/analytics/daily`).then(r => r.json()).catch(() => []),
    ]);
    setSummary(s);
    setPosts(Array.isArray(p) ? p : []);
    setDaily(Array.isArray(d) ? d : []);
  }

  async function handleUpload(file) {
    if (!file || !file.name.endsWith('.xlsx')) {
      setImportError('Please upload an .xlsx file.');
      return;
    }
    setUploading(true);
    setImportResult(null);
    setImportError(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`${API}/api/analytics/import`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setImportResult(data);
      fetchAll();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function onFileChange(e) {
    const f = e.target.files?.[0];
    if (f) handleUpload(f);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleUpload(f);
  }

  const summaryCards = [
    { label: 'Total Impressions', value: summary ? fmtNum(summary.recent_30_days?.impressions) : '—', sub: 'last 30 days' },
    { label: 'Avg Engagement Rate', value: summary ? fmtPct(summary.avg_engagement_rate || 0) : '—', sub: 'all tracked posts' },
    { label: 'Total Followers', value: summary ? fmtNum(summary.total_followers) : '—', sub: 'from last import' },
    { label: 'Posts Tracked', value: summary ? summary.total_posts_tracked : '—', sub: 'from LinkedIn exports' },
  ];

  const chartData = daily.map(d => ({
    date: d.date.slice(5),
    impressions: d.impressions,
    engagements: d.engagements,
  }));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {summaryCards.map(card => (
          <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-2xl font-bold text-brand-700">{card.value}</div>
            <div className="text-sm font-medium text-gray-700 mt-1">{card.label}</div>
            <div className="text-xs text-gray-400 mt-0.5">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Import panel */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Import LinkedIn Analytics</h2>
        <p className="text-sm text-gray-500 mb-4">
          Export from <span className="font-medium text-gray-700">linkedin.com/analytics → Content → Export</span>,
          select your date range, then upload the .xlsx file here.
        </p>

        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-300'
          }`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={onFileChange} />
          <div className="text-gray-400 text-sm">
            {uploading
              ? 'Importing...'
              : 'Drop your LinkedIn analytics .xlsx here, or click to browse'}
          </div>
        </div>

        {importResult && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
            Imported <strong>{importResult.posts_imported}</strong> posts — date range:{' '}
            <strong>{importResult.date_range}</strong>
          </div>
        )}
        {importError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {importError}
          </div>
        )}
        {summary?.last_import && (
          <div className="mt-2 text-xs text-gray-400">
            Last imported: {new Date(summary.last_import).toLocaleString()}
          </div>
        )}
      </div>

      {/* Post performance table */}
      {posts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Post Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Post</th>
                  <th className="px-4 py-3 text-right">Impressions</th>
                  <th className="px-4 py-3 text-right">Engagements</th>
                  <th className="px-4 py-3 text-right">Eng. %</th>
                  <th className="px-4 py-3">Draft</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {posts.map(post => (
                  <tr
                    key={post.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => window.open(post.post_url, '_blank')}
                  >
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {post.publish_date || '—'}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate text-gray-900">
                      {slugToTitle(post.post_url)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {fmtNum(post.impressions)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {fmtNum(post.engagements)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${engagementColor(post.engagement_rate)}`}>
                        {fmtPct(post.engagement_rate)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {post.agent_scope ? (
                        <span className="px-2 py-0.5 bg-gray-100 rounded">{post.agent_scope}</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily chart */}
      {daily.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Daily Performance (last 90 days)</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setMetric('impressions')}
                className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${
                  metric === 'impressions'
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Impressions
              </button>
              <button
                onClick={() => setMetric('engagements')}
                className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${
                  metric === 'engagements'
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Engagements
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtNum} />
              <Tooltip formatter={v => fmtNum(v)} />
              <Line
                type="monotone"
                dataKey={metric}
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {posts.length === 0 && daily.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          No analytics data yet. Import a LinkedIn export above to get started.
        </div>
      )}
    </div>
  );
}
