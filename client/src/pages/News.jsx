import { useState } from 'react';
import ReviewCard from '../components/ReviewCard.jsx';

function ResearcherPanel({ steps }) {
  const [open, setOpen] = useState(false);
  if (!steps?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <span>Researcher reasoning</span>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1.5 border-t border-gray-200">
          {steps.map((s, i) => (
            <div key={i} className="text-[11px] font-mono text-gray-500 pt-1.5">
              <span className="text-blue-500">{s.step}</span>
              {' '}
              {Object.entries(s)
                .filter(([k]) => k !== 'step')
                .map(([k, v]) => `${k}=${v}`)
                .join('  ')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkippedPanel({ skipped }) {
  const [open, setOpen] = useState(false);
  if (!skipped?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
      >
        <span>Skipped articles ({skipped.length})</span>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-200 divide-y divide-gray-100">
          {skipped.map((s, i) => (
            <div key={i} className="px-4 py-2.5">
              <p className="text-xs font-medium text-gray-700 leading-snug">{s.headline}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 italic">{s.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArticleCard({ article, onGenerate, generating, draft, onApprove, onReject, onRegenerate }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[11px] text-gray-400 font-mono">{article.date}</p>
              {article.is_duplicate_risk && (
                <span className="text-[10px] font-semibold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                  Possible duplicate
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-gray-900 leading-snug mb-1.5">
              {article.headline}
            </h3>
            {article.summary && (
              <p className="text-sm text-gray-500 leading-relaxed line-clamp-2 mb-1.5">
                {article.summary}
              </p>
            )}
            <div className="flex items-center gap-2">
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-blue-500 hover:text-blue-700 inline-block transition-colors"
              >
                {article.url}
              </a>
              {article.url && (() => {
                try {
                  return (
                    <span className="text-[11px] text-gray-400">
                      via {new URL(article.url).hostname.replace('www.', '')}
                    </span>
                  );
                } catch { return null; }
              })()}
            </div>
            {article.reason && (
              <p className="text-[12px] text-gray-500 italic mt-2 leading-relaxed">
                <span className="not-italic font-semibold text-gray-600">Why this matters: </span>
                {article.reason}
              </p>
            )}
            {article.suggested_angle && (
              <p className="text-[12px] text-gray-600 mt-1.5 leading-relaxed">
                <span className="font-semibold">Suggested angle: </span>
                {article.suggested_angle}
              </p>
            )}
          </div>
          <button
            onClick={() => onGenerate(article)}
            disabled={generating}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600
                       hover:bg-blue-700 text-white transition-colors disabled:opacity-40 whitespace-nowrap"
          >
            {generating ? 'Generating…' : 'Generate Drafts'}
          </button>
        </div>
      </div>

      {draft && (
        <div className="border-t border-gray-100 p-4 bg-gray-50">
          <ReviewCard
            draft={draft}
            onApprove={onApprove}
            onReject={onReject}
            onRegenerate={(id) => onRegenerate(id, article)}
            scheduleConfigs={[]}
          />
        </div>
      )}

      {generating && !draft && (
        <div className="border-t border-gray-100 p-6 bg-gray-50 flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Writing LinkedIn + X drafts…</span>
        </div>
      )}
    </div>
  );
}

export default function News() {
  const [articles, setArticles]         = useState([]);
  const [skipped, setSkipped]           = useState([]);
  const [researcherSteps, setResearcherSteps] = useState([]);
  const [scrapedAt, setScrapedAt]       = useState(null);
  const [stale, setStale]               = useState(false);
  const [loaded, setLoaded]             = useState(false);
  const [fetchingNews, setFetchingNews] = useState(false);

  const [articleState, setArticleState] = useState({});
  const [generatingAll, setGeneratingAll] = useState(false);
  const [error, setError]               = useState(null);

  function key(article) { return article.headline; }

  function setArticleGenerating(article, val) {
    setArticleState((prev) => ({
      ...prev,
      [key(article)]: { ...prev[key(article)], generating: val },
    }));
  }

  function setArticleDraft(article, draft) {
    setArticleState((prev) => ({
      ...prev,
      [key(article)]: { ...prev[key(article)], generating: false, draft },
    }));
  }

  function formatAge(iso) {
    if (!iso) return '';
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  }

  async function fetchNews() {
    setFetchingNews(true);
    setError(null);
    try {
      const res = await fetch('/api/news/fetch');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fetch failed');
      setArticles(Array.isArray(data.articles) ? data.articles : []);
      setSkipped(data.skipped || []);
      setResearcherSteps(data.researcher_steps || []);
      setScrapedAt(data.scraped_at || null);
      setStale(data.stale || false);
      setLoaded(true);
      setArticleState({});
    } catch (e) {
      setError('Failed to load news: ' + e.message);
    } finally {
      setFetchingNews(false);
    }
  }

  async function generateForArticle(article) {
    setArticleGenerating(article, true);
    setError(null);
    try {
      const res = await fetch('/api/news/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setArticleDraft(article, data);
    } catch (e) {
      setArticleGenerating(article, false);
      setError(e.message);
    }
  }

  async function generateAll() {
    setGeneratingAll(true);
    setError(null);
    for (const a of articles) setArticleGenerating(a, true);
    try {
      const res = await fetch('/api/news/generate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generate all failed');
      for (let i = 0; i < articles.length; i++) {
        if (data[i]) setArticleDraft(articles[i], data[i]);
        else setArticleGenerating(articles[i], false);
      }
    } catch (e) {
      for (const a of articles) setArticleGenerating(a, false);
      setError(e.message);
    } finally {
      setGeneratingAll(false);
    }
  }

  async function onApprove(id, editedText, scheduledAt) {
    await fetch(`/api/drafts/${id}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edited_text: editedText, scheduled_at: scheduledAt }),
    });
    setArticleState((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (next[k].draft?.id === id) {
          next[k] = { ...next[k], draft: { ...next[k].draft, approved: 1 } };
        }
      }
      return next;
    });
  }

  async function onReject(id) {
    await fetch(`/api/drafts/${id}/reject`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });
    setArticleState((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (next[k].draft?.id === id) {
          next[k] = { ...next[k], draft: null };
        }
      }
      return next;
    });
  }

  async function onRegenerate(id, article) {
    await fetch(`/api/drafts/${id}/reject`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });
    setArticleState((prev) => ({
      ...prev,
      [key(article)]: { generating: false, draft: null },
    }));
    generateForArticle(article);
  }

  const anyGenerating = generatingAll || Object.values(articleState).some((s) => s.generating);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">News Scanner</h1>
          <p className="text-xs text-gray-500 mt-0.5">Generate LinkedIn + X drafts from industry news</p>
        </div>

        <div className="flex items-center gap-2">
          {loaded && articles.length > 0 && (
            <button
              onClick={generateAll}
              disabled={anyGenerating}
              className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-gray-800 hover:bg-gray-900
                         text-white transition-colors disabled:opacity-40"
            >
              {generatingAll ? 'Generating all…' : 'Generate All'}
            </button>
          )}
          <button
            onClick={fetchNews}
            disabled={fetchingNews}
            className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700
                       text-white transition-colors disabled:opacity-40"
          >
            {fetchingNews ? 'Scanning…' : 'Fetch News'}
          </button>
        </div>
      </div>

      {/* Stale cache banner */}
      {stale && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          Scraper failed — showing cached results from {formatAge(scrapedAt)}
        </div>
      )}

      {/* Scraped-at timestamp */}
      {scrapedAt && !stale && (
        <p className="text-[11px] text-gray-400">
          Last scraped: {formatAge(scrapedAt)}
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loaded && !fetchingNews && (
        <div className="rounded-xl border border-dashed border-gray-200 p-16 text-center text-gray-400 text-sm">
          Click "Fetch News" to scrape and filter the latest articles
        </div>
      )}

      {/* Loading state */}
      {fetchingNews && (
        <div className="rounded-xl border border-dashed border-gray-200 p-16 text-center">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Scraping maddb.ai and running researcher agent…</p>
          </div>
        </div>
      )}

      {/* Results */}
      {loaded && (
        <div className="space-y-4">
          <ResearcherPanel steps={researcherSteps} />

          {articles.map((article) => {
            const state = articleState[key(article)] ?? {};
            return (
              <ArticleCard
                key={article.headline}
                article={article}
                onGenerate={generateForArticle}
                generating={state.generating ?? false}
                draft={state.draft ?? null}
                onApprove={onApprove}
                onReject={onReject}
                onRegenerate={onRegenerate}
              />
            );
          })}

          <SkippedPanel skipped={skipped} />
        </div>
      )}
    </div>
  );
}
