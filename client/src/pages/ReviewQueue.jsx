import { useEffect, useState, useCallback } from 'react';
import ReviewCard from '../components/ReviewCard.jsx';

const MODULE_ORDER  = ['news', 'education', 'personal', 'memes'];
const MODULE_LABELS = { news: 'News', education: 'Education', personal: 'Personal', memes: 'Memes' };

export default function ReviewQueue() {
  const [drafts,          setDrafts]          = useState([]);
  const [scheduleConfigs, setScheduleConfigs] = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [draftsRes, configRes] = await Promise.all([
        fetch('/api/drafts?approved=0&rejected=0'),
        fetch('/api/schedule/config'),
      ]);
      const [d, c] = await Promise.all([draftsRes.json(), configRes.json()]);
      setDrafts(Array.isArray(d) ? d : []);
      setScheduleConfigs(Array.isArray(c) ? c : []);
    } catch (e) {
      setError('Failed to load drafts. Is the server running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onApprove(id, editedText, scheduledAt, feedbackRating, feedbackNote) {
    await fetch(`/api/drafts/${id}/approve`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        edited_text:     editedText,
        scheduled_at:    scheduledAt,
        feedback_rating: feedbackRating || null,
        feedback_note:   feedbackNote   || null,
      }),
    });
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  async function onReject(id) {
    await fetch(`/api/drafts/${id}/reject`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  async function onRegenerate(id) {
    await fetch(`/api/drafts/${id}/regenerate`, { method: 'POST' });
    // stub: real impl will replace generated_content and re-render
  }

  // Group drafts by module, preserving MODULE_ORDER
  const byModule = {};
  for (const d of drafts) {
    (byModule[d.module] ??= []).push(d);
  }
  const activeModules = MODULE_ORDER.filter((m) => byModule[m]?.length > 0);

  return (
    // Dark-themed full-bleed wrapper that overrides the light page bg
    <div className="min-h-screen bg-gray-950 -mx-4 -my-8 px-4 py-8">
      <div className="max-w-2xl mx-auto">

        {/* ── page header ── */}
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 className="text-lg font-bold text-gray-100 tracking-tight">Review Queue</h1>
            <p className="text-xs text-gray-600 mt-0.5">
              {loading
                ? 'Loading…'
                : `${drafts.length} draft${drafts.length !== 1 ? 's' : ''} pending`}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-500
                       hover:text-gray-300 border border-gray-700 transition-colors disabled:opacity-40"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {/* ── states ── */}
        {error ? (
          <div className="rounded-lg border border-rose-900 bg-rose-950/40 p-5 text-sm text-rose-400">
            {error}
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-48 rounded-lg bg-gray-900 border border-gray-800 animate-pulse" />
            ))}
          </div>
        ) : activeModules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-800 p-16 text-center">
            <p className="text-gray-500 font-medium">Queue is empty</p>
            <p className="text-sm text-gray-700 mt-1">No drafts pending review</p>
          </div>
        ) : (
          <div className="space-y-8">
            {activeModules.map((module) => (
              <section key={module}>
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-gray-600 mb-3
                               flex items-center gap-2">
                  {MODULE_LABELS[module]}
                  <span className="text-gray-800">·</span>
                  <span>{byModule[module].length}</span>
                </h2>
                <div className="space-y-3">
                  {byModule[module].map((draft) => (
                    <ReviewCard
                      key={draft.id}
                      draft={draft}
                      onApprove={onApprove}
                      onReject={onReject}
                      onRegenerate={onRegenerate}
                      scheduleConfigs={scheduleConfigs}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
