import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const MODULE_META = {
  news:      { label: 'News',      emoji: '📰', color: 'blue',   path: '/news' },
  education: { label: 'Education', emoji: '🎓', color: 'violet', path: '/education' },
  personal:  { label: 'Personal',  emoji: '✍️',  color: 'amber',  path: '/personal' },
  memes:     { label: 'Memes',     emoji: '😄', color: 'rose',   path: '/memes' },
};

const COLOR_CLASSES = {
  blue:   { card: 'border-blue-200 bg-blue-50',   badge: 'bg-blue-100 text-blue-800',   num: 'text-blue-700' },
  violet: { card: 'border-violet-200 bg-violet-50', badge: 'bg-violet-100 text-violet-800', num: 'text-violet-700' },
  amber:  { card: 'border-amber-200 bg-amber-50', badge: 'bg-amber-100 text-amber-800', num: 'text-amber-700' },
  rose:   { card: 'border-rose-200 bg-rose-50',   badge: 'bg-rose-100 text-rose-800',   num: 'text-rose-700' },
};

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function Dashboard() {
  const [counts, setCounts] = useState({ total: 0, counts: {} });
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/drafts/counts').then((r) => r.json()),
      fetch('/api/schedule/upcoming').then((r) => r.json()),
    ])
      .then(([c, u]) => { setCounts(c); setUpcoming(u); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function cancelSchedule(id) {
    await fetch(`/api/drafts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_at: null }),
    });
    setUpcoming((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div className="space-y-8">
      {/* Review banner */}
      <div className={`rounded-xl px-6 py-4 flex items-center justify-between border ${
        counts.total > 0
          ? 'bg-brand-50 border-brand-200'
          : 'bg-gray-50 border-gray-200'
      }`}>
        <div>
          <p className="text-sm text-gray-500 uppercase tracking-wide font-medium">Ready for review</p>
          <p className={`text-3xl font-bold mt-0.5 ${counts.total > 0 ? 'text-brand-700' : 'text-gray-400'}`}>
            {loading ? '…' : `${counts.total} draft${counts.total !== 1 ? 's' : ''}`}
          </p>
        </div>
        {counts.total > 0 && (
          <span className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
            Review now
          </span>
        )}
      </div>

      {/* Module cards */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Modules</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Object.entries(MODULE_META).map(([key, meta]) => {
            const c = COLOR_CLASSES[meta.color];
            const count = counts.counts?.[key] ?? 0;
            return (
              <Link
                key={key}
                to={meta.path}
                className={`rounded-xl border p-5 flex flex-col gap-3 hover:shadow-md transition-shadow ${c.card}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{meta.emoji}</span>
                  {count > 0 && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.badge}`}>
                      {count} pending
                    </span>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{meta.label}</p>
                  <p className={`text-3xl font-bold mt-1 ${c.num}`}>
                    {loading ? '…' : count}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">unapproved drafts</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Upcoming scheduled posts */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
          Upcoming scheduled posts
        </h2>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : upcoming.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400 text-sm">
            No posts scheduled yet. Approve a draft and set a schedule time.
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
            {upcoming.map((draft) => {
              const meta = MODULE_META[draft.module] ?? {};
              return (
                <div key={draft.id} className="flex items-center justify-between px-5 py-3 gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl flex-shrink-0">{meta.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {meta.label} · {draft.platform}
                      </p>
                      <p className="text-xs text-gray-400">{fmt(draft.scheduled_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      to={meta.path}
                      className="text-xs px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => cancelSchedule(draft.id)}
                      className="text-xs px-3 py-1.5 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
