import { useEffect, useState } from 'react';

export default function Settings() {
  const [settings, setSettings] = useState([]);
  const [edits, setEdits] = useState({});
  const [saved, setSaved] = useState({});

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then(setSettings)
      .catch(console.error);
  }, []);

  async function save(key) {
    const value = edits[key] ?? '';
    await fetch(`/api/settings/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    setSaved((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [key]: false })), 2000);
  }

  const LABELS = {
    anthropic_api_key: 'Anthropic API Key',
    default_platform:  'Default Platform',
    timezone:          'Timezone',
  };

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900">⚙️ Settings</h1>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {settings.map((s) => (
          <div key={s.key} className="px-5 py-4 flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">
              {LABELS[s.key] ?? s.key}
            </label>
            <div className="flex gap-2">
              <input
                type={s.key === 'anthropic_api_key' ? 'password' : 'text'}
                defaultValue={s.value}
                placeholder={s.key === 'anthropic_api_key' ? 'sk-ant-…' : s.value}
                onChange={(e) => setEdits((prev) => ({ ...prev, [s.key]: e.target.value }))}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                onClick={() => save(s.key)}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
              >
                {saved[s.key] ? 'Saved ✓' : 'Save'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
