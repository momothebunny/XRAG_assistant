import {
  AlertCircle,
  BookMarked,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Link2,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { xragApi } from '../../services/xragApi';

// ── Helper ────────────────────────────────────────────────────────────────────
const fmtDate = (epochMs) =>
  epochMs
    ? new Date(epochMs).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const fmtDateShort = (epochMs) =>
  epochMs
    ? new Date(epochMs).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

// ── Prompt row (mirrors renderDocumentRow style) ──────────────────────────────
const PromptRow = ({ answer, isSelected, onSelect, onDelete }) => (
  <li
    data-doc-row="true"
    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
      isSelected ? 'bg-amber-50/60' : 'hover:bg-slate-50'
    }`}
    onClick={() => onSelect(answer.id)}
  >
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 mt-0.5">
      <MessageSquare size={14} className="text-amber-600" />
    </div>

    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-slate-800 truncate leading-snug">
        {answer.content.slice(0, 80)}{answer.content.length > 80 ? '…' : ''}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {answer.promptReference && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-100">
            <Link2 size={9} />
            {answer.promptReference}
          </span>
        )}
        {answer.sources?.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-sky-100">
            <FileText size={9} />
            {answer.sources.length} source{answer.sources.length !== 1 ? 's' : ''}
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
          <Clock size={9} />
          {fmtDateShort(answer.createdAt)}
        </span>
      </div>
    </div>

    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onDelete(answer.id); }}
      title="Delete"
      className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 shrink-0 transition-colors"
    >
      <Trash2 size={12} />
    </button>
  </li>
);

// ── Detail panel ──────────────────────────────────────────────────────────────
const PromptDetail = ({ answer }) => (
  <div
    data-chunk-preview="true"
    className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[280px] max-h-[70vh]"
  >
    {/* Header */}
    <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50/80 to-indigo-50/50 shrink-0">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 shrink-0">
        <Sparkles size={16} className="text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black uppercase tracking-wider text-slate-700">AI Response</p>
        {answer.promptReference && (
          <p className="text-[10px] text-amber-500 font-bold flex items-center gap-1 truncate mt-0.5">
            <Link2 size={9} /> {answer.promptReference}
          </p>
        )}
      </div>
      <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1 shrink-0">
        <CalendarDays size={10} />
        {fmtDate(answer.createdAt)}
      </span>
    </div>

    {/* Body */}
    <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4" style={{ scrollbarGutter: 'stable' }}>
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{answer.content}</p>
    </div>

    {/* Sources */}
    {answer.sources?.length > 0 && (
      <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Sources</p>
        <div className="flex flex-wrap gap-2">
          {answer.sources.map((src, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-[10px] font-bold bg-white border border-slate-200 text-slate-600 px-2.5 py-1 rounded-lg shadow-sm"
            >
              <FileText size={10} />
              {src.label ?? src.chunkId ?? `Source ${i + 1}`}
            </span>
          ))}
        </div>
      </div>
    )}

    {/* Reasoning */}
    {answer.reasoning && (
      <div className="px-5 py-4 border-t border-slate-100 bg-indigo-50/30 shrink-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-2">Reasoning trace</p>
        <p className="text-[10px] text-slate-500 leading-relaxed">{answer.reasoning}</p>
      </div>
    )}
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const SavedPromptsPanel = () => {
  const [answers, setAnswers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const refresh = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const list = await xragApi.listAnswers();
      setAnswers(list);
    } catch (err) {
      setErrorMessage(`Could not load saved prompts: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // Deselect on outside click
  useEffect(() => {
    if (!selectedId) return;
    const handler = (e) => {
      if (e.target.closest('[data-doc-row]') || e.target.closest('[data-chunk-preview]')) return;
      setSelectedId(null);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [selectedId]);

  const handleDelete = async (id) => {
    setErrorMessage('');
    try {
      await xragApi.deleteAnswer(id);
      if (selectedId === id) setSelectedId(null);
      setAnswers((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setErrorMessage(`Delete failed: ${err.message}`);
    }
  };

  const handleDeleteAll = async () => {
    if (!answers.length) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete all ${answers.length} saved prompt(s)? This cannot be undone.`
    );
    if (!confirmed) return;
    setIsDeletingAll(true);
    setErrorMessage('');
    try {
      await Promise.allSettled(answers.map((a) => xragApi.deleteAnswer(a.id)));
      setSelectedId(null);
      setAnswers([]);
    } catch (err) {
      setErrorMessage(`Deletion failed: ${err.message}`);
    } finally {
      setIsDeletingAll(false);
    }
  };

  const totals = useMemo(() => {
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    return answers.reduce(
      (acc, a) => {
        acc.sources += a.sources?.length ?? 0;
        if (a.createdAt >= thisMonth.getTime()) acc.thisMonth += 1;
        if (a.promptReference) acc.withRef += 1;
        return acc;
      },
      { sources: 0, thisMonth: 0, withRef: 0 }
    );
  }, [answers]);

  const selectedAnswer = answers.find((a) => a.id === selectedId) ?? null;

  return (
    <section className="space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-indigo-600 shadow-md">
            <BookMarked className="text-white" size={20} />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-900 uppercase">Saved AI Prompts</h2>
            <p className="text-[11px] text-slate-500 leading-snug">
              AI responses saved from the Chat tab. Click a row to inspect the full answer, sources, and reasoning trace.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total saved',    value: answers.length,      Icon: BookMarked,    tint: 'bg-amber-50 text-amber-600' },
          { label: 'This month',     value: totals.thisMonth,    Icon: CalendarDays,  tint: 'bg-indigo-50 text-indigo-600' },
          { label: 'With ref.',      value: totals.withRef,      Icon: Link2,         tint: 'bg-sky-50 text-sky-600' },
          { label: 'Total sources',  value: totals.sources,      Icon: BrainCircuit,  tint: 'bg-amber-50 text-amber-600' },
        ].map((stat) => {
          const StatIcon = stat.Icon;
          return (
            <div key={stat.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.tint}`}>
                <StatIcon size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{stat.label}</p>
                <p className="text-xl font-black text-slate-900 leading-tight">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main grid: list + optional detail */}
      <div
        className={`grid gap-4 items-stretch ${
          selectedId ? 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]' : 'lg:grid-cols-1'
        }`}
      >
        {/* List card */}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[280px] max-h-[70vh]">
          {/* Card header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/60 shrink-0">
            <div className="flex items-center gap-2">
              <BookMarked size={14} className="text-slate-500" />
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-600">Saved prompts</h3>
              {answers.length > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  {answers.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isLoading && <Loader2 className="animate-spin text-slate-400" size={14} />}
              {answers.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteAll}
                  disabled={isDeletingAll}
                  title={`Delete all saved prompts (${answers.length})`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 disabled:opacity-60 transition-colors"
                >
                  {isDeletingAll ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {errorMessage && (
            <div className="mx-4 my-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 shrink-0">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span className="flex-1">{errorMessage}</span>
              <button type="button" onClick={() => setErrorMessage('')} className="text-rose-500 hover:text-rose-700">
                <X size={14} />
              </button>
            </div>
          )}

          {/* List or empty state */}
          {answers.length === 0 && !isLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <BookMarked size={24} />
              </div>
              <p className="text-sm font-black text-slate-500">No saved prompts yet</p>
              <p className="text-xs text-slate-400 max-w-xs">
                In the Chat tab, click the bookmark icon on any AI response to save it here.
              </p>
            </div>
          ) : (
            <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100" style={{ scrollbarGutter: 'stable' }}>
              {answers.map((answer) => (
                <PromptRow
                  key={answer.id}
                  answer={answer}
                  isSelected={selectedId === answer.id}
                  onSelect={setSelectedId}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Detail panel */}
        {selectedAnswer && <PromptDetail answer={selectedAnswer} />}
      </div>
    </section>
  );
};

export default SavedPromptsPanel;
