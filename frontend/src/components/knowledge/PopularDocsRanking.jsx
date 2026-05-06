import { CheckCircle2, FileText, Layers, Loader2, Maximize2, RefreshCw, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { xragApi } from '../../services/xragApi';

const formatBytes = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (epochMs) => {
  if (!epochMs) return 'â€”';
  return new Date(epochMs).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const PREVIEW_COUNT = 3;

const DocRow = ({ document, rank, compact = false }) => (
  <article className={`rounded-xl border border-slate-200 bg-slate-50 ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`rounded-lg bg-white border border-slate-200 text-[10px] font-black text-slate-600 flex items-center justify-center shrink-0 ${compact ? 'w-6 h-6' : 'w-7 h-7'}`}>
          #{rank}
        </span>
        <div className="min-w-0">
          <p className="font-black text-xs text-slate-800 truncate">{document.name}</p>
          {!compact && (
            <p className="text-[10px] text-slate-500 mt-0.5">{formatDate(document.updated_at)}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {document.status === 'indexed' && <CheckCircle2 size={11} className="text-emerald-500" />}
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
          <Layers size={10} className="text-amber-400" />
          {document.chunk_count || 0}
        </span>
        {!compact && (
          <span className="text-[10px] text-slate-400">{formatBytes(document.size_bytes)}</span>
        )}
      </div>
    </div>
    <div className="h-1 rounded-full bg-slate-200 overflow-hidden">
      <div
        className="h-full rounded-full bg-amber-500"
        style={{ width: `${Math.max(8, Math.min(100, Math.round((document.token_estimate || 50) / 20)))}%` }}
      />
    </div>
    {!compact && (
      <div className="flex items-center gap-3 mt-2">
        <span className="text-[10px] text-slate-500 flex items-center gap-1">
          <Zap size={9} className="text-amber-400" />
          {(document.token_estimate || 0).toLocaleString('en-US')} token
        </span>
        {document.category && (
          <span className="text-[10px] text-indigo-600 font-medium">{document.category}</span>
        )}
      </div>
    )}
  </article>
);

const PopularDocsRanking = ({ className = '' }) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const docs = await xragApi.listKnowledgeDocuments();
      setDocuments(docs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocs(); }, []);

  const ranked = useMemo(() =>
    [...documents]
      .filter((d) => d.status === 'indexed')
      .sort((a, b) => (b.token_estimate || 0) - (a.token_estimate || 0) || (b.chunk_count || 0) - (a.chunk_count || 0)),
    [documents]
  );

  const preview = ranked.slice(0, PREVIEW_COUNT);

  return (
    <>
      <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5 w-full flex flex-col ${className}`}>
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap size={15} className="text-amber-500" />
              <h3 className="text-sm font-black text-slate-800 tracking-tight">Most Content-Rich Documents</h3>
            </div>
            <p className="text-[11px] text-slate-500">Content ranking by tokens & chunk count</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={fetchDocs}
              disabled={loading}
              title="Refresh"
              className="rounded-xl border border-slate-200 bg-slate-50 p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors"
            >
              <Maximize2 size={11} />
              All ({ranked.length})
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        ) : preview.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <FileText size={28} className="text-slate-300" />
            <p className="text-xs text-slate-500 font-medium">No indexed documents yet</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {preview.map((doc, i) => (
              <DocRow key={doc.id} document={doc} rank={i + 1} compact />
            ))}
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50">
              <Zap size={18} className="text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm text-slate-800">Ă–sszes dokumentum â€” tartalomrangsor</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{ranked.length} indexed documents, sorted by token and chunk count</p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg p-1.5 hover:bg-slate-200 text-slate-500">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2.5">
              {ranked.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-10">No indexed documents yet.</p>
              ) : (
                ranked.map((doc, i) => <DocRow key={doc.id} document={doc} rank={i + 1} compact={false} />)
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PopularDocsRanking;
