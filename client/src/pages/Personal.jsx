import { useState } from 'react';
import ReviewCard from '../components/ReviewCard.jsx';

const QUESTIONS = [
  "What's the specific moment or situation you want to write about?",
  "What were you feeling or thinking at the time? Be honest.",
  "What did you do or say?",
  "What was the outcome, or what did you learn?",
  "Why would someone else in your industry care about this?",
];

const EMPTY_ANSWERS = ['', '', '', '', ''];

export default function Personal() {
  const [step, setStep]           = useState(0);   // 0-4: questions, 5: generating/done
  const [answers, setAnswers]     = useState([...EMPTY_ANSWERS]);
  const [draft, setDraft]         = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError]         = useState(null);

  function setAnswer(value) {
    setAnswers((prev) => {
      const next = [...prev];
      next[step] = value;
      return next;
    });
  }

  function handleNext() {
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    }
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setDraft(null);
    setStep(5);
    try {
      const res = await fetch('/api/personal/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          a1: answers[0],
          a2: answers[1],
          a3: answers[2],
          a4: answers[3],
          a5: answers[4],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setDraft(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  function handleStartOver() {
    setStep(0);
    setAnswers([...EMPTY_ANSWERS]);
    setDraft(null);
    setError(null);
    setGenerating(false);
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
    handleStartOver();
  }

  async function onRegenerate(id) {
    await fetch(`/api/drafts/${id}/reject`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });
    handleGenerate();
  }

  // ── Question step ──────────────────────────────────────────────
  if (step <= 4) {
    const canAdvance = answers[step].trim().length > 0;
    const isLast = step === QUESTIONS.length - 1;

    return (
      <div className="max-w-2xl mx-auto pt-8">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">Personal Story</h1>
          <p className="text-xs text-gray-500 mt-0.5">Answer five questions to generate a post</p>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-8">
          {QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < step ? 'bg-violet-500' : i === step ? 'bg-violet-300' : 'bg-gray-100'
              }`}
            />
          ))}
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
              Step {step + 1} of {QUESTIONS.length}
            </p>
            <p className="text-base font-semibold text-gray-900 leading-snug">
              {QUESTIONS[step]}
            </p>
          </div>

          <textarea
            key={step}
            value={answers[step]}
            onChange={(e) => setAnswer(e.target.value)}
            autoFocus
            rows={5}
            placeholder="Write your answer here…"
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm
                       text-gray-800 placeholder-gray-400 focus:outline-none focus:border-violet-400
                       transition-colors resize-none"
          />

          <div className="flex items-center justify-between">
            <button
              onClick={handleBack}
              disabled={step === 0}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-0"
            >
              ← Back
            </button>

            {isLast ? (
              <button
                onClick={handleGenerate}
                disabled={!canAdvance}
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-700
                           text-white transition-colors disabled:opacity-40"
              >
                Generate Post
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!canAdvance}
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-700
                           text-white transition-colors disabled:opacity-40"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Generating / result ────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto pt-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">Personal Story</h1>
          <p className="text-xs text-gray-500 mt-0.5">Generated post</p>
        </div>
        <button
          onClick={handleStartOver}
          className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          Start Over
        </button>
      </div>

      {generating ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Writing post…</p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          {error}
          <button
            onClick={() => setStep(4)}
            className="block mt-3 text-rose-600 underline hover:text-rose-800"
          >
            ← Go back and try again
          </button>
        </div>
      ) : draft ? (
        <ReviewCard
          draft={draft}
          onApprove={onApprove}
          onReject={onReject}
          onRegenerate={onRegenerate}
          scheduleConfigs={[]}
        />
      ) : null}
    </div>
  );
}
