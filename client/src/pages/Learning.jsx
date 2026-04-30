import { useState, useEffect, useCallback } from 'react';

const SCOPE_LABELS = {
  global:              'Global',
  linkedin_news:       'LinkedIn · News',
  linkedin_education:  'LinkedIn · Education',
  linkedin_personal:   'LinkedIn · Personal',
  x_news:              'X · News',
  x_general:           'X · General',
};

function relTime(iso) {
  if (!iso) return 'never';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusBadge({ learning }) {
  if (!learning.prompt_patch) {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded border
                       bg-gray-800 text-gray-500 border-gray-700">
        NO PATCH
      </span>
    );
  }
  if (learning.patch_approved) {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded border
                       bg-emerald-950 text-emerald-400 border-emerald-800">
        APPROVED
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded border
                     bg-amber-950 text-amber-400 border-amber-800">
      PENDING REVIEW
    </span>
  );
}

function LearningCard({ learning, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false);

  const isPending = !!learning.prompt_patch && !learning.patch_approved;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-200">
            {SCOPE_LABELS[learning.scope] ?? learning.scope}
          </span>
          <StatusBadge learning={learning} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-600">
            Updated {relTime(learning.updated_at)}
          </span>
          {learning.version > 0 && (
            <span className="text-[11px] text-gray-600 font-mono">v{learning.version}</span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Running notes */}
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Running Notes</p>
          {learning.running_notes?.trim() ? (
            <div className="bg-gray-800 rounded p-3 text-xs text-gray-400 leading-relaxed
                            max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
              {learning.running_notes.trim()}
            </div>
          ) : (
            <p className="text-xs text-gray-700 italic">No observations yet. Run the learning agent to generate notes.</p>
          )}
        </div>

        {/* Prompt patch */}
        {learning.prompt_patch && (
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">
              Prompt Patch {learning.patch_approved ? '(active)' : '(pending approval)'}
            </p>
            <pre className="bg-gray-800 border border-gray-700 rounded p-3 text-xs text-amber-300
                            leading-relaxed overflow-x-auto whitespace-pre-wrap">
              {learning.prompt_patch}
            </pre>
          </div>
        )}

        {/* Approve / Reject buttons */}
        {isPending && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onApprove(learning.scope)}
              className="px-4 py-1.5 rounded text-sm font-semibold bg-emerald-800 hover:bg-emerald-700
                         text-emerald-100 transition-colors"
            >
              Approve
            </button>
            <button
              onClick={() => onReject(learning.scope)}
              className="px-4 py-1.5 rounded text-sm font-semibold bg-rose-950 hover:bg-rose-900
                         text-rose-400 border border-rose-900 transition-colors"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Learning() {
  const [learnings, setLearnings] = useState([]);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [error, setError] = useState(null);

  const fetchLearnings = useCallback(() => {
    fetch('/api/agents/learnings')
      .then(r => r.json())
      .then(setLearnings)
      .catch(err => setError(err.message));
  }, []);

  useEffect(() => { fetchLearnings(); }, [fetchLearnings]);

  async function handleRunAgent() {
    setRunning(true);
    setRunResult(null);
    setError(null);
    try {
      const r = await fetch('/api/agents/learn', { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      setRunResult(data.results);
      fetchLearnings();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function handleApprove(scope) {
    await fetch(`/api/agents/learnings/${scope}/approve`, { method: 'PATCH' });
    fetchLearnings();
  }

  async function handleReject(scope) {
    await fetch(`/api/agents/learnings/${scope}/reject`, { method: 'PATCH' });
    fetchLearnings();
  }

  const nonGlobal = learnings.filter(l => l.scope !== 'global');
  const globalRow = learnings.find(l => l.scope === 'global');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Learning Control Panel</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review performance insights and prompt patches generated by the learning agent.
          </p>
        </div>
        <button
          onClick={handleRunAgent}
          disabled={running}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-700 hover:bg-violet-600
                     text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? 'Running…' : 'Run Learning Agent'}
        </button>
      </div>

      {error && (
        <div className="bg-rose-950 border border-rose-800 rounded-lg px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Run result summary */}
      {runResult && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-3">Last Run Results</p>
          <div className="space-y-1">
            {runResult.map((r, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="text-gray-400 font-mono w-40">{r.scope}</span>
                {r.skipped ? (
                  <span className="text-gray-600">skipped — {r.reason}</span>
                ) : r.error ? (
                  <span className="text-rose-400">error: {r.error}</span>
                ) : (
                  <>
                    <span className={r.patch_warranted ? 'text-amber-400' : 'text-gray-500'}>
                      {r.patch_warranted ? 'patch proposed' : 'no patch'}
                    </span>
                    <span className="text-gray-600">{r.data_points} posts · {r.confidence} confidence</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scope cards */}
      {learnings.length === 0 ? (
        <p className="text-sm text-gray-600 italic">Loading…</p>
      ) : (
        <div className="space-y-4">
          {nonGlobal.map(learning => (
            <LearningCard
              key={learning.scope}
              learning={learning}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}

          {/* Global notes at bottom */}
          {globalRow && (
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Global Notes</p>
              <LearningCard
                learning={globalRow}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
