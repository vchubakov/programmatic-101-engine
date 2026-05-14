import { useEffect, useState } from 'react';

const CREDENTIAL_FIELDS = [
  {
    key:         'anthropic_api_key',
    label:       'Anthropic API Key',
    placeholder: 'sk-ant-…',
    hint:        'Used for all Claude-powered generation and the learning agent.',
  },
  {
    key:         'linkedin_client_id',
    label:       'LinkedIn Client ID',
    placeholder: '86xxxxxxxx',
    hint:        'OAuth app credentials from the LinkedIn Developer Portal.',
  },
  {
    key:         'linkedin_client_secret',
    label:       'LinkedIn Client Secret',
    placeholder: 'WPL_AP1…',
    hint:        null,
  },
  {
    key:         'brave_api_key',
    label:       'Brave Search API Key',
    placeholder: 'BSA…',
    hint:        'Used for news scanning via the Brave Search API.',
  },
];

const OTHER_LABELS = {
  default_platform: 'Default Platform',
  timezone:         'Timezone',
};

function mask(value) {
  if (!value || value.length <= 8) return value ? '••••••••' : '';
  return value.slice(0, 4) + '••••••••' + value.slice(-4);
}

function CredentialRow({ field, storedValue, onSave }) {
  const [editing, setEditing]     = useState(false);
  const [draft, setDraft]         = useState('');
  const [busy, setBusy]           = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  function startEdit() { setDraft(''); setEditing(true); }
  function cancel()    { setEditing(false); setDraft(''); }

  async function save() {
    setBusy(true);
    await onSave(field.key, draft);
    setBusy(false);
    setEditing(false);
    setDraft('');
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 2000);
  }

  const hasValue = !!storedValue;

  return (
    <div className="px-5 py-4 space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-200">{field.label}</label>
        {hasValue && !editing && (
          <span className="text-[11px] text-emerald-500 font-semibold uppercase tracking-wider">
            {confirmed ? 'Saved ✓' : 'Configured'}
          </span>
        )}
        {!hasValue && !editing && (
          <span className="text-[11px] text-gray-600 uppercase tracking-wider">Not set</span>
        )}
      </div>

      {field.hint && (
        <p className="text-xs text-gray-600">{field.hint}</p>
      )}

      {editing ? (
        <div className="flex gap-2">
          <input
            type="password"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={field.placeholder}
            autoFocus
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm
                       text-gray-100 placeholder-gray-600 focus:outline-none focus:border-violet-500
                       transition-colors"
          />
          <button
            onClick={save}
            disabled={busy || !draft.trim()}
            className="px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white text-sm font-medium
                       rounded-lg transition-colors disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={cancel}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg
                       transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2
                           text-sm font-mono text-gray-500 select-none">
            {hasValue ? mask(storedValue) : <span className="italic text-gray-700">empty</span>}
          </span>
          <button
            onClick={startEdit}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium
                       rounded-lg transition-colors"
          >
            {confirmed ? 'Saved ✓' : hasValue ? 'Update' : 'Set'}
          </button>
        </div>
      )}
    </div>
  );
}

function LinkedInConnection() {
  const [status, setStatus]   = useState(null);
  const [busy, setBusy]       = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Check for ?connected=true or ?error=... in URL after OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      setMessage('LinkedIn connected successfully!');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('error')) {
      setMessage(`Connection failed: ${params.get('error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }

    fetch('/auth/linkedin/status')
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }));
  }, []);

  async function disconnect() {
    setBusy(true);
    await fetch('/auth/linkedin/disconnect', { method: 'POST' });
    setStatus({ connected: false });
    setBusy(false);
  }

  async function refresh() {
    setBusy(true);
    const res  = await fetch('/auth/linkedin/refresh', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      setStatus(prev => ({ ...prev, expires_at: data.expires_at, needs_refresh: false }));
      setMessage('Token refreshed successfully');
      setTimeout(() => setMessage(''), 3000);
    } else {
      setMessage('Refresh failed: ' + (data.error || 'unknown error'));
    }
    setBusy(false);
  }

  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
  }

  const isExpiringSoon = status?.needs_refresh;

  return (
    <div className="px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-200">LinkedIn Account</label>
        {status?.connected && (
          <span className="text-[11px] text-emerald-500 font-semibold uppercase tracking-wider">
            Connected
          </span>
        )}
      </div>

      {message && (
        <p className={`text-xs ${message.includes('failed') || message.includes('Failed')
          ? 'text-rose-400' : 'text-emerald-400'}`}>
          {message}
        </p>
      )}

      {!status ? (
        <p className="text-xs text-gray-600">Checking status…</p>
      ) : status.connected ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              Connected as {status.name}
            </span>
          </div>
          <p className={`text-xs ${isExpiringSoon ? 'text-rose-400' : 'text-gray-600'}`}>
            Token expires: {formatDate(status.expires_at)}
            {isExpiringSoon && ' — expiring soon!'}
          </p>
          <div className="flex gap-2 pt-1">
            {status.needs_refresh && (
              <button
                onClick={refresh}
                disabled={busy}
                className="px-3 py-1.5 bg-amber-900 hover:bg-amber-800 text-amber-200 text-xs
                           font-medium rounded-lg transition-colors disabled:opacity-40"
              >
                {busy ? 'Refreshing…' : 'Refresh Token'}
              </button>
            )}
            <button
              onClick={disconnect}
              disabled={busy}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs
                         font-medium rounded-lg transition-colors disabled:opacity-40"
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-600">
            Connect your LinkedIn account to enable auto-posting.
          </p>
          <a
            href="/auth/linkedin/connect"
            className="inline-block px-4 py-2 bg-sky-800 hover:bg-sky-700 text-sky-100 text-sm
                       font-medium rounded-lg transition-colors"
          >
            Connect LinkedIn
          </a>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const [settingsMap, setSettingsMap] = useState({});
  const [edits, setEdits]             = useState({});
  const [saved, setSaved]             = useState({});

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(rows => {
        const map = {};
        for (const row of rows) map[row.key] = row.value;
        setSettingsMap(map);
      })
      .catch(console.error);
  }, []);

  async function saveKey(key, value) {
    await fetch(`/api/settings/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    setSettingsMap(prev => ({ ...prev, [key]: value }));
  }

  async function saveOther(key) {
    const value = edits[key] ?? settingsMap[key] ?? '';
    await fetch(`/api/settings/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    setSettingsMap(prev => ({ ...prev, [key]: value }));
    setSaved(prev => ({ ...prev, [key]: true }));
    setTimeout(() => setSaved(prev => ({ ...prev, [key]: false })), 2000);
  }

  const credentialKeys = new Set(CREDENTIAL_FIELDS.map(f => f.key));
  const otherKeys = Object.keys(settingsMap).filter(k => !credentialKeys.has(k));

  return (
    <div className="space-y-8 max-w-xl">
      <h1 className="text-xl font-bold text-gray-100">Settings</h1>

      {/* LinkedIn connection */}
      <div>
        <p className="text-[11px] text-gray-600 uppercase tracking-wider mb-3">LinkedIn</p>
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <LinkedInConnection />
        </div>
      </div>

      {/* Credentials section */}
      <div>
        <p className="text-[11px] text-gray-600 uppercase tracking-wider mb-3">API Credentials</p>
        <div className="bg-gray-900 border border-gray-700 rounded-xl divide-y divide-gray-800 overflow-hidden">
          {CREDENTIAL_FIELDS.map(field => (
            <CredentialRow
              key={field.key}
              field={field}
              storedValue={settingsMap[field.key] ?? ''}
              onSave={saveKey}
            />
          ))}
        </div>
      </div>

      {/* Other settings */}
      {otherKeys.length > 0 && (
        <div>
          <p className="text-[11px] text-gray-600 uppercase tracking-wider mb-3">Preferences</p>
          <div className="bg-gray-900 border border-gray-700 rounded-xl divide-y divide-gray-800 overflow-hidden">
            {otherKeys.map(key => (
              <div key={key} className="px-5 py-4 space-y-2">
                <label className="text-sm font-medium text-gray-200">
                  {OTHER_LABELS[key] ?? key}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    defaultValue={settingsMap[key]}
                    onChange={e => setEdits(prev => ({ ...prev, [key]: e.target.value }))}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
                               text-gray-100 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                  <button
                    onClick={() => saveOther(key)}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm
                               font-medium rounded-lg transition-colors"
                  >
                    {saved[key] ? 'Saved ✓' : 'Save'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
