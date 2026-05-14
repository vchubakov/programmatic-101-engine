import { useEffect, useState, useCallback } from 'react';

function parseJSON(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const MODULE_BADGE = {
  news:      'bg-blue-950 text-blue-400 border-blue-800',
  education: 'bg-violet-950 text-violet-400 border-violet-800',
  personal:  'bg-amber-950 text-amber-400 border-amber-800',
  memes:     'bg-rose-950 text-rose-400 border-rose-800',
};

function PostCard({ draft, onPostNow, onRetry }) {
  const source    = parseJSON(draft.source_data);
  const label     = source.headline ?? source.topic ?? source.title ?? source.url ?? '—';
  const badge     = MODULE_BADGE[draft.module] ?? 'bg-gray-800 text-gray-400 border-gray-600';
  const isPosted  = !!draft.posted_at;
  const isOverdue = !isPosted && draft.scheduled_at && new Date(draft.scheduled_at) < new Date();
  const [busy, setBusy] = useState(false);

  async function handleAction(fn) {
    setBusy(true);
    await fn();
    setBusy(false);
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${badge}`}>
            {draft.module}
          </span>
          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded border
                           bg-sky-950 text-sky-400 border-sky-800">
            {draft.platform}
          </span>
        </div>
        <span className="text-xs text-gray-700 font-mono flex-shrink-0">#{draft.id}</span>
      </div>

      <p className="text-xs text-gray-500 truncate">{label}</p>

      {/* Status */}
      {isPosted ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-emerald-400 font-medium">Posted</span>
            <span className="text-xs text-gray-600">{formatDate(draft.posted_at)}</span>
          </div>
          {draft.post_url && (
            <a
              href={draft.post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-sky-400 hover:text-sky-300 underline transition-colors"
            >
              View on LinkedIn →
            </a>
          )}
        </div>
      ) : isOverdue ? (
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-rose-400 font-medium">Failed to post</span>
            <span className="text-xs text-gray-600 ml-2">scheduled {formatDate(draft.scheduled_at)}</span>
          </div>
          <button
            onClick={() => handleAction(() => onRetry(draft.id))}
            disabled={busy}
            className="text-xs px-2.5 py-1 rounded bg-rose-900 hover:bg-rose-800 text-rose-300
                       transition-colors disabled:opacity-40"
          >
            {busy ? 'Posting…' : 'Retry'}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Scheduled for</span>
            <span className="text-xs text-gray-300 font-medium">{formatDate(draft.scheduled_at)}</span>
          </div>
          <button
            onClick={() => handleAction(() => onPostNow(draft.id))}
            disabled={busy}
            className="text-xs px-2.5 py-1 rounded bg-sky-900 hover:bg-sky-800 text-sky-300
                       transition-colors disabled:opacity-40"
          >
            {busy ? 'Posting…' : 'Post now'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Schedule() {
  const [drafts,  setDrafts]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/drafts?approved=1&rejected=0');
      const data = await res.json();
      setDrafts(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load schedule. Is the server running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function postNow(id) {
    const res = await fetch(`/api/drafts/${id}/post-now`, { method: 'POST' });
    if (res.ok) load();
    else {
      const data = await res.json().catch(() => ({}));
      alert('Post failed: ' + (data.error || 'unknown error'));
    }
  }

  const pending = drafts.filter(d => !d.posted_at);
  const posted  = drafts.filter(d =>  d.posted_at);

  return (
    <div className="min-h-screen bg-gray-950 -mx-4 -my-8 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-8">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-100 tracking-tight">Schedule</h1>
            <p className="text-xs text-gray-600 mt-0.5">
              {loading ? 'Loading…' : `${pending.length} pending · ${posted.length} posted`}
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

        {error ? (
          <div className="rounded-lg border border-rose-900 bg-rose-950/40 p-5 text-sm text-rose-400">
            {error}
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(n => (
              <div key={n} className="h-28 rounded-lg bg-gray-900 border border-gray-800 animate-pulse" />
            ))}
          </div>
        ) : drafts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-800 p-16 text-center">
            <p className="text-gray-500 font-medium">No scheduled posts</p>
            <p className="text-sm text-gray-700 mt-1">Approve drafts from the Review Queue to schedule them</p>
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-gray-600 mb-3">
                  Pending · {pending.length}
                </h2>
                <div className="space-y-2">
                  {pending.map(d => (
                    <PostCard key={d.id} draft={d} onPostNow={postNow} onRetry={postNow} />
                  ))}
                </div>
              </section>
            )}

            {posted.length > 0 && (
              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-gray-600 mb-3">
                  Posted · {posted.length}
                </h2>
                <div className="space-y-2">
                  {posted.map(d => (
                    <PostCard key={d.id} draft={d} onPostNow={postNow} onRetry={postNow} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
