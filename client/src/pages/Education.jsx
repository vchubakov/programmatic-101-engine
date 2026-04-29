import { useEffect, useState, useCallback } from 'react';
import ReviewCard from '../components/ReviewCard.jsx';

function isRecentlyUsed(usedAt) {
  if (!usedAt) return false;
  const ms = Date.now() - new Date(usedAt).getTime();
  return ms < 30 * 24 * 60 * 60 * 1000;
}

function relDay(usedAt) {
  if (!usedAt) return null;
  const days = Math.floor((Date.now() - new Date(usedAt).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

export default function Education() {
  const [topics, setTopics]         = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [customTopic, setCustomTopic] = useState('');
  const [draft, setDraft]           = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError]           = useState(null);

  const loadTopics = useCallback(async () => {
    try {
      const res = await fetch('/api/topics?category=education');
      const data = await res.json();
      setTopics(Array.isArray(data) ? data : []);
    } catch {
      // silently ignore — topics will just be empty
    }
  }, []);

  useEffect(() => { loadTopics(); }, [loadTopics]);

  async function generate(payload) {
    setGenerating(true);
    setError(null);
    setDraft(null);
    try {
      const res = await fetch('/api/education/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setDraft(data);
      // refresh topics so used_at updates
      loadTopics();
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  function generateFromTopic(topic) {
    setSelectedId(topic.id);
    setCustomTopic('');
    generate({ topic_id: topic.id });
  }

  function generateCustom() {
    if (!customTopic.trim()) return;
    setSelectedId(null);
    generate({ custom_topic: customTopic.trim() });
  }

  async function onApprove(id, editedText, scheduledAt) {
    await fetch(`/api/drafts/${id}/approve`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ edited_text: editedText, scheduled_at: scheduledAt }),
    });
    setDraft((d) => d && d.id === id ? { ...d, approved: 1 } : d);
  }

  async function onReject(id) {
    await fetch(`/api/drafts/${id}/reject`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });
    setDraft(null);
  }

  async function onRegenerate(id) {
    const current = draft;
    if (!current) return;
    const source = (() => {
      try { return JSON.parse(current.source_data); } catch { return {}; }
    })();
    const payload = source.topic_id
      ? { topic_id: source.topic_id }
      : { custom_topic: source.topic };
    await fetch(`/api/drafts/${id}/reject`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });
    generate(payload);
  }

  return (
    <div className="flex gap-6 min-h-[calc(100vh-8rem)]">

      {/* ── Left panel: topic list ── */}
      <aside className="w-80 flex-shrink-0 flex flex-col gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">Education</h1>
          <p className="text-xs text-gray-500 mt-0.5">Generate LinkedIn posts from topics</p>
        </div>

        {/* Custom topic input */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Custom topic
          </label>
          <textarea
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            placeholder="Enter any topic..."
            rows={3}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm
                       text-gray-800 placeholder-gray-400 focus:outline-none focus:border-violet-400
                       transition-colors resize-none"
          />
          <button
            onClick={generateCustom}
            disabled={generating || !customTopic.trim()}
            className="w-full py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-700
                       text-white transition-colors disabled:opacity-40"
          >
            {generating && !selectedId ? 'Generating…' : 'Generate'}
          </button>
        </div>

        <div className="border-t border-gray-100 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Topic library · {topics.length}
          </p>

          <div className="space-y-1 max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
            {topics.map((topic) => {
              const stale = isRecentlyUsed(topic.used_at);
              const isActive = selectedId === topic.id && generating;
              return (
                <div
                  key={topic.id}
                  className={`group flex items-start justify-between gap-2 rounded-lg px-3 py-2.5
                              border transition-colors cursor-pointer
                              ${isActive
                                ? 'border-violet-300 bg-violet-50'
                                : 'border-transparent hover:border-gray-200 hover:bg-gray-50'}`}
                  onClick={() => !generating && generateFromTopic(topic)}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${stale ? 'text-gray-400' : 'text-gray-800'}`}>
                      {topic.title}
                    </p>
                    {topic.used_at && (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Used {relDay(topic.used_at)}
                        {stale && ' · recently used'}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (!generating) generateFromTopic(topic); }}
                    disabled={generating}
                    className="flex-shrink-0 text-[11px] font-semibold px-2 py-1 rounded
                               bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors
                               opacity-0 group-hover:opacity-100 disabled:opacity-30"
                  >
                    Generate
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* ── Right panel: draft output ── */}
      <div className="flex-1 min-w-0">
        {generating ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Writing post…</p>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
            {error}
          </div>
        ) : draft ? (
          <ReviewCard
            draft={draft}
            onApprove={onApprove}
            onReject={onReject}
            onRegenerate={onRegenerate}
            scheduleConfigs={[]}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-64 rounded-xl border
                          border-dashed border-gray-200 text-center">
            <p className="text-sm text-gray-400">Select a topic or enter a custom one to generate a draft</p>
          </div>
        )}
      </div>

    </div>
  );
}
