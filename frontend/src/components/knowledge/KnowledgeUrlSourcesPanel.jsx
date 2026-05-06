import { Globe, Link2, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { xragApi } from '../../services/xragApi';

const isLikelyUrl = (value) => {
  if (!value?.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const KnowledgeUrlSourcesPanel = () => {
  const [sources, setSources] = useState([]);
  const [urlInput, setUrlInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadSources = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const list = await xragApi.listKnowledgeUrlSources();
      setSources(Array.isArray(list) ? list : []);
    } catch (error) {
      setErrorMessage(`URL source list failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  const sortedSources = useMemo(
    () => [...sources].sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0)),
    [sources],
  );

  const submitUrlSource = async (event) => {
    event.preventDefault();
    const url = urlInput.trim();
    if (!isLikelyUrl(url)) {
      setErrorMessage('Please enter a valid http(s) URL.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await xragApi.createKnowledgeUrlSource({
        url,
        label: labelInput.trim(),
        enabled: true,
      });
      setUrlInput('');
      setLabelInput('');
      await loadSources();
    } catch (error) {
      setErrorMessage(`Create URL source failed: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSource = async (source) => {
    try {
      const updated = await xragApi.updateKnowledgeUrlSource(source.id, { enabled: !source.enabled });
      setSources((previous) => previous.map((item) => (item.id === source.id ? updated : item)));
    } catch (error) {
      setErrorMessage(`Update failed: ${error.message}`);
    }
  };

  const removeSource = async (sourceId) => {
    try {
      await xragApi.deleteKnowledgeUrlSource(sourceId);
      setSources((previous) => previous.filter((item) => item.id !== sourceId));
    } catch (error) {
      setErrorMessage(`Delete failed: ${error.message}`);
    }
  };

  return (
    <section data-xrag-tab="knowledge-url-sources" className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/10">
            <Globe size={18} className="text-amber-300" />
          </div>
          <div>
            <h3 className="text-base font-black uppercase tracking-wide text-amber-300">URL Sources</h3>
            <p className="text-[11px] font-semibold text-slate-400">Register external webpages for AI retrieval scope.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadSources}
          className="xrag-btn xrag-btn-ghost"
        >
          <span className="xrag-btn-label">Refresh</span>
        </button>
      </header>

      <form onSubmit={submitUrlSource} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 md:p-5">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <label className="space-y-1.5 lg:col-span-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">URL</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 focus-within:border-amber-500/60">
              <Link2 size={14} className="text-slate-500" />
              <input
                type="url"
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                placeholder="https://example.com/docs"
                className="w-full border-none bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
            </div>
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Label (optional)</span>
            <input
              type="text"
              value={labelInput}
              onChange={(event) => setLabelInput(event.target.value)}
              placeholder="Vendor docs"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-amber-500/60"
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="xrag-btn xrag-btn-primary"
          >
            <Plus size={13} />
            <span className="xrag-btn-label">Add URL Source</span>
          </button>
        </div>

        {errorMessage && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200">
            {errorMessage}
          </p>
        )}
      </form>

      <div className="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden">
        {isLoading ? (
          <p className="px-4 py-5 text-xs font-semibold text-slate-400">Loading URL sources…</p>
        ) : sortedSources.length === 0 ? (
          <p className="px-4 py-5 text-xs font-semibold text-slate-500">No URL sources yet. Add your first source above.</p>
        ) : (
          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-800">
            {sortedSources.map((source) => (
              <div key={source.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-100">{source.label || source.url}</p>
                  <p className="truncate text-xs text-slate-400">{source.url}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSource(source)}
                    className={`xrag-btn ${source.enabled ? 'xrag-btn-ghost' : 'xrag-btn-primary'}`}
                    title={source.enabled ? 'Disable source' : 'Enable source'}
                  >
                    {source.enabled ? <PowerOff size={13} /> : <Power size={13} />}
                    <span className="xrag-btn-label">{source.enabled ? 'Disable' : 'Enable'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSource(source.id)}
                    className="xrag-btn xrag-btn-danger"
                    title="Delete source"
                  >
                    <Trash2 size={13} />
                    <span className="xrag-btn-label">Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default KnowledgeUrlSourcesPanel;
