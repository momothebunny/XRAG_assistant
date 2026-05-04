import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Key, Plus, Star, Trash2, Upload } from 'lucide-react';
import { xragApi } from '../../services/xragApi';

/**
 * ApiKeyImportPanel
 * -----------------
 * Manages multiple API keys per provider. The "active" key for each
 * environment variable is mirrored server-side into ``os.environ`` so all
 * existing flows (chat / RAG, fact-check, document compare, canvas runner,
 * model health probes, classifier, Pinecone, OpenRouter proxy) pick it up
 * automatically — no per-flow rewiring required.
 */
const ApiKeyImportPanel = () => {
  const [providers, setProviders] = useState([]);
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Add form
  const [provider, setProvider] = useState('openai');
  const [label, setLabel] = useState('');
  const [envVar, setEnvVar] = useState('');
  const [keyValue, setKeyValue] = useState('');
  const [makeActive, setMakeActive] = useState(true);

  // Bulk import
  const [importText, setImportText] = useState('');
  const [importActivate, setImportActivate] = useState(true);
  const [importReport, setImportReport] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [providerList, keyList] = await Promise.all([
        xragApi.listApiKeyProviders(),
        xragApi.listApiKeys(),
      ]);
      setProviders(providerList);
      setKeys(keyList);
      setError('');
    } catch (exc) {
      setError(exc?.message || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const providerOption = useMemo(
    () => providers.find((p) => p.id === provider) || null,
    [providers, provider]
  );

  const defaultEnvVar = providerOption?.env_vars?.[0] || '';
  const effectiveEnvVar = (envVar || defaultEnvVar || '').toUpperCase();

  const handleAdd = async (event) => {
    event.preventDefault();
    if (!keyValue.trim()) {
      setError('API key value is required.');
      return;
    }
    setBusy(true);
    try {
      await xragApi.upsertApiKey({
        label: label.trim() || `${providerOption?.label || provider} key`,
        provider,
        env_var: effectiveEnvVar || null,
        key: keyValue.trim(),
        is_active: makeActive,
      });
      setLabel('');
      setKeyValue('');
      setEnvVar('');
      setError('');
      await loadAll();
    } catch (exc) {
      setError(exc?.message || 'Could not save API key');
    } finally {
      setBusy(false);
    }
  };

  const handleActivate = async (id) => {
    setBusy(true);
    try {
      await xragApi.activateApiKey(id);
      await loadAll();
    } catch (exc) {
      setError(exc?.message || 'Activation failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this API key? Flows using its env var will lose access.')) {
      return;
    }
    setBusy(true);
    try {
      await xragApi.deleteApiKey(id);
      await loadAll();
    } catch (exc) {
      setError(exc?.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (event) => {
    event.preventDefault();
    if (!importText.trim()) {
      setError('Paste at least one KEY=value line.');
      return;
    }
    setBusy(true);
    try {
      const report = await xragApi.importApiKeys(importText, importActivate);
      setImportReport(report);
      setImportText('');
      setError('');
      await loadAll();
    } catch (exc) {
      setError(exc?.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  // Group keys by env_var so the user immediately sees which one is active.
  const grouped = useMemo(() => {
    const groups = new Map();
    for (const entry of keys) {
      const bucket = entry.env_var || 'OTHER';
      if (!groups.has(bucket)) groups.set(bucket, []);
      groups.get(bucket).push(entry);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [keys]);

  return (
    <section className="space-y-4">
      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
        <Key size={16} /> API Keys & Secrets
      </h3>

      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 space-y-8">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
              {error}
            </div>
          )}

          {/* ---------- Add single key ---------- */}
          <form onSubmit={handleAdd} className="space-y-4">
            <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              Add a new API key
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    setEnvVar('');
                  }}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Label (visible in UI)
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={`${providerOption?.label || ''} – production`}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Environment variable
                </label>
                <input
                  type="text"
                  value={envVar}
                  onChange={(e) => setEnvVar(e.target.value)}
                  placeholder={defaultEnvVar || 'XRAG_CUSTOM_…'}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-400 font-medium">
                  Defaults to <span className="font-mono">{defaultEnvVar || '—'}</span>. The active key is exported to
                  the backend process so every flow that reads <span className="font-mono">os.getenv()</span> picks it
                  up automatically.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">API key</label>
                <input
                  type="password"
                  value={keyValue}
                  onChange={(e) => setKeyValue(e.target.value)}
                  placeholder="sk-…"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-500"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <input
                  type="checkbox"
                  checked={makeActive}
                  onChange={(e) => setMakeActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Set as active for <span className="font-mono">{effectiveEnvVar || 'this provider'}</span>
              </label>
              <button
                type="submit"
                disabled={busy || !keyValue.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:bg-slate-300 disabled:shadow-none"
              >
                <Plus size={14} /> Save key
              </button>
            </div>
          </form>

          {/* ---------- Existing keys ---------- */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              Stored keys
            </h4>

            {loading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : grouped.length === 0 ? (
              <p className="text-xs text-slate-400">
                No API keys yet — add one above or paste an .env block below.
              </p>
            ) : (
              <div className="space-y-4">
                {grouped.map(([envName, entries]) => (
                  <div key={envName} className="rounded-2xl border border-slate-100 bg-slate-50/60 overflow-hidden">
                    <div className="px-4 py-2 border-b border-slate-100 bg-white flex items-center justify-between">
                      <span className="font-mono text-[11px] font-black text-slate-700">{envName}</span>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                        {entries.length} key{entries.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {entries.map((entry) => (
                        <li key={entry.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-slate-800 truncate">
                              {entry.label}
                            </p>
                            <p className="text-[10px] text-slate-500 font-mono truncate">
                              {entry.provider} · {entry.masked_key || '—'}
                            </p>
                          </div>
                          {entry.is_active ? (
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest">
                              <CheckCircle2 size={12} /> Active
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleActivate(entry.id)}
                              disabled={busy}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
                            >
                              <Star size={12} /> Activate
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(entry.id)}
                            disabled={busy}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                            aria-label="Delete key"
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---------- Bulk import ---------- */}
          <form onSubmit={handleImport} className="space-y-3 pt-4 border-t border-slate-100">
            <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              Import from .env
            </h4>
            <p className="text-[11px] text-slate-500">
              Paste KEY=value lines. Recognised env-vars are imported automatically; unknown ones are skipped.
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'OPENAI_API_KEY=sk-…\nOPENROUTER_API_KEY=sk-or-…\nPINECONE_API_KEY=…'}
              rows={6}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <input
                  type="checkbox"
                  checked={importActivate}
                  onChange={(e) => setImportActivate(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Activate imported keys (overrides existing active per env-var)
              </label>
              <button
                type="submit"
                disabled={busy || !importText.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 disabled:bg-slate-300 disabled:shadow-none"
              >
                <Upload size={14} /> Import
              </button>
            </div>

            {importReport && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600 space-y-1">
                <p className="font-black text-slate-700">
                  Imported {importReport.imported.length} · Skipped {importReport.skipped.length}
                </p>
                {importReport.skipped.length > 0 && (
                  <ul className="list-disc pl-5 space-y-0.5">
                    {importReport.skipped.slice(0, 5).map((s, i) => (
                      <li key={i}>
                        <span className="font-mono">{s.line}</span> — {s.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  );
};

export default ApiKeyImportPanel;
