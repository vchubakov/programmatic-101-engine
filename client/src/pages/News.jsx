import { useState } from 'react';
import ReviewCard from '../components/ReviewCard.jsx';

function ArticleCard({ article, onGenerate, generating, draft, onApprove, onReject, onRegenerate }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Article header */}
      <div className="px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 font-mono mb-1">{article.date}</p>
            <h3 className="text-sm font-semibold text-gray-900 leading-snug mb-1.5">
              {article.headline}
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">
              {article.summary}
            </p>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-blue-500 hover:text-blue-700 mt-1.5 inline-block transition-colors"
            >
              {article.url}
            </a>
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

      {/* Draft output */}
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
  const [loaded, setLoaded]             = useState(false);
  const [fetchingNews, setFetchingNews] = useState(false);

  // Per-article state: { [headline]: { generating, draft } }
  const [articleState, setArticleState] = useState({});

  const [generatingAll, setGeneratingAll] = useState(false);
  const [error, setError]                 = useState(null);

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

  async function fetchNews() {
    setFetchingNews(true);
    setError(null);
    try {
      const res = await fetch('/api/news/fetch');
      const data = await res.json();
      setArticles(Array.isArray(data) ? data : []);
      setLoaded(true);
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
    // Show spinners on all articles
    for (const a of articles) setArticleGenerating(a, true);
    try {
      const res = await fetch('/api/news/generate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generate all failed');
      // Map drafts back to articles by position
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
    // Mark draft approved in local state
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
            {fetchingNews ? 'Loading…' : 'Fetch News'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loaded && !fetchingNews && (
        <div className="rounded-xl border border-dashed border-gray-200 p-16 text-center text-gray-400 text-sm">
          Click "Fetch News" to load the latest articles
        </div>
      )}

      {/* Article cards */}
      {loaded && (
        <div className="space-y-4">
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
        </div>
      )}
    </div>
  );
}
