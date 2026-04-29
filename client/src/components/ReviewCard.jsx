import { useState, useRef, useEffect } from 'react';

// ── helpers ──────────────────────────────────────────────────────────────────

function wordCount(text) {
  if (!text?.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

function relTime(iso) {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function parseJSON(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function AutoTextarea({ value, onChange, placeholder, className, minRows = 4 }) {
  const ref = useRef();
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height =
      Math.max(ref.current.scrollHeight, minRows * 22) + 'px';
  }, [value, minRows]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{ resize: 'none', overflow: 'hidden' }}
      className={className}
    />
  );
}

// ── badge styles ──────────────────────────────────────────────────────────────

const MODULE_BADGE = {
  news:      'bg-blue-950 text-blue-400 border-blue-800',
  education: 'bg-violet-950 text-violet-400 border-violet-800',
  personal:  'bg-amber-950 text-amber-400 border-amber-800',
  memes:     'bg-rose-950 text-rose-400 border-rose-800',
};

const PLATFORM_BADGE = {
  linkedin: 'bg-sky-950 text-sky-400 border-sky-800',
  x:        'bg-zinc-800 text-zinc-300 border-zinc-600',
  both:     'bg-teal-950 text-teal-400 border-teal-800',
};

// ── main component ────────────────────────────────────────────────────────────

export default function ReviewCard({ draft, onApprove, onReject, onRegenerate, scheduleConfigs }) {
  const content = parseJSON(draft.generated_content);
  const source  = parseJSON(draft.source_data);

  const showLinkedin = draft.platform === 'linkedin' || draft.platform === 'both';
  const showX        = draft.platform === 'x'        || draft.platform === 'both';

  // LinkedIn editable text
  const [liText, setLiText] = useState(content.linkedin ?? '');

  // X options: normalize to array of strings
  const rawX = content.x ?? content.tweets ?? content.options ?? [];
  const xOptions = Array.isArray(rawX)
    ? rawX.map(String)
    : rawX ? [String(rawX)] : [];

  const [selectedX, setSelectedX]   = useState(0);
  const [xEdits,    setXEdits]      = useState(xOptions.slice());

  // Schedule picker state
  const [showPicker, setShowPicker] = useState(false);
  const [schedDate,  setSchedDate]  = useState('');
  const [schedTime,  setSchedTime]  = useState('09:00');
  const [busy,       setBusy]       = useState(false);
  const pickerRef = useRef();

  // Pre-fill schedule from config
  useEffect(() => {
    const cfg = scheduleConfigs?.find(
      (c) => c.module === draft.module &&
             (c.platform === draft.platform || c.platform === 'both') &&
             c.active
    );
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setSchedDate(d.toISOString().slice(0, 10));
    if (cfg?.time_cet) setSchedTime(cfg.time_cet);
  }, [scheduleConfigs, draft.module, draft.platform]);

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    function handler(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target))
        setShowPicker(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  // ── actions ──────────────────────────────────────────────────────────────

  async function handleApprove() {
    setBusy(true);
    let editedText;
    if (draft.platform === 'both') {
      editedText = JSON.stringify({ linkedin: liText, x: xEdits[selectedX] ?? xOptions[selectedX] });
    } else if (showLinkedin) {
      editedText = liText;
    } else {
      editedText = xEdits[selectedX] ?? xOptions[selectedX] ?? '';
    }
    const scheduledAt = schedDate && schedTime ? `${schedDate}T${schedTime}:00` : null;
    await onApprove(draft.id, editedText, scheduledAt);
    setBusy(false);
    setShowPicker(false);
  }

  async function handleReject() {
    setBusy(true);
    await onReject(draft.id);
    setBusy(false);
  }

  async function handleRegenerate() {
    setBusy(true);
    await onRegenerate(draft.id);
    setBusy(false);
  }

  function setXEdit(i, val) {
    setXEdits((prev) => { const n = [...prev]; n[i] = val; return n; });
  }

  // ── derived display values ────────────────────────────────────────────────

  const sourceLabel = source.headline ?? source.topic ?? source.title ?? source.url ?? '—';
  const moduleBadge   = MODULE_BADGE[draft.module]     ?? 'bg-gray-800 text-gray-400 border-gray-600';
  const platformBadge = PLATFORM_BADGE[draft.platform] ?? 'bg-gray-800 text-gray-400 border-gray-600';

  const currentXText = xEdits[selectedX] ?? xOptions[selectedX] ?? '';

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-visible">

      {/* ── card header ── */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${moduleBadge}`}>
            {draft.module}
          </span>
          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${platformBadge}`}>
            {draft.platform}
          </span>
        </div>
        <span className="text-xs text-gray-600 font-mono">#{draft.id}</span>
      </div>

      {/* ── source info bar ── */}
      <div className="flex items-center justify-between gap-4 px-3.5 py-2 bg-gray-900 border-b border-gray-800">
        <span className="text-xs text-gray-500 truncate leading-relaxed">{sourceLabel}</span>
        <span className="text-xs text-gray-700 flex-shrink-0 tabular-nums">{relTime(draft.created_at)}</span>
      </div>

      {/* ── content area ── */}
      <div className="p-3.5 space-y-4">

        {/* LinkedIn section */}
        {showLinkedin && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-sky-500 uppercase tracking-wider">
                LinkedIn
              </span>
              <span className="text-[11px] text-gray-600 tabular-nums">
                {wordCount(liText)} words
              </span>
            </div>
            <AutoTextarea
              value={liText}
              onChange={(e) => setLiText(e.target.value)}
              placeholder="LinkedIn post content…"
              minRows={5}
              className="w-full bg-gray-800 border border-gray-700 rounded text-sm text-gray-100
                         px-3 py-2.5 leading-relaxed focus:outline-none focus:border-sky-600
                         placeholder-gray-700 transition-colors"
            />
          </div>
        )}

        {/* X / Twitter section */}
        {showX && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                X / Twitter
              </span>
              <span className="text-[11px] text-gray-600 tabular-nums">
                {currentXText.length} chars
              </span>
            </div>

            {xOptions.length === 0 ? (
              <p className="text-xs text-gray-700 italic px-1">No X content in this draft</p>
            ) : xOptions.length === 1 ? (
              <AutoTextarea
                value={xEdits[0] ?? xOptions[0]}
                onChange={(e) => setXEdit(0, e.target.value)}
                placeholder="X post content…"
                minRows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded text-sm text-gray-100
                           px-3 py-2.5 leading-relaxed focus:outline-none focus:border-zinc-500
                           placeholder-gray-700 transition-colors"
              />
            ) : (
              <div className="space-y-1.5">
                {xOptions.map((opt, i) => {
                  const isSelected = selectedX === i;
                  return (
                    <label
                      key={i}
                      className={`flex gap-2.5 cursor-pointer p-2.5 rounded border transition-colors ${
                        isSelected
                          ? 'border-zinc-500 bg-gray-800'
                          : 'border-gray-800 bg-gray-900 hover:border-gray-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`x-${draft.id}`}
                        checked={isSelected}
                        onChange={() => setSelectedX(i)}
                        className="mt-0.5 flex-shrink-0 accent-zinc-400"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] text-gray-600 uppercase tracking-wider block mb-1">
                          Option {i + 1}
                        </span>
                        {isSelected ? (
                          <AutoTextarea
                            value={xEdits[i] ?? opt}
                            onChange={(e) => setXEdit(i, e.target.value)}
                            minRows={2}
                            className="w-full bg-transparent text-sm text-gray-200 focus:outline-none
                                       leading-relaxed placeholder-gray-700"
                          />
                        ) : (
                          <p className="text-sm text-gray-500 leading-relaxed line-clamp-3">{opt}</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── action buttons ── */}
        <div className="flex items-center gap-2 pt-1 relative">

          {/* Approve & Schedule with popover */}
          <div ref={pickerRef} className="relative">
            <button
              onClick={() => setShowPicker((p) => !p)}
              disabled={busy}
              className="px-3.5 py-1.5 rounded text-sm font-semibold bg-emerald-800 hover:bg-emerald-700
                         text-emerald-100 transition-colors disabled:opacity-40"
            >
              Approve &amp; Schedule
            </button>

            {showPicker && (
              <div className="absolute bottom-full mb-2 left-0 z-50 bg-gray-800 border border-gray-600
                              rounded-lg p-3 shadow-2xl w-64">
                <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">
                  Schedule for
                </p>
                <div className="flex gap-2 mb-2.5">
                  <input
                    type="date"
                    value={schedDate}
                    onChange={(e) => setSchedDate(e.target.value)}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded text-sm text-gray-100
                               px-2 py-1.5 focus:outline-none focus:border-sky-600 transition-colors"
                  />
                  <input
                    type="time"
                    value={schedTime}
                    onChange={(e) => setSchedTime(e.target.value)}
                    className="w-24 bg-gray-700 border border-gray-600 rounded text-sm text-gray-100
                               px-2 py-1.5 focus:outline-none focus:border-sky-600 transition-colors"
                  />
                </div>
                <button
                  onClick={handleApprove}
                  disabled={busy || !schedDate}
                  className="w-full py-1.5 rounded text-sm font-semibold bg-emerald-700 hover:bg-emerald-600
                             text-emerald-100 transition-colors disabled:opacity-40"
                >
                  {busy ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleRegenerate}
            disabled={busy}
            className="px-3.5 py-1.5 rounded text-sm font-semibold bg-gray-700 hover:bg-gray-600
                       text-gray-300 transition-colors disabled:opacity-40"
          >
            Regenerate
          </button>

          <button
            onClick={handleReject}
            disabled={busy}
            className="px-3.5 py-1.5 rounded text-sm font-semibold bg-rose-950 hover:bg-rose-900
                       text-rose-400 border border-rose-900 hover:border-rose-800 transition-colors
                       disabled:opacity-40"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
