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
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  function startEdit() {
    setDraft('');
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft('');
  }

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
