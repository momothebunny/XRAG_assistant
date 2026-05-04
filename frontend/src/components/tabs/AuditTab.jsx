import {
  Activity,
  AlertCircle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Database,
  Download,
  Eye,
  EyeOff,
  FlaskConical,
  Info,
  Loader2,
  Minus,
  Network,
  PlayCircle,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  Swords,
  Target,
  Trash2,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { xragApi } from '../../services/xragApi';

const MAX_Q = 15;

// ── Small helpers ─────────────────────────────────────────────────────────

const ACCENT_PALETTE = [
  { bg: 'bg-indigo-600', light: 'bg-indigo-50', border: 'border-indigo-300', text: 'text-indigo-700', badge: 'bg-indigo-100 text-indigo-800' },
  { bg: 'bg-amber-600', light: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  { bg: 'bg-sky-600',    light: 'bg-sky-50',    border: 'border-sky-300',    text: 'text-sky-700',    badge: 'bg-sky-100 text-sky-800'    },
  { bg: 'bg-emerald-600',light: 'bg-emerald-50',border: 'border-emerald-300',text: 'text-emerald-700',badge: 'bg-emerald-100 text-emerald-800' },
  { bg: 'bg-rose-600',   light: 'bg-rose-50',   border: 'border-rose-300',   text: 'text-rose-700',   badge: 'bg-rose-100 text-rose-800'   },
  { bg: 'bg-amber-600',  light: 'bg-amber-50',  border: 'border-amber-300',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-800'  },
  { bg: 'bg-amber-600',light: 'bg-amber-50',border: 'border-amber-300',text: 'text-amber-700',badge: 'bg-amber-100 text-amber-800' },
  { bg: 'bg-teal-600',   light: 'bg-teal-50',   border: 'border-teal-300',   text: 'text-teal-700',   badge: 'bg-teal-100 text-teal-800'   },
];

const labelAccent = (label) => {
  const idx = label.charCodeAt(label.length - 1) - 65; // "A"→0, "B"→1 …
  return ACCENT_PALETTE[idx % ACCENT_PALETTE.length];
};

const fmt = (ms) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

// Format an elapsed-milliseconds value into a compact `Xm Ys` string used
// by the live progress panel. Anything under a second falls back to ms.
const fmtElapsed = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
};

// Curated judge model presets surfaced in the start-run form. Empty value
// means “use the server default” (XRAG_JUDGE_MODEL env var).
const JUDGE_MODEL_PRESETS = [
  { value: '', label: 'Server default (gpt-4o-mini)' },
  { value: 'openai/gpt-4o-mini', label: 'OpenAI · gpt-4o-mini (fast)' },
  { value: 'openai/gpt-4o', label: 'OpenAI · gpt-4o (high quality)' },
  { value: 'openai/gpt-4.1-mini', label: 'OpenAI · gpt-4.1-mini' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Anthropic · claude-3.5-sonnet' },
  { value: 'anthropic/claude-3.5-haiku', label: 'Anthropic · claude-3.5-haiku' },
  { value: 'google/gemini-2.0-flash-001', label: 'Google · gemini-2.0-flash' },
  { value: 'google/gemini-pro-1.5', label: 'Google · gemini-pro-1.5' },
  { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Meta · llama-3.3-70b' },
];

// Plain-language description of every metric column, surfaced via the small
// info-icon tooltip in the report tables and the per-question detail rows.
const METRIC_INFO = {
  exact_match: 'Exact Match — case-insensitive identical match between the model answer and the gold answer. Strict; rarely high for free-form RAG.',
  char_similarity: 'Character Similarity — Python SequenceMatcher ratio (0–1). Forgives whitespace/punctuation differences.',
  token_f1: 'Token F1 — SQuAD-style word-overlap F1 between answer and gold. Standard reading-comprehension metric.',
  faithfulness: 'Faithfulness (RAGAS) — fraction of claims in the answer that can be directly inferred from the retrieved context. Higher = less hallucination.',
  answer_relevancy: 'Answer Relevancy (RAGAS) — how directly the answer addresses the question, judged semantically.',
  context_precision: 'Context Precision (RAGAS) — of the retrieved chunks, what fraction is actually relevant. Penalises noisy retrieval.',
  context_recall: 'Context Recall (RAGAS) — do the retrieved chunks contain everything needed to produce the gold answer?',
  answer_similarity: 'Answer Similarity (RAGAS) — semantic similarity between the model answer and the gold answer.',
  answer_correctness: 'Answer Correctness (RAGAS) — weighted blend of factual overlap and similarity vs the gold answer. The closest single “score me overall” RAGAS metric.',
  claim_recall: 'Claim Recall (RAGChecker) — fraction of gold-answer claims that the model answer also contains. Measures completeness.',
  claim_precision: 'Claim Precision (RAGChecker) — fraction of model-answer claims supported by the retrieved context. Measures groundedness.',
  hallucination_rate: 'Hallucination Rate (RAGChecker) — fraction of model claims NOT supported by any retrieved context. LOWER is better; the table inverts it for the bar.',
  context_utilization: 'Context Utilization (RAGChecker) — fraction of gold claims that are actually present in the retrieved context. The retrieval ceiling — if this is low the LLM can’t win.',
  overall_score: 'Overall — mean of all positive RAGAS+RAGChecker metrics with hallucination inverted. Use as the primary ranking signal.',
};

// Small dotted-underline label + tooltip on hover. Native `title` attribute
// keeps it dependency-free and works on touch via long-press.
const MetricHeader = ({ label, info }) => (
  <span title={info} className="inline-flex items-center gap-0.5 cursor-help">
    <span className="underline decoration-dotted decoration-slate-400 underline-offset-2">{label}</span>
    <Info size={9} className="text-slate-400" />
  </span>
);

// ── Citation rendering ───────────────────────────────────────────────────
// Parses inline [n] markers in a benchmark answer and renders each one as
// a clickable chip. Clicking the chip pops a small panel with the actual
// chunk text the LLM cited from. Falls back to a plain non-interactive
// chip when the back-end didn't ship a chunk for that index (e.g. legacy
// runs without `retrieved_contexts`).
const CITATION_RE = /\[(\d{1,3})\]/g;

const AnswerWithCitations = ({ text, contexts }) => {
  const [openIdx, setOpenIdx] = useState(null);

  // Index chunks by their 1-based position. The backend already enumerates
  // them with `index` so prefer that; fall back to array order.
  const chunkByIndex = useMemo(() => {
    const map = new Map();
    (contexts || []).forEach((c, i) => {
      const idx = Number(c?.index ?? i + 1);
      if (Number.isFinite(idx)) map.set(idx, c);
    });
    return map;
  }, [contexts]);

  // Auto-close the popover on any outside click / Esc.
  useEffect(() => {
    if (openIdx === null) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpenIdx(null); };
    const onClick = (e) => {
      if (!e.target.closest?.('[data-citation-popover]') &&
          !e.target.closest?.('[data-citation-chip]')) {
        setOpenIdx(null);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [openIdx]);

  if (!text) {
    return <span className="italic text-slate-400">No answer</span>;
  }

  // Split the answer into alternating literal / citation tokens.
  const parts = [];
  let cursor = 0;
  let match;
  CITATION_RE.lastIndex = 0;
  while ((match = CITATION_RE.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push({ kind: 'text', value: text.slice(cursor, match.index) });
    }
    parts.push({ kind: 'cite', n: Number(match[1]) });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ kind: 'text', value: text.slice(cursor) });

  return (
    <span className="text-xs text-slate-700 leading-relaxed">
      {parts.map((p, i) => {
        if (p.kind === 'text') return <span key={i}>{p.value}</span>;
        const chunk = chunkByIndex.get(p.n);
        const has = Boolean(chunk?.text);
        const isOpen = openIdx === `${i}-${p.n}`;
        return (
          <span key={i} className="relative inline-block align-baseline">
            <button
              type="button"
              data-citation-chip
              disabled={!has}
              onClick={(e) => {
                e.stopPropagation();
                setOpenIdx(isOpen ? null : `${i}-${p.n}`);
              }}
              title={has ? chunk.title || `Source [${p.n}]` : `Source [${p.n}] (no chunk available)`}
              className={
                'mx-0.5 inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 rounded-md text-[10px] font-black tabular-nums align-baseline transition ' +
                (has
                  ? (isOpen
                    ? 'bg-indigo-600 text-white shadow-sm cursor-pointer'
                    : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 cursor-pointer')
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed')
              }
            >
              {p.n}
            </button>
            {isOpen && has && (
              <span
                data-citation-popover
                className="absolute z-30 left-0 top-[22px] w-[min(380px,80vw)] rounded-2xl border border-indigo-200 bg-white shadow-xl shadow-indigo-500/10 p-3 text-left whitespace-normal"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-indigo-700">
                    <span className="rounded bg-indigo-600 text-white px-1.5 py-0.5">[{p.n}]</span>
                    {chunk.title || 'Source'}
                  </span>
                  {typeof chunk.score === 'number' && (
                    <span className="text-[9px] font-black text-slate-400 tabular-nums">
                      score {chunk.score.toFixed(3)}
                    </span>
                  )}
                </span>
                {chunk.source && (
                  <span className="block text-[10px] text-slate-400 font-mono break-all mb-1.5">
                    {chunk.source}
                  </span>
                )}
                <span className="block text-[11px] text-slate-700 leading-relaxed max-h-[260px] overflow-y-auto pr-1">
                  {chunk.text}
                </span>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────

const SessionCard = ({ session, onOpen, onDelete }) => {
  const pct = session.question_count > 0
    ? Math.round((session.voted_count / session.question_count) * 100)
    : 0;
  const statusColor =
    session.status === 'finished'   ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
    session.status === 'running'    ? 'text-sky-600 bg-sky-50 border-sky-200' :
                                     'text-slate-500 bg-slate-50 border-slate-200';

  return (
    <div
      className="group relative flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 hover:-translate-y-1 p-5 cursor-pointer overflow-hidden"
      onClick={() => onOpen(session.id)}
    >
      {/* Accent ribbon */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-amber-500 to-amber-500 opacity-60 group-hover:opacity-100 transition-opacity" />
      {/* Hover glow */}
      <div className="pointer-events-none absolute -right-12 -top-12 w-40 h-40 rounded-full bg-gradient-to-br from-indigo-400/20 to-amber-400/0 opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-500" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-amber-600 shadow-md shadow-indigo-500/30 flex items-center justify-center text-white">
            <FlaskConical size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-900 truncate">{session.name}</p>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-0.5">
              {session.flow_count} flows · {session.question_count} questions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${statusColor}`}>
            {session.status === 'finished' ? <CheckCircle2 size={9} /> : <Clock size={9} />}
            {session.status}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
            className="h-7 w-7 flex items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {session.question_count > 0 && (
        <div className="mt-4 relative">
          <div className="flex justify-between text-[10px] font-black text-slate-400 mb-1.5">
            <span>{session.voted_count}/{session.question_count} voted</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden relative">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-amber-500 to-amber-500 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {session.winner_flow_name && (
        <div className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 px-2.5 py-1 text-[10px] font-black text-amber-700">
          <Trophy size={11} className="text-amber-500" />
          {session.winner_flow_name}
        </div>
      )}
    </div>
  );
};

const ResponseCard = ({ resp, index, selected, onSelect, revealed, flowName }) => {
  const accent = labelAccent(resp.blind_label);
  const isWinner = selected === resp.blind_label;
  const isLoser = selected && !isWinner;

  return (
    <div
      className={`group relative flex flex-col rounded-3xl border-2 transition-all duration-300 overflow-hidden cursor-pointer ${
        isWinner
          ? `${accent.border} shadow-xl -translate-y-1`
          : isLoser
            ? 'border-slate-200 opacity-50 grayscale'
            : 'border-slate-200 hover:-translate-y-1 hover:shadow-lg hover:border-indigo-200'
      }`}
      onClick={() => !selected && onSelect(resp.blind_label)}
    >
      {/* Top accent bar */}
      <div className={`absolute inset-x-0 top-0 h-1 transition-colors ${isWinner ? accent.bg : 'bg-slate-200 group-hover:bg-indigo-300'}`} />

      {/* Header */}
      <div className={`relative flex items-center justify-between px-4 pt-4 pb-3 ${isWinner ? accent.light : 'bg-gradient-to-b from-slate-50 to-white'}`}>
        <div className="flex items-center gap-2.5">
          <span className={`w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-black text-white shadow-md ${isWinner ? accent.bg : 'bg-gradient-to-br from-slate-400 to-slate-500'}`}>
            {resp.blind_label.replace('Flow ', '')}
          </span>
          <div className="flex flex-col">
            <span className={`text-xs font-black uppercase tracking-wider ${isWinner ? accent.text : 'text-slate-600'}`}>
              {revealed && flowName ? flowName : resp.blind_label}
            </span>
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Answer</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {resp.error && <AlertCircle size={13} className="text-rose-500" />}
          <span className="flex items-center gap-1 text-[10px] text-slate-400 font-black tabular-nums">
            <Clock size={10} /> {fmt(resp.duration_ms)}
          </span>
          {isWinner && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${accent.badge}`}>
              <Trophy size={9} /> Pick
            </span>
          )}
        </div>
      </div>

      {/* Answer body */}
      <div className="relative flex-1 px-5 py-4 bg-white">
        {resp.error ? (
          <p className="text-xs text-rose-600 italic">{resp.answer}</p>
        ) : (
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            <AnswerWithCitations text={resp.answer} contexts={resp.retrieved_contexts} />
          </p>
        )}
      </div>

      {/* Vote button */}
      {!selected && (
        <div className="px-4 pb-4 pt-1 bg-white">
          <button
            type="button"
            className={`group/btn relative w-full overflow-hidden rounded-2xl border px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] transition-all hover:shadow-md ${accent.badge} ${accent.border}`}
          >
            <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
              <Swords size={11} /> Choose this answer
            </span>
            <span className={`absolute inset-0 -translate-x-full group-hover/btn:translate-x-0 transition-transform duration-500 ${accent.bg} opacity-10`} />
          </button>
        </div>
      )}
    </div>
  );
};

// ── Report view ───────────────────────────────────────────────────────────

const ReportView = ({ report, onClose }) => {
  const sortedFlows = [...report.flows].sort(
    (a, b) => (report.tally[b.flow_id] || 0) - (report.tally[a.flow_id] || 0)
  );
  const totalVotes = Object.values(report.tally).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-6">
      {/* Winner banner */}
      {report.winner_flow_name && (
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 border-2 border-amber-300 p-8 text-center shadow-xl shadow-amber-500/10">
          {/* Confetti */}
          {Array.from({ length: 14 }).map((_, i) => {
            const cx = (Math.random() * 240 - 120).toFixed(0) + 'px';
            const cy = (-(Math.random() * 80 + 40)).toFixed(0) + 'px';
            const cr = (Math.random() * 360 - 180).toFixed(0) + 'deg';
            const colors = ['bg-amber-400', 'bg-rose-400', 'bg-emerald-400', 'bg-sky-400', 'bg-amber-400', 'bg-amber-400'];
            const color = colors[i % colors.length];
            return (
              <span
                key={i}
                className={`xrag-arena-confetti-piece ${color}`}
                style={{ left: '50%', top: '20%', '--cx': cx, '--cy': cy, '--cr': cr, animationDelay: `${i * 0.06}s` }}
              />
            );
          })}
          {/* Soft halo */}
          <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-amber-300/20 blur-3xl" />
          <div className="relative">
            <div className="xrag-arena-trophy mx-auto mb-3 inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/40">
              <Trophy size={30} className="text-white" />
            </div>
            <p className="flex items-center justify-center gap-1.5 text-[11px] font-black uppercase tracking-[0.4em] text-amber-700 mb-2">
              <Sparkles size={11} /> Best Match <Sparkles size={11} />
            </p>
            <p className="text-3xl font-black bg-gradient-to-r from-amber-700 via-orange-600 to-amber-700 bg-clip-text text-transparent">{report.winner_flow_name}</p>
            <p className="text-sm text-amber-700/80 font-black mt-2">
              {report.tally[report.winner_flow_id] || 0} wins out of {totalVotes} questions
            </p>
          </div>
        </div>
      )}

      {/* Tally bars */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Score breakdown</p>
        {sortedFlows.map((entry, i) => {
          const wins = report.tally[entry.flow_id] || 0;
          const pct = totalVotes > 0 ? (wins / totalVotes) * 100 : 0;
          const accent = ACCENT_PALETTE[i % ACCENT_PALETTE.length];
          return (
            <div key={entry.flow_id}>
              <div className="flex justify-between text-xs font-black mb-1">
                <span className="text-slate-700">{entry.flow_name}</span>
                <span className={accent.text}>{wins} wins ({Math.round(pct)}%)</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${accent.bg} transition-all duration-700`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Question log */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
          Question log — {report.voted_questions}/{report.total_questions} voted
        </p>
        {report.questions.map((q) => {
          const winnerEntry = report.flows.find((e) => e.flow_id === q.winner_flow_id);
          return (
            <div key={q.question_index} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-black">
                  {q.question_index + 1}
                </span>
                <p className="text-sm font-black text-slate-800">{q.question}</p>
              </div>
              {q.winner_flow_id ? (
                <p className="text-[11px] text-emerald-700 font-black flex items-center gap-1 ml-7">
                  <CheckCircle2 size={12} />
                  Chose: {winnerEntry?.flow_name || q.winner_label}
                </p>
              ) : (
                <p className="text-[11px] text-slate-400 font-black ml-7">Not voted</p>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-2xl border border-slate-200 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50"
      >
        Close report
      </button>
    </div>
  );
};

// ── Benchmark Panel ─────────────────────────────────────────────────────

const mColor = (v) => { const p = v * 100; return p >= 80 ? 'text-emerald-700' : p >= 50 ? 'text-amber-700' : 'text-rose-700'; };
const mBg = (v) => { const p = v * 100; return p >= 80 ? 'bg-emerald-500' : p >= 50 ? 'bg-amber-500' : 'bg-rose-500'; };

const BenchmarkPanel = () => {
  const [subTab, setSubTab] = useState('runs');
  const [bview, setBview] = useState('list');
  const [runs, setRuns] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [dsLoading, setDsLoading] = useState(false);
  const [backendFlows, setBackendFlows] = useState([]);

  // Create-dataset form
  const [dsName, setDsName] = useState('');
  const [dsDesc, setDsDesc] = useState('');
  const [entries, setEntries] = useState([{ question: '', expected_answer: '' }]);
  const [pasteMode, setPasteMode] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [dsSaving, setDsSaving] = useState(false);
  const [dsFormError, setDsFormError] = useState('');

  // Start-run form
  const [runName, setRunName] = useState('');
  const [selectedDs, setSelectedDs] = useState('');
  const [selectedFlows, setSelectedFlows] = useState([]);
  const [enableRagValidation, setEnableRagValidation] = useState(true);
  const [useLlmJudge, setUseLlmJudge] = useState(true);
  const [judgeModel, setJudgeModel] = useState('');
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // Report
  const [bmReport, setBmReport] = useState(null);

  const loadRuns = async () => { setRunsLoading(true); try { setRuns(await xragApi.listBenchmarkRuns() || []); } catch {} finally { setRunsLoading(false); } };
  // Silent variant used by the background polling tick — does NOT toggle the
  // ``runsLoading`` flag, otherwise every 2s tick would briefly hide the run
  // cards and re-render the centred spinner, causing a visible page flicker.
  const refreshRunsSilent = async () => {
    try {
      const fresh = await xragApi.listBenchmarkRuns() || [];
      setRuns(prev => {
        // Avoid pointless re-renders when nothing actually changed — every
        // new array reference cascades through the cards.
        if (prev.length === fresh.length) {
          let identical = true;
          for (let i = 0; i < prev.length; i++) {
            const a = prev[i]; const b = fresh[i];
            if (
              a.id !== b.id || a.status !== b.status ||
              (a.progress?.current || 0) !== (b.progress?.current || 0) ||
              (a.progress?.stage || '') !== (b.progress?.stage || '') ||
              (a.progress?.current_question_index ?? -1) !== (b.progress?.current_question_index ?? -1)
            ) { identical = false; break; }
          }
          if (identical) return prev;
        }
        return fresh;
      });
    } catch { /* transient — try again next tick */ }
  };
  const loadDatasets = async () => { setDsLoading(true); try { setDatasets(await xragApi.listBenchmarkDatasets() || []); } catch {} finally { setDsLoading(false); } };
  const loadFlows = async () => { try { setBackendFlows(await xragApi.listCanvasFlows() || []); } catch {} };

  useEffect(() => { loadRuns(); loadDatasets(); loadFlows(); }, []);

  const handleSaveDataset = async () => {
    let finalEntries = entries;
    if (pasteMode) {
      try {
        finalEntries = JSON.parse(jsonText);
        if (!Array.isArray(finalEntries) || finalEntries.some(e => !e.question || !e.expected_answer)) { setJsonError('Must be [{question, expected_answer}] objects.'); return; }
      } catch { setJsonError('Invalid JSON.'); return; }
    } else {
      finalEntries = entries.filter(e => e.question.trim());
    }
    if (!dsName.trim()) { setDsFormError('Name required.'); return; }
    if (!finalEntries.length) { setDsFormError('At least one entry required.'); return; }
    setDsSaving(true); setDsFormError(''); setJsonError('');
    try {
      await xragApi.createBenchmarkDataset({ name: dsName.trim(), description: dsDesc.trim(), entries: finalEntries });
      await loadDatasets();
      setBview('list'); setSubTab('datasets');
      setDsName(''); setDsDesc(''); setEntries([{ question: '', expected_answer: '' }]); setJsonText('');
    } catch (e) { setDsFormError(e.message || 'Failed.'); }
    finally { setDsSaving(false); }
  };

  const handleStartRun = async () => {
    if (!selectedDs) { setRunError('Select a dataset.'); return; }
    if (selectedFlows.length < 2) { setRunError('Select at least 2 flows.'); return; }
    setStarting(true); setRunError('');
    try {
      const r = await xragApi.runBenchmark(selectedDs, {
        name: runName.trim() || 'Benchmark Run',
        flow_ids: selectedFlows,
        enable_rag_validation: enableRagValidation,
        use_llm_judge: useLlmJudge,
        judge_model: judgeModel.trim(),
      });
      await loadRuns();
      setBmReport(r); setBview('report');
    } catch (e) { setRunError(e.message || 'Failed to run benchmark.'); }
    finally { setStarting(false); }
  };

  const openRun = async (runId) => {
    try { const r = await xragApi.getBenchmarkRun(runId); setBmReport(r); setBview('report'); }
    catch (e) { setDeleteError(e?.message || 'Failed to open run.'); }
  };

  const handleDeleteRun = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this benchmark run? This cannot be undone.')) return;
    setDeleteError('');
    try {
      await xragApi.deleteBenchmarkRun(id);
      setRuns(p => p.filter(r => r.id !== id));
    } catch (err) { setDeleteError(err?.message || 'Failed to delete run.'); }
  };
  const handleDeleteDs = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this benchmark dataset? This cannot be undone.')) return;
    setDeleteError('');
    try {
      await xragApi.deleteBenchmarkDataset(id);
      setDatasets(p => p.filter(d => d.id !== id));
    } catch (err) { setDeleteError(err?.message || 'Failed to delete dataset.'); }
  };

  // ── Live polling for an in-flight benchmark run ─────────────────
  // Runs entirely server-side in a background thread, so this just
  // refreshes the report payload every 1.5s while status is running/pending.
  // If the user navigates away, the run keeps going and re-opening picks up
  // wherever it is. Polling stops automatically on completion or unmount.
  useEffect(() => {
    if (bview !== 'report' || !bmReport) return undefined;
    const status = bmReport.status;
    if (status !== 'running' && status !== 'pending') return undefined;
    const runId = bmReport.run_id;
    let cancelled = false;
    const tick = async () => {
      try {
        const fresh = await xragApi.getBenchmarkRun(runId);
        if (!cancelled) setBmReport(fresh);
      } catch { /* transient — try again next tick */ }
    };
    const handle = setInterval(tick, 1500);
    return () => { cancelled = true; clearInterval(handle); };
  }, [bview, bmReport?.run_id, bmReport?.status]);

  // Refresh the runs list periodically while ANY run is active so the row's
  // progress bar in the runs list view stays current too. We deliberately
  // depend ONLY on whether any active run exists (not on ``runs`` itself),
  // otherwise every successful poll would tear down + recreate the interval
  // and we'd briefly show no timer between ticks.
  const anyRunActive = runs.some(r => r.status === 'running' || r.status === 'pending');
  useEffect(() => {
    if (bview !== 'list' || subTab !== 'runs' || !anyRunActive) return undefined;
    const handle = setInterval(refreshRunsSilent, 2000);
    return () => clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bview, subTab, anyRunActive]);

  // ── HuggingFace dataset import (SQuAD preset + custom) ──────────
  // Built-in presets the user can pick from one click. Each preset spells
  // out the field mapping (question/answer/context paths) so it Just Works
  // with the generic /benchmarks/import-hf endpoint.
  const HF_PRESETS = useMemo(() => ([
    // ── General QA ──────────────────────────────────────────
    {
      key: 'squad-v2',
      domain: 'general',
      label: 'SQuAD v2',
      description: 'Wikipedia QA — extractive answers + unanswerable rows.',
      dataset: 'rajpurkar/squad_v2',
      config: 'squad_v2',
      split: 'validation',
      question_field: 'question',
      answer_field: 'answers.text[0]',
      context_field: 'context',
      title_field: 'title',
      document_category: 'squad-v2',
    },
    {
      key: 'squad',
      domain: 'general',
      label: 'SQuAD v1',
      description: 'Original SQuAD — every question has at least one answer.',
      dataset: 'rajpurkar/squad',
      config: 'plain_text',
      split: 'validation',
      question_field: 'question',
      answer_field: 'answers.text[0]',
      context_field: 'context',
      title_field: 'title',
      document_category: 'squad-v1',
    },
    {
      key: 'triviaqa',
      domain: 'general',
      label: 'TriviaQA (rc)',
      description: 'Trivia questions with Wikipedia / web evidence.',
      dataset: 'mandarjoshi/trivia_qa',
      config: 'rc',
      split: 'validation',
      question_field: 'question',
      answer_field: 'answer.value',
      context_field: 'entity_pages.wiki_context[0]',
      title_field: 'entity_pages.title[0]',
      document_category: 'triviaqa',
    },
    {
      key: 'hotpotqa',
      domain: 'general',
      label: 'HotpotQA',
      description: 'Multi-hop reasoning over Wikipedia paragraphs.',
      dataset: 'hotpotqa/hotpot_qa',
      config: 'distractor',
      split: 'validation',
      question_field: 'question',
      answer_field: 'answer',
      context_field: 'context.sentences[0][0]',
      title_field: 'context.title[0]',
      document_category: 'hotpotqa',
    },
    {
      key: 'natural_questions',
      domain: 'general',
      label: 'Natural Questions (open)',
      description: 'Real Google search queries with short answers.',
      dataset: 'google-research-datasets/nq_open',
      config: 'nq_open',
      split: 'validation',
      question_field: 'question',
      answer_field: 'answer[0]',
      context_field: '',
      title_field: '',
      document_category: 'nq-open',
    },
    // ── Healthcare / Biomedical ─────────────────────────────
    {
      key: 'pubmedqa',
      domain: 'healthcare',
      label: 'PubMedQA (labeled)',
      description: 'Biomedical research QA — yes/no/maybe questions over PubMed abstracts.',
      dataset: 'qiaojin/PubMedQA',
      config: 'pqa_labeled',
      split: 'train',
      question_field: 'question',
      answer_field: 'long_answer',
      context_field: 'context.contexts[0]',
      title_field: '',
      document_category: 'pubmedqa',
    },
    {
      key: 'covid-qa',
      domain: 'healthcare',
      label: 'COVID-QA',
      description: 'Expert-annotated SARS-CoV-2 / COVID-19 question answering.',
      dataset: 'deepset/covid_qa_deepset',
      config: '',
      split: 'train',
      question_field: 'question',
      answer_field: 'answers.text[0]',
      context_field: 'context',
      title_field: 'document_id',
      document_category: 'covid-qa',
    },
    {
      key: 'bioasq',
      domain: 'healthcare',
      label: 'BioASQ (experimental)',
      description: 'Biomedical semantic QA. If import fails, switch to Custom and adjust paths.',
      dataset: 'kroshan/BioASQ',
      config: '',
      split: 'train',
      question_field: 'question',
      answer_field: 'answer',
      context_field: 'context',
      title_field: '',
      document_category: 'bioasq',
    },
    // ── Legal ───────────────────────────────────────────────
    {
      key: 'cuad',
      domain: 'legal',
      label: 'CUAD',
      description: 'Contract Understanding Atticus Dataset — clause QA over real contracts.',
      dataset: 'theatticusproject/cuad-qa',
      config: '',
      split: 'train',
      question_field: 'question',
      answer_field: 'answers.text[0]',
      context_field: 'context',
      title_field: 'title',
      document_category: 'cuad',
    },
    {
      key: 'privacyqa',
      domain: 'legal',
      label: 'PrivacyQA (experimental)',
      description: 'Privacy-policy QA. If import fails, switch to Custom and adjust field paths.',
      dataset: 'alzoubi36/privacy_qa',
      config: '',
      split: 'train',
      question_field: 'question',
      answer_field: 'answer',
      context_field: 'context',
      title_field: '',
      document_category: 'privacyqa',
    },
    // ── Finance ─────────────────────────────────────────────
    {
      key: 'fiqa',
      domain: 'finance',
      label: 'FiQA',
      description: 'Financial-opinion / domain QA dataset.',
      dataset: 'LLukas22/fiqa',
      config: '',
      split: 'train',
      question_field: 'question',
      answer_field: 'answer',
      context_field: 'context',
      title_field: '',
      document_category: 'fiqa',
    },
    {
      key: 'finqa',
      domain: 'finance',
      label: 'FinQA (experimental)',
      description: 'Numerical reasoning over financial reports. Adjust mapping if import fails.',
      dataset: 'dreamerdeo/finqa',
      config: '',
      split: 'train',
      question_field: 'question',
      answer_field: 'answer',
      context_field: 'context',
      title_field: '',
      document_category: 'finqa',
    },
    // ── Science & Tech ──────────────────────────────────────
    {
      key: 'qasper',
      domain: 'science',
      label: 'QASper',
      description: 'Question answering over NLP research papers.',
      dataset: 'allenai/qasper',
      config: '',
      split: 'validation',
      question_field: 'question',
      answer_field: 'answer',
      context_field: 'context',
      title_field: 'title',
      document_category: 'qasper',
    },
    {
      key: 'techqa',
      domain: 'science',
      label: 'TechQA (experimental)',
      description: 'Technical-support QA. If import fails, switch to Custom and adjust paths.',
      dataset: 'rojagtap/tech-qa',
      config: '',
      split: 'train',
      question_field: 'question',
      answer_field: 'answer',
      context_field: 'context',
      title_field: '',
      document_category: 'techqa',
    },
    // ── Custom fallback ─────────────────────────────────────
    {
      key: 'custom',
      domain: 'custom',
      label: 'Custom HF dataset',
      description: 'Specify any dataset id and field mappings yourself.',
      dataset: '',
      config: '',
      split: 'validation',
      question_field: 'question',
      answer_field: 'answer',
      context_field: 'context',
      title_field: 'title',
      document_category: 'hf-import',
    },
  ]), []);

  const HF_DOMAIN_GROUPS = useMemo(() => ([
    { key: 'general',    label: 'General QA',          icon: Sparkles },
    { key: 'healthcare', label: 'Healthcare / Biomed', icon: Activity },
    { key: 'legal',      label: 'Legal',               icon: Shield },
    { key: 'finance',    label: 'Finance',             icon: BarChart3 },
    { key: 'science',    label: 'Science & Tech',      icon: FlaskConical },
    { key: 'custom',     label: 'Custom',              icon: Database },
  ]), []);

  const [hfOpen, setHfOpen] = useState(false);
  const [hfPresetKey, setHfPresetKey] = useState('squad-v2');
  const [hfName, setHfName] = useState('SQuAD v2 — sample');
  const [hfDataset, setHfDataset] = useState('rajpurkar/squad_v2');
  const [hfConfig, setHfConfig] = useState('squad_v2');
  const [hfSplit, setHfSplit] = useState('validation');
  const [hfQuestionField, setHfQuestionField] = useState('question');
  const [hfAnswerField, setHfAnswerField] = useState('answers.text[0]');
  const [hfContextField, setHfContextField] = useState('context');
  const [hfTitleField, setHfTitleField] = useState('title');
  const [hfDocCategory, setHfDocCategory] = useState('squad-v2');
  const [hfCount, setHfCount] = useState(20);
  const [hfDocs, setHfDocs] = useState(10);
  const [hfUploadDocs, setHfUploadDocs] = useState(true);
  const [hfSkipEmpty, setHfSkipEmpty] = useState(true);
  const [hfBusy, setHfBusy] = useState(false);
  const [hfError, setHfError] = useState('');
  const [hfResult, setHfResult] = useState(null);

  // ── Testset generator (Ragas-style: LLM authors Q&A from your KB) ───
  const [genOpen, setGenOpen] = useState(false);
  const [genName, setGenName] = useState('Generated test-set');
  const [genDescription, setGenDescription] = useState('LLM-authored from knowledge base.');
  const [genDocs, setGenDocs] = useState([]); // list from /api/knowledge/documents
  const [genDocsLoading, setGenDocsLoading] = useState(false);
  const [genDocIds, setGenDocIds] = useState([]); // selected doc ids; [] = all
  const [genCount, setGenCount] = useState(10);
  const [genModel, setGenModel] = useState('openai/gpt-4o-mini');
  const [genStyle, setGenStyle] = useState('factual'); // 'factual' | 'reasoning'
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState('');
  const [genResult, setGenResult] = useState(null);

  const GEN_MODEL_PRESETS = useMemo(() => ([
    { id: 'openai/gpt-4o-mini',           label: 'GPT-4o mini' },
    { id: 'openai/gpt-4o',                label: 'GPT-4o' },
    { id: 'anthropic/claude-3.5-sonnet',  label: 'Claude 3.5 Sonnet' },
    { id: 'anthropic/claude-3-haiku',     label: 'Claude 3 Haiku' },
    { id: 'google/gemini-2.0-flash-001',  label: 'Gemini 2.0 Flash' },
    { id: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B' },
  ]), []);

  const openGenModal = async () => {
    setGenOpen(true);
    setGenError('');
    setGenResult(null);
    setGenDocsLoading(true);
    try {
      const docs = await xragApi.listKnowledgeDocuments();
      setGenDocs(Array.isArray(docs) ? docs : []);
    } catch (e) {
      setGenError(e.message || 'Failed to load knowledge documents.');
      setGenDocs([]);
    } finally {
      setGenDocsLoading(false);
    }
  };

  const toggleGenDoc = (id) => {
    setGenDocIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleGenerateTestset = async () => {
    setGenBusy(true); setGenError(''); setGenResult(null);
    try {
      const body = {
        name: genName.trim() || 'Generated test-set',
        description: genDescription.trim(),
        document_ids: genDocIds,
        num_questions: Number(genCount) || 10,
        model: genModel,
        style: genStyle,
      };
      const res = await xragApi.generateBenchmarkTestset(body);
      setGenResult(res);
      await loadDatasets();
    } catch (e) {
      setGenError(e.message || 'Generation failed.');
    } finally {
      setGenBusy(false);
    }
  };

  const applyHfPreset = (key) => {
    const preset = HF_PRESETS.find(p => p.key === key) || HF_PRESETS[0];
    setHfPresetKey(preset.key);
    setHfName(`${preset.label} — sample`);
    setHfDataset(preset.dataset);
    setHfConfig(preset.config);
    setHfSplit(preset.split);
    setHfQuestionField(preset.question_field);
    setHfAnswerField(preset.answer_field);
    setHfContextField(preset.context_field);
    setHfTitleField(preset.title_field);
    setHfDocCategory(preset.document_category);
  };

  const handleImportHf = async () => {
    setHfBusy(true); setHfError(''); setHfResult(null);
    try {
      if (!hfDataset.trim()) throw new Error('Dataset id is required (e.g. owner/name).');
      const res = await xragApi.importHfBenchmark({
        name: hfName.trim() || `${hfDataset} — sample`,
        dataset: hfDataset.trim(),
        config: hfConfig.trim() || null,
        split: hfSplit.trim() || 'validation',
        num_questions: Number(hfCount) || 20,
        question_field: hfQuestionField.trim() || 'question',
        answer_field: hfAnswerField.trim() || 'answer',
        context_field: hfContextField.trim() || null,
        title_field: hfTitleField.trim() || null,
        skip_empty_answers: hfSkipEmpty,
        upload_documents: hfUploadDocs,
        max_documents: hfUploadDocs ? (Number(hfDocs) || 0) : 0,
        document_category: hfDocCategory.trim() || 'hf-import',
      });
      setHfResult(res);
      await loadDatasets();
    } catch (e) {
      setHfError(e.message || 'Import failed.');
    } finally {
      setHfBusy(false);
    }
  };


  return (
    <div className="space-y-5">
      {/* Sub-nav */}
      {bview === 'list' && (
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100 w-fit">
          {[{ key: 'runs', label: 'Runs', icon: <Target size={13} /> }, { key: 'datasets', label: 'Datasets', icon: <BookOpen size={13} /> }].map(({ key, label, icon }) => (
            <button key={key} type="button" onClick={() => setSubTab(key)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all ${
                subTab === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>{icon} {label}</button>
          ))}
        </div>
      )}

      {/* RUNS LIST */}
      {bview === 'list' && subTab === 'runs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{runs.length} run{runs.length !== 1 ? 's' : ''}</p>
            <div className="flex gap-2">
              <button type="button" onClick={loadRuns} className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-indigo-600 flex items-center gap-1"><RefreshCw size={10} className={runsLoading ? 'animate-spin' : ''} /> Refresh</button>
              <button type="button" onClick={() => { setRunName(''); setSelectedDs(''); setSelectedFlows([]); setRunError(''); setBview('start-run'); }}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white hover:bg-indigo-700"><Plus size={12} /> New run</button>
            </div>
          </div>
          {runsLoading && <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-indigo-400" /></div>}
          {!runsLoading && runs.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <div className="w-14 h-14 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3"><Target size={24} /></div>
              <p className="text-sm font-black text-slate-600">No benchmark runs yet</p>
              <p className="text-xs text-slate-400 mt-1">Create a dataset, then run it against your flows.</p>
            </div>
          )}
          {deleteError && (
            <p className="flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 font-black">
              <AlertCircle size={13} /> {deleteError}
              <button type="button" onClick={() => setDeleteError('')} className="ml-auto text-rose-400 hover:text-rose-600"><X size={12} /></button>
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {runs.map(run => {
              const isActive = run.status === 'running' || run.status === 'pending';
              const isError = run.status === 'error';
              const prog = run.progress || {};
              const total = prog.total || 0;
              const current = prog.current || 0;
              const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
              const startedAt = prog.started_at || run.created_at || Date.now();
              const elapsed = isActive ? Math.max(0, Date.now() - startedAt) : 0;
              const stageLabel = prog.stage === 'scoring'
                ? 'Scoring with judge model'
                : prog.stage === 'executing'
                  ? 'Executing flow'
                  : prog.stage === 'starting'
                    ? 'Warming up'
                    : prog.stage || 'Working';
              return (
                <div
                  key={run.id}
                  className="group relative flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-xl hover:shadow-amber-500/10 transition-all duration-300 hover:-translate-y-1 p-5 cursor-pointer overflow-hidden"
                  onClick={() => openRun(run.id)}
                >
                  {/* Accent ribbon */}
                  <div className={`absolute inset-x-0 top-0 h-1 ${
                    isActive ? 'bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400 animate-pulse'
                             : isError ? 'bg-gradient-to-r from-rose-500 to-red-500'
                                       : 'bg-gradient-to-r from-amber-500 via-amber-500 to-pink-500 opacity-60 group-hover:opacity-100 transition-opacity'
                  }`} />
                  {/* Hover glow */}
                  <div className="pointer-events-none absolute -right-12 -top-12 w-40 h-40 rounded-full bg-gradient-to-br from-amber-400/20 to-amber-400/0 opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-500" />

                  <div className="relative flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-md ${
                        isActive ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/30' :
                        isError ? 'bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/30' :
                                  'bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/30'
                      }`}>
                        {isActive ? <Loader2 size={18} className="animate-spin" /> :
                         isError ? <AlertCircle size={18} /> :
                                   <Target size={18} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900 truncate">{run.name}</p>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-0.5">
                          {run.dataset_name} · {run.flow_count} flows · {run.question_count} Q
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                        isActive ? 'border-amber-200 bg-amber-50 text-amber-700' :
                        isError ? 'border-rose-200 bg-rose-50 text-rose-700' :
                                  'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}>
                        {isActive ? <Activity size={9} className="animate-pulse" /> :
                         isError ? <AlertCircle size={9} /> :
                                   <CheckCircle2 size={9} />}
                        {run.status}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteRun(run.id, e)}
                        title="Delete run"
                        className="h-7 w-7 flex items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {isActive && (
                    <div className="relative mt-4 space-y-2">
                      {/* Live stage line */}
                      <div className="flex items-center gap-2 rounded-xl bg-amber-50/80 border border-amber-200 px-3 py-2">
                        <Activity size={11} className="text-amber-600 animate-pulse shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-black uppercase tracking-wider text-amber-700">{stageLabel}</p>
                          <p className="text-[11px] font-black text-amber-900 truncate">
                            {prog.current_question_index != null ? `Q${prog.current_question_index + 1} · ` : ''}
                            {prog.current_flow_name || '…'}
                          </p>
                          {prog.current_question && (
                            <p className="text-[10px] text-amber-700/80 truncate mt-0.5">"{prog.current_question}"</p>
                          )}
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div>
                        <div className="flex justify-between text-[10px] font-black text-amber-700 mb-1">
                          <span>{current}/{total} steps · {fmtElapsed(elapsed)}</span>
                          <span className="tabular-nums">{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-amber-100 overflow-hidden relative">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {!isActive && run.question_count > 0 && (
                    <div className="mt-4 relative">
                      <div className="flex justify-between text-[10px] font-black text-slate-400 mb-1.5">
                        <span>{run.question_count} questions · {run.flow_count} flows</span>
                        <span>{isError ? 'failed' : 'complete'}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden relative">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            isError ? 'bg-gradient-to-r from-rose-500 to-red-500'
                                    : 'bg-gradient-to-r from-amber-500 via-amber-500 to-pink-500'
                          }`}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DATASETS LIST */}
      {bview === 'list' && subTab === 'datasets' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{datasets.length} dataset{datasets.length !== 1 ? 's' : ''}</p>
            <div className="flex gap-2">
              <button type="button" onClick={loadDatasets} className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-indigo-600 flex items-center gap-1"><RefreshCw size={10} className={dsLoading ? 'animate-spin' : ''} /> Refresh</button>
              <button type="button" onClick={() => { applyHfPreset(hfPresetKey); setHfOpen(true); setHfError(''); setHfResult(null); }}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-amber-300 bg-amber-50 text-amber-800 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider hover:bg-amber-100"><Download size={12} /> Import HuggingFace</button>
              <button type="button" onClick={openGenModal}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-amber-300 bg-amber-50 text-amber-800 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider hover:bg-amber-100"><Sparkles size={12} /> Generate from KB</button>
              <button type="button" onClick={() => { setDsName(''); setDsDesc(''); setEntries([{ question: '', expected_answer: '' }]); setJsonText(''); setDsFormError(''); setJsonError(''); setPasteMode(false); setBview('create-ds'); }}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-amber-600 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white hover:bg-amber-700"><Plus size={12} /> New dataset</button>
            </div>
          </div>
          {dsLoading && <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-amber-400" /></div>}
          {!dsLoading && datasets.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <div className="w-14 h-14 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3"><BookOpen size={24} /></div>
              <p className="text-sm font-black text-slate-600">No benchmark datasets yet</p>
              <p className="text-xs text-slate-400 mt-1">Upload question–answer pairs, or import a public benchmark to evaluate flows objectively.</p>
              <button
                type="button"
                onClick={() => { applyHfPreset(hfPresetKey); setHfOpen(true); setHfError(''); setHfResult(null); }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-2xl border border-amber-300 bg-amber-50 text-amber-800 px-4 py-2 text-[11px] font-black uppercase tracking-wider hover:bg-amber-100"
              >
                <Download size={12} /> Import from HuggingFace
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {datasets.map(ds => (
              <div
                key={ds.id}
                className="group relative flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-xl hover:shadow-amber-500/10 transition-all duration-300 hover:-translate-y-1 p-5 overflow-hidden"
              >
                {/* Accent ribbon */}
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 via-amber-500 to-pink-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                {/* Hover glow */}
                <div className="pointer-events-none absolute -right-12 -top-12 w-40 h-40 rounded-full bg-gradient-to-br from-amber-400/20 to-amber-400/0 opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-500" />

                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 shadow-md shadow-amber-500/30 flex items-center justify-center text-white">
                      <BookOpen size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">{ds.name}</p>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-0.5">
                        {ds.entry_count} Q&amp;A pairs
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteDs(ds.id, e)}
                    title="Delete dataset"
                    className="h-7 w-7 flex items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {ds.description && (
                  <p className="relative mt-3 text-xs text-slate-600 line-clamp-2">{ds.description}</p>
                )}

                <div className="relative mt-4 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700">
                    <BookOpen size={9} /> {ds.entry_count} Q
                  </span>
                  <button
                    type="button"
                    onClick={() => { setRunName(''); setSelectedDs(ds.id); setSelectedFlows([]); setRunError(''); setBview('start-run'); }}
                    className="ml-auto inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-md shadow-amber-500/30 hover:from-amber-400 hover:to-amber-500 transition"
                  >
                    <PlayCircle size={11} /> Run
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CREATE DATASET */}
      {bview === 'create-ds' && (
        <div className="max-w-2xl space-y-5">
          <div>
            <h3 className="text-base font-black text-slate-800 mb-0.5">New benchmark dataset</h3>
            <p className="text-xs text-slate-500">Upload question–answer pairs to evaluate flows automatically.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Dataset name</label>
              <input type="text" value={dsName} onChange={e => setDsName(e.target.value)} placeholder="e.g. Product FAQ v1"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Description (optional)</label>
              <input type="text" value={dsDesc} onChange={e => setDsDesc(e.target.value)} placeholder="Short description"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 w-fit">
            <button type="button" onClick={() => setPasteMode(false)} className={`rounded-lg px-3 py-1 text-[11px] font-black uppercase tracking-wider transition-all ${!pasteMode ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500'}`}>Manual</button>
            <button type="button" onClick={() => setPasteMode(true)} className={`rounded-lg px-3 py-1 text-[11px] font-black uppercase tracking-wider transition-all ${pasteMode ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500'}`}>Paste JSON</button>
          </div>
          {!pasteMode && (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {entries.map((e, i) => (
                <div key={i} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400">#{i + 1}</span>
                    {entries.length > 1 && (
                      <button type="button" onClick={() => setEntries(prev => prev.filter((_, j) => j !== i))} className="w-5 h-5 rounded-full border border-rose-200 text-rose-400 hover:bg-rose-50 flex items-center justify-center"><Minus size={9} /></button>
                    )}
                  </div>
                  <input type="text" placeholder="Question" value={e.question}
                    onChange={ev => setEntries(prev => prev.map((x, j) => j === i ? { ...x, question: ev.target.value } : x))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-300" />
                  <textarea rows={2} placeholder="Expected / gold answer" value={e.expected_answer}
                    onChange={ev => setEntries(prev => prev.map((x, j) => j === i ? { ...x, expected_answer: ev.target.value } : x))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-700 outline-none resize-none focus:ring-2 focus:ring-amber-300" />
                </div>
              ))}
              <button type="button" onClick={() => setEntries(prev => [...prev, { question: '', expected_answer: '' }])}
                className="w-full rounded-2xl border border-dashed border-amber-300 py-2 text-[11px] font-black uppercase tracking-wider text-amber-600 hover:bg-amber-50 flex items-center justify-center gap-1">
                <Plus size={11} /> Add entry
              </button>
            </div>
          )}
          {pasteMode && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">JSON array of &#123;question, expected_answer&#125; objects</label>
              <textarea rows={8} value={jsonText} onChange={e => { setJsonText(e.target.value); setJsonError(''); }}
                placeholder={'[\n  {"question": "...", "expected_answer": "..."},\n  ...\n]'}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700 outline-none resize-none focus:ring-2 focus:ring-amber-400 font-mono" />
              {jsonError && <p className="mt-1 text-[11px] text-rose-600 font-black">{jsonError}</p>}
            </div>
          )}
          {dsFormError && (
            <p className="flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 font-black"><AlertCircle size={13} /> {dsFormError}</p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setBview('list')} className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={handleSaveDataset} disabled={dsSaving}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-600 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-amber-700 disabled:opacity-40">
              {dsSaving ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />} Save dataset
            </button>
          </div>
        </div>
      )}

      {/* START RUN */}
      {bview === 'start-run' && (
        <div className="max-w-xl space-y-5">
          <div>
            <h3 className="text-base font-black text-slate-800 mb-0.5">New benchmark run</h3>
            <p className="text-xs text-slate-500">Each question is sent to every selected flow. Scores are computed automatically.</p>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Run name</label>
            <input type="text" value={runName} onChange={e => setRunName(e.target.value)} placeholder="e.g. April Benchmark"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Select dataset</label>
            {datasets.length === 0 ? <p className="text-xs text-slate-500 italic">No datasets. Create one first.</p> : (
              <div className="space-y-2">
                {datasets.map(ds => (
                  <button key={ds.id} type="button" onClick={() => setSelectedDs(ds.id)}
                    className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                      selectedDs === ds.id ? 'border-amber-300 bg-amber-50 shadow-sm' : 'border-slate-200 bg-white hover:border-amber-200'
                    }`}>
                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${selectedDs === ds.id ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-500'}`}><BookOpen size={13} /></div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-black truncate ${selectedDs === ds.id ? 'text-amber-700' : 'text-slate-700'}`}>{ds.name}</p>
                      <p className="text-[10px] text-slate-400">{ds.entry_count} questions</p>
                    </div>
                    {selectedDs === ds.id && <CheckCircle2 size={15} className="text-amber-600 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Flows to benchmark ({selectedFlows.length} selected)</label>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {backendFlows.map((flow) => {
                const sel = selectedFlows.includes(flow.id);
                const idx = selectedFlows.indexOf(flow.id);
                const accent = idx >= 0 ? ACCENT_PALETTE[idx % ACCENT_PALETTE.length] : null;
                return (
                  <button key={flow.id} type="button"
                    onClick={() => setSelectedFlows(prev => sel ? prev.filter(id => id !== flow.id) : prev.length < 8 ? [...prev, flow.id] : prev)}
                    className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                      sel ? `${accent.border} ${accent.light} shadow-sm` : 'border-slate-200 bg-white hover:border-indigo-200'
                    }`}>
                    <div className={`shrink-0 w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black text-white ${sel ? accent.bg : 'bg-slate-300'}`}>
                      {sel ? String.fromCharCode(65 + idx) : <Network size={12} />}
                    </div>
                    <p className={`flex-1 text-sm font-black truncate ${sel ? accent.text : 'text-slate-700'}`}>{flow.name}</p>
                    {sel && <CheckCircle2 size={14} className={accent.text} />}
                  </button>
                );
              })}
            </div>
          </div>
          {runError && (
            <p className="flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 font-black"><AlertCircle size={13} /> {runError}</p>
          )}

          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <input
                id="bm-rag-enable"
                type="checkbox"
                checked={enableRagValidation}
                onChange={(e) => setEnableRagValidation(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <label htmlFor="bm-rag-enable" className="flex-1 cursor-pointer">
                <p className="text-xs font-black text-amber-800 uppercase tracking-wider">Run RAGAS + RAGChecker validation</p>
                <p className="text-[11px] text-amber-700/80 mt-0.5 leading-snug">
                  Architecture-agnostic scoring (faithfulness, answer relevancy, context precision/recall, claim recall/precision, hallucination rate, …). Captures retrieved chunks from every node and grades the flow's I/O — works identically for Naive, Self-RAG, GraphRAG, HyDE, Agentic and any other architecture.
                </p>
              </label>
            </div>
            <div className={`flex items-start gap-3 ${enableRagValidation ? '' : 'opacity-50 pointer-events-none'}`}>
              <input
                id="bm-llm-judge"
                type="checkbox"
                checked={useLlmJudge}
                onChange={(e) => setUseLlmJudge(e.target.checked)}
                disabled={!enableRagValidation}
                className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <label htmlFor="bm-llm-judge" className="flex-1 cursor-pointer">
                <p className="text-xs font-black text-amber-800 uppercase tracking-wider">Use LLM-as-judge (recommended)</p>
                <p className="text-[11px] text-amber-700/80 mt-0.5 leading-snug">
                  Uses an OpenRouter judge model for semantic scoring. When the API key is missing or the call fails, the validator transparently falls back to a deterministic lexical scorer with the same metric shape.
                </p>
              </label>
            </div>
            <div className={`pl-7 ${enableRagValidation && useLlmJudge ? '' : 'opacity-50 pointer-events-none'}`}>
              <label className="block text-[10px] font-black uppercase tracking-wider text-amber-700 mb-1">Judge model</label>
              <select
                value={JUDGE_MODEL_PRESETS.some(p => p.value === judgeModel) ? judgeModel : '__custom__'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__custom__') return;
                  setJudgeModel(v);
                }}
                disabled={!enableRagValidation || !useLlmJudge}
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-400"
              >
                {JUDGE_MODEL_PRESETS.map(p => (
                  <option key={p.value || 'default'} value={p.value}>{p.label}</option>
                ))}
                <option value="__custom__">Custom (type below) …</option>
              </select>
              <input
                type="text"
                value={judgeModel}
                onChange={(e) => setJudgeModel(e.target.value)}
                placeholder="or paste any OpenRouter model id, e.g. mistralai/mistral-large"
                disabled={!enableRagValidation || !useLlmJudge}
                className="mt-1.5 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-slate-400"
              />
              <p className="text-[10px] text-amber-600/70 mt-1">Leave empty to use the server default. Picking a stronger model raises judge cost but improves score reliability.</p>
            </div>
          </div>

          {starting && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 flex items-center gap-3">
              <Loader2 size={16} className="animate-spin text-indigo-600 shrink-0" />
              <p className="text-xs text-indigo-700 font-black">Launching benchmark in the background… you can navigate away and come back any time.</p>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setBview('list')} className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={handleStartRun} disabled={starting || !selectedDs || selectedFlows.length < 2}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">
              {starting ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />} {starting ? 'Running…' : 'Run benchmark'}
            </button>
          </div>
        </div>
      )}

      {/* BENCHMARK REPORT */}
      {bview === 'report' && bmReport && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-base font-black text-slate-800">{bmReport.run_name}</p>
              <p className="text-[11px] text-slate-400 font-black uppercase tracking-wider">{bmReport.dataset_name} · {bmReport.question_count} questions · {bmReport.flow_summaries.length} flows</p>
              {(bmReport.judge_model || bmReport.judge_mode) && (
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Judge: <span className="font-mono">{bmReport.judge_mode === 'lexical' ? 'lexical fallback' : (bmReport.judge_model || 'default')}</span>
                  {bmReport.judge_mode && bmReport.judge_mode !== 'lexical' && <span className="ml-1.5 rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider">LLM</span>}
                </p>
              )}
            </div>
            <button type="button" onClick={() => { setBmReport(null); setBview('list'); setSubTab('runs'); }}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50">
              <ChevronRight size={12} className="rotate-180" /> All runs
            </button>
          </div>

          {/* Live progress panel — visible only while the background worker is running */}
          {(bmReport.status === 'running' || bmReport.status === 'pending') && (() => {
            const prog = bmReport.progress || {};
            const total = prog.total || 1;
            const current = prog.current || 0;
            const pct = Math.min(100, Math.round((current / total) * 100));
            const startedAt = prog.started_at || bmReport.created_at || Date.now();
            const elapsed = Date.now() - startedAt;
            const avgPerCell = current > 0 ? elapsed / current : 0;
            const remaining = avgPerCell > 0 ? (total - current) * avgPerCell : 0;
            return (
              <div className="rounded-3xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                    <Activity size={18} className="animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-amber-900">Benchmark running in the background</p>
                    <p className="text-[10px] text-amber-700 font-black uppercase tracking-wider">
                      {prog.stage === 'scoring' ? 'Scoring with judge model…' : 'Executing flow…'}
                      {' · '} step {current}/{total} · elapsed {fmtElapsed(elapsed)}
                      {remaining > 0 && current < total && <> · ETA ~{fmtElapsed(remaining)}</>}
                    </p>
                  </div>
                  <span className="text-2xl font-black text-amber-700 tabular-nums">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-amber-200 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-xl bg-white/60 border border-amber-200 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-wider text-amber-600">Current question</p>
                    <p className="font-black text-amber-900 truncate">
                      {prog.current_question_index != null ? `#${prog.current_question_index + 1} ` : ''}
                      {prog.current_question || '—'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/60 border border-amber-200 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-wider text-amber-600">Current flow</p>
                    <p className="font-black text-amber-900 truncate">{prog.current_flow_name || '—'}</p>
                  </div>
                </div>
                <p className="text-[10px] text-amber-700/80 font-black">
                  You can leave this page — the run continues server-side. Re-open it from the runs list any time to see live progress or final results.
                </p>
              </div>
            );
          })()}

          {bmReport.status === 'error' && (
            <div className="rounded-3xl border-2 border-rose-300 bg-rose-50 p-5">
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-black text-rose-800">Benchmark failed</p>
                  <p className="text-xs text-rose-700 mt-1 font-mono break-words">{bmReport.error_message || 'Unknown error'}</p>
                </div>
              </div>
            </div>
          )}

          {bmReport.flow_summaries.length > 0 && (() => {
            const best = bmReport.flow_summaries[0];
            const hasRag = (best.avg_overall_score || 0) > 0;
            return (
              <div className="rounded-3xl bg-gradient-to-br from-amber-50 to-indigo-50 border-2 border-amber-300 p-6 text-center">
                <Trophy size={32} className="mx-auto mb-2 text-amber-500" />
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-600 mb-1">Top-ranked flow</p>
                <p className="text-xl font-black text-amber-800">{best.flow_name}</p>
                {hasRag ? (
                  <>
                    <p className="text-sm text-amber-600 mt-1">RAG overall: {Math.round(best.avg_overall_score * 100)}%</p>
                    <p className="text-[10px] text-amber-500/80 font-black uppercase tracking-wider mt-1">
                      Judge: {best.judge_mode === 'llm' ? 'LLM (RAGAS + RAGChecker)' : 'Lexical fallback'} · Token F1 {Math.round(best.avg_token_f1 * 100)}%
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-amber-600 mt-1">Token F1: {Math.round(best.avg_token_f1 * 100)}%</p>
                )}
              </div>
            );
          })()}

          <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-700">Lexical metrics</p>
                <p className="text-[9px] text-slate-500 font-black mt-0.5">String-overlap baselines — fast, deterministic, no LLM.</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">Flow</th>
                    <th className="px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-slate-500"><MetricHeader label="Exact Match" info={METRIC_INFO.exact_match} /></th>
                    <th className="px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-slate-500"><MetricHeader label="Char Sim." info={METRIC_INFO.char_similarity} /></th>
                    <th className="px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-slate-500"><MetricHeader label="Token F1" info={METRIC_INFO.token_f1} /></th>
                  </tr>
                </thead>
                <tbody>
                  {bmReport.flow_summaries.map((fs, i) => {
                    const accent = ACCENT_PALETTE[i % ACCENT_PALETTE.length];
                    return (
                      <tr key={fs.flow_id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-black text-white ${accent.bg}`}>{i + 1}</span>
                            <span className="font-black text-slate-700">{fs.flow_name}</span>
                          </div>
                        </td>
                        {[fs.avg_exact_match, fs.avg_char_similarity, fs.avg_token_f1].map((v, ci) => (
                          <td key={ci} className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`font-black text-sm ${mColor(v)}`}>{Math.round(v * 100)}%</span>
                              <div className="w-16 h-1 rounded-full bg-slate-100 overflow-hidden">
                                <div className={`h-full rounded-full ${mBg(v)}`} style={{ width: `${v * 100}%` }} />
                              </div>
                            </div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50">
              <p className="text-[9px] text-slate-400 font-black">Hover any column header for the full definition.</p>
            </div>
          </div>

          {bmReport.flow_summaries.some(fs => (fs.avg_overall_score || 0) > 0) && (() => {
            // Common renderer for a metric cell with bar.
            const renderCell = (value, opts = {}) => {
              const { invert = false, accent = false } = opts;
              const v = value || 0;
              const display = invert ? (1 - v) : v;
              return (
                <td className={`px-2 py-3 text-center ${accent ? 'bg-amber-50/60' : ''}`}>
                  <div className="flex flex-col items-center gap-1">
                    <span className={`font-black text-[11px] ${mColor(display)}`}>{Math.round(v * 100)}%</span>
                    <div className="w-12 h-1 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${mBg(display)}`} style={{ width: `${display * 100}%` }} />
                    </div>
                  </div>
                </td>
              );
            };
            const judgeBadge = (
              <span className="rounded-full bg-amber-100 text-amber-700 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider">
                Judge: {bmReport.flow_summaries[0]?.judge_mode === 'llm'
                  ? `LLM (${bmReport.judge_model || 'default'})`
                  : 'Lexical fallback'}
              </span>
            );
            return (
              <div className="space-y-4">
                {/* Headline overall score */}
                <div className="rounded-3xl border border-amber-200 bg-white overflow-hidden">
                  <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/40 flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Overall RAG quality</p>
                      <p className="text-[9px] text-amber-500/80 font-black mt-0.5">Mean of all positive metrics with hallucination inverted. Higher = better.</p>
                    </div>
                    {judgeBadge}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">Flow</th>
                          <th className="px-3 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-amber-700">
                            <MetricHeader label="Overall Score" info={METRIC_INFO.overall_score} />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {bmReport.flow_summaries.map((fs, i) => {
                          const accent = ACCENT_PALETTE[i % ACCENT_PALETTE.length];
                          return (
                            <tr key={fs.flow_id} className="border-b border-slate-50 last:border-0 hover:bg-amber-50/30">
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-black text-white ${accent.bg}`}>{i + 1}</span>
                                  <span className="font-black text-slate-700">{fs.flow_name}</span>
                                </div>
                              </td>
                              {renderCell(fs.avg_overall_score, { accent: true })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* RAGAS section */}
                <div className="rounded-3xl border border-amber-200 bg-white overflow-hidden">
                  <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/40">
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">RAGAS — reference-free quality</p>
                    <p className="text-[9px] text-amber-500/80 font-black mt-0.5">Six axes covering answer quality and retrieval quality. Hover any header for the definition.</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-slate-500 sticky left-0 bg-slate-50">Flow</th>
                          <th className="px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-slate-500"><MetricHeader label="Faithful." info={METRIC_INFO.faithfulness} /></th>
                          <th className="px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-slate-500"><MetricHeader label="Ans Rel." info={METRIC_INFO.answer_relevancy} /></th>
                          <th className="px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-slate-500"><MetricHeader label="Ctx Prec." info={METRIC_INFO.context_precision} /></th>
                          <th className="px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-slate-500"><MetricHeader label="Ctx Rec." info={METRIC_INFO.context_recall} /></th>
                          <th className="px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-slate-500"><MetricHeader label="Ans Sim." info={METRIC_INFO.answer_similarity} /></th>
                          <th className="px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-slate-500"><MetricHeader label="Ans Corr." info={METRIC_INFO.answer_correctness} /></th>
                        </tr>
                      </thead>
                      <tbody>
                        {bmReport.flow_summaries.map((fs, i) => {
                          const accent = ACCENT_PALETTE[i % ACCENT_PALETTE.length];
                          return (
                            <tr key={fs.flow_id} className="border-b border-slate-50 last:border-0 hover:bg-amber-50/30">
                              <td className="px-3 py-3 sticky left-0 bg-white">
                                <div className="flex items-center gap-2">
                                  <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-black text-white ${accent.bg}`}>{i + 1}</span>
                                  <span className="font-black text-slate-700 truncate max-w-[140px]" title={fs.flow_name}>{fs.flow_name}</span>
                                </div>
                              </td>
                              {renderCell(fs.avg_faithfulness)}
                              {renderCell(fs.avg_answer_relevancy)}
                              {renderCell(fs.avg_context_precision)}
                              {renderCell(fs.avg_context_recall)}
                              {renderCell(fs.avg_answer_similarity)}
                              {renderCell(fs.avg_answer_correctness)}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* RAGChecker section */}
                <div className="rounded-3xl border border-amber-200 bg-white overflow-hidden">
                  <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/40">
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">RAGChecker — claim-level decomposition</p>
                    <p className="text-[9px] text-amber-500/80 font-black mt-0.5">Decomposes the answer into atomic claims and grades each against the gold answer + retrieved context.</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <th className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-slate-500 sticky left-0 bg-slate-50">Flow</th>
                          <th className="px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-slate-500"><MetricHeader label="Claim Rec." info={METRIC_INFO.claim_recall} /></th>
                          <th className="px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-slate-500"><MetricHeader label="Claim Prec." info={METRIC_INFO.claim_precision} /></th>
                          <th className="px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-rose-600"><MetricHeader label="Halluc. ↓" info={METRIC_INFO.hallucination_rate} /></th>
                          <th className="px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-slate-500"><MetricHeader label="Ctx Util." info={METRIC_INFO.context_utilization} /></th>
                        </tr>
                      </thead>
                      <tbody>
                        {bmReport.flow_summaries.map((fs, i) => {
                          const accent = ACCENT_PALETTE[i % ACCENT_PALETTE.length];
                          return (
                            <tr key={fs.flow_id} className="border-b border-slate-50 last:border-0 hover:bg-amber-50/30">
                              <td className="px-3 py-3 sticky left-0 bg-white">
                                <div className="flex items-center gap-2">
                                  <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-black text-white ${accent.bg}`}>{i + 1}</span>
                                  <span className="font-black text-slate-700 truncate max-w-[140px]" title={fs.flow_name}>{fs.flow_name}</span>
                                </div>
                              </td>
                              {renderCell(fs.avg_claim_recall)}
                              {renderCell(fs.avg_claim_precision)}
                              {renderCell(fs.avg_hallucination_rate, { invert: true })}
                              {renderCell(fs.avg_context_utilization)}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50">
                    <p className="text-[9px] text-slate-500 font-black leading-relaxed">
                      <span className="text-rose-600">Halluc. ↓</span> shows the raw hallucination rate but the bar is inverted so longer = better, matching the other columns. A tall hallucination bar is GOOD.
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Per-question breakdown</p>
            {[...new Set(bmReport.results.map(r => r.question_index))].sort((a, b) => a - b).map(qi => {
              const qResults = bmReport.results.filter(r => r.question_index === qi);
              const first = qResults[0];
              return (
                <div key={qi} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 w-5 h-5 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-black">{qi + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-800">{first.question}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 italic">Gold: {first.expected_answer}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[...qResults].sort((a, b) => (b.overall_score || b.token_f1) - (a.overall_score || a.token_f1)).map((r, i) => {
                      const accent = ACCENT_PALETTE[i % ACCENT_PALETTE.length];
                      const hasRag = (r.overall_score || 0) > 0;
                      return (
                        <div key={r.flow_id} className={`rounded-xl border ${accent.border} ${accent.light} p-3`}>
                          <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                            <span className={`text-[10px] font-black uppercase tracking-wider ${accent.text}`}>{r.flow_name}</span>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[9px] text-slate-400">{fmt(r.duration_ms)}</span>
                              {hasRag && (
                                <>
                                  <span className={`text-[10px] font-black ${mColor(r.overall_score)}`}>RAG {Math.round(r.overall_score * 100)}%</span>
                                  <span className={`text-[10px] font-black ${mColor(r.faithfulness)}`}>Faith {Math.round(r.faithfulness * 100)}%</span>
                                  <span className={`text-[10px] font-black ${mColor(1 - r.hallucination_rate)}`}>Halluc {Math.round(r.hallucination_rate * 100)}%</span>
                                  <span className="text-[9px] text-slate-400 font-black">{r.retrieved_context_count || 0} ctx</span>
                                </>
                              )}
                              <span className={`text-[10px] font-black ${mColor(r.token_f1)}`}>F1 {Math.round(r.token_f1 * 100)}%</span>
                            </div>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed">
                            <AnswerWithCitations text={r.answer} contexts={r.retrieved_contexts} />
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* HUGGINGFACE IMPORT MODAL */}
      {hfOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => !hfBusy && setHfOpen(false)}>
          <div className="w-full max-w-2xl max-h-[92vh] rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-br from-amber-50 to-orange-50 flex items-center gap-3 shrink-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/30"><Database size={18} /></div>
              <div className="flex-1">
                <p className="text-sm font-black text-amber-900">Import HuggingFace QA dataset</p>
                <p className="text-[10px] text-amber-700/80 font-black uppercase tracking-wider">datasets-server.huggingface.co — any public QA dataset</p>
              </div>
              <button type="button" onClick={() => !hfBusy && setHfOpen(false)} disabled={hfBusy} className="w-8 h-8 rounded-full hover:bg-amber-100 flex items-center justify-center text-amber-700 disabled:opacity-40"><X size={14} /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              {!hfResult && (
                <>
                  {/* Preset chips, grouped by domain */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Preset</label>
                    <div className="space-y-2">
                      {HF_DOMAIN_GROUPS.map(group => {
                        const items = HF_PRESETS.filter(p => p.domain === group.key);
                        if (items.length === 0) return null;
                        const Icon = group.icon;
                        return (
                          <div key={group.key}>
                            <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">
                              <Icon size={10} /> {group.label}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {items.map(p => (
                                <button key={p.key} type="button" disabled={hfBusy}
                                  onClick={() => applyHfPreset(p.key)}
                                  title={p.description}
                                  className={`rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-wider border transition-all ${hfPresetKey === p.key ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/30' : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:text-amber-700'}`}>
                                  {p.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">{HF_PRESETS.find(p => p.key === hfPresetKey)?.description}</p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Dataset name (your label)</label>
                    <input type="text" value={hfName} onChange={e => setHfName(e.target.value)} disabled={hfBusy}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-400" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">HF dataset id <span className="text-slate-400">(owner/name)</span></label>
                      <input type="text" placeholder="e.g. rajpurkar/squad_v2" value={hfDataset} onChange={e => setHfDataset(e.target.value)} disabled={hfBusy}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 font-mono outline-none focus:ring-2 focus:ring-amber-400" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Config <span className="text-slate-400">(auto)</span></label>
                      <input type="text" placeholder="auto" value={hfConfig} onChange={e => setHfConfig(e.target.value)} disabled={hfBusy}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 font-mono outline-none focus:ring-2 focus:ring-amber-400" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Split</label>
                      <input type="text" value={hfSplit} onChange={e => setHfSplit(e.target.value)} disabled={hfBusy}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 font-mono outline-none focus:ring-2 focus:ring-amber-400" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Questions (1–2000)</label>
                      <input type="number" min={1} max={2000} value={hfCount} onChange={e => setHfCount(e.target.value)} disabled={hfBusy}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-400" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Doc category</label>
                      <input type="text" value={hfDocCategory} onChange={e => setHfDocCategory(e.target.value)} disabled={hfBusy}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 font-mono outline-none focus:ring-2 focus:ring-amber-400" />
                    </div>
                  </div>

                  {/* Field mapping */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Field mapping <span className="text-slate-400 normal-case">(dotted paths, e.g. <code className="font-mono bg-white px-1 rounded">answers.text[0]</code>)</span></p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-0.5">question_field</label>
                        <input type="text" value={hfQuestionField} onChange={e => setHfQuestionField(e.target.value)} disabled={hfBusy}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 font-mono outline-none focus:ring-2 focus:ring-amber-400" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-0.5">answer_field</label>
                        <input type="text" value={hfAnswerField} onChange={e => setHfAnswerField(e.target.value)} disabled={hfBusy}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 font-mono outline-none focus:ring-2 focus:ring-amber-400" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-0.5">context_field <span className="text-slate-400">(opt.)</span></label>
                        <input type="text" value={hfContextField} onChange={e => setHfContextField(e.target.value)} disabled={hfBusy}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 font-mono outline-none focus:ring-2 focus:ring-amber-400" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 mb-0.5">title_field <span className="text-slate-400">(opt.)</span></label>
                        <input type="text" value={hfTitleField} onChange={e => setHfTitleField(e.target.value)} disabled={hfBusy}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 font-mono outline-none focus:ring-2 focus:ring-amber-400" />
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={hfSkipEmpty} onChange={e => setHfSkipEmpty(e.target.checked)} disabled={hfBusy}
                      className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-400" />
                    <span className="text-xs font-black text-slate-700">Skip rows with empty answers</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={hfUploadDocs} onChange={e => setHfUploadDocs(e.target.checked)} disabled={hfBusy}
                      className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-400" />
                    <span className="text-xs font-black text-slate-700">Ingest contexts as KnowledgeDocuments</span>
                  </label>
                  {hfUploadDocs && (
                    <div className="pl-6">
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Max documents (0–500)</label>
                      <input type="number" min={0} max={500} value={hfDocs} onChange={e => setHfDocs(e.target.value)} disabled={hfBusy}
                        className="w-32 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-400" />
                      <p className="text-[10px] text-slate-400 mt-1">Each unique title (or content_hash) becomes one indexed document.</p>
                    </div>
                  )}
                  {hfError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 font-black flex items-start gap-2">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <span className="break-words">{hfError}</span>
                    </div>
                  )}
                </>
              )}
              {hfResult && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-700 font-black text-sm"><CheckCircle2 size={16} /> Import complete</div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-1.5 text-xs">
                    <p className="font-black text-emerald-900">{hfResult.dataset_name}</p>
                    <p className="text-[10px] text-emerald-700/80 font-mono">{hfResult.resolved_config} / {hfResult.resolved_split}</p>
                    <div className="grid grid-cols-2 gap-2 text-emerald-700 mt-2">
                      <span>📋 {hfResult.question_count} questions</span>
                      <span>📄 {hfResult.document_count} documents</span>
                      <span>⊘ {hfResult.skipped_empty} empty skipped</span>
                      <span>⊘ {hfResult.skipped_duplicates} duplicates skipped</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 shrink-0">
              {!hfResult && (
                <>
                  <button type="button" onClick={() => setHfOpen(false)} disabled={hfBusy}
                    className="rounded-2xl border border-slate-200 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-white">Cancel</button>
                  <button type="button" onClick={handleImportHf} disabled={hfBusy}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:from-amber-400 hover:to-orange-400 shadow-md shadow-amber-500/30 disabled:opacity-50">
                    {hfBusy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                    {hfBusy ? 'Importing…' : 'Import'}
                  </button>
                </>
              )}
              {hfResult && (
                <button type="button" onClick={() => { setHfOpen(false); setHfResult(null); }}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700">Done</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Generate test-set modal (Ragas-style) ─────────────────────── */}
      {genOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-3 p-5 border-b border-slate-100 shrink-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/30"><Sparkles size={18} /></div>
              <div className="flex-1">
                <p className="text-sm font-black text-amber-900">Generate test-set from knowledge base</p>
                <p className="text-[10px] text-amber-700/80 font-black uppercase tracking-wider">Inspired by Ragas TestsetGenerator — an LLM authors SQuAD-style Q&amp;A pairs from your uploaded docs</p>
              </div>
              <button type="button" onClick={() => !genBusy && setGenOpen(false)} disabled={genBusy} className="w-8 h-8 rounded-full hover:bg-amber-100 flex items-center justify-center text-amber-700 disabled:opacity-40"><X size={14} /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              {!genResult && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Dataset name</label>
                      <input type="text" value={genName} onChange={e => setGenName(e.target.value)} disabled={genBusy}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-400" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Description</label>
                      <input type="text" value={genDescription} onChange={e => setGenDescription(e.target.value)} disabled={genBusy}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-400" />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Source documents <span className="text-slate-400 normal-case">({genDocIds.length === 0 ? 'all' : genDocIds.length} selected)</span></label>
                      {genDocs.length > 0 && (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setGenDocIds([])} disabled={genBusy}
                            className="text-[10px] font-black uppercase tracking-wider text-amber-600 hover:text-amber-800">All</button>
                          <button type="button" onClick={() => setGenDocIds(genDocs.map(d => d.id))} disabled={genBusy}
                            className="text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-700">Select all</button>
                          <button type="button" onClick={() => setGenDocIds([])} disabled={genBusy}
                            className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-600">Clear</button>
                        </div>
                      )}
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 max-h-48 overflow-y-auto">
                      {genDocsLoading && (
                        <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-amber-400" /></div>
                      )}
                      {!genDocsLoading && genDocs.length === 0 && (
                        <div className="flex flex-col items-center text-center py-8 px-4">
                          <BookOpen size={20} className="text-slate-300 mb-2" />
                          <p className="text-xs font-black text-slate-600">No documents in knowledge base</p>
                          <p className="text-[10px] text-slate-400 mt-1">Upload PDFs / docs in the Knowledge tab first.</p>
                        </div>
                      )}
                      {!genDocsLoading && genDocs.length > 0 && (
                        <div className="divide-y divide-slate-200">
                          {genDocs.map(doc => {
                            const checked = genDocIds.includes(doc.id);
                            return (
                              <label key={doc.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white">
                                <input type="checkbox" checked={checked} onChange={() => toggleGenDoc(doc.id)} disabled={genBusy}
                                  className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-400" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-black text-slate-700 truncate">{doc.name || doc.title || doc.id}</p>
                                  <p className="text-[10px] text-slate-400 truncate">{(doc.chunk_count ?? doc.chunks ?? 0)} chunks{doc.category ? ` · ${doc.category}` : ''}</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5">Tip: leave nothing selected to draw from all documents.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Questions (1–50)</label>
                      <input type="number" min={1} max={50} value={genCount} onChange={e => setGenCount(e.target.value)} disabled={genBusy}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-400" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Author model</label>
                      <select value={genModel} onChange={e => setGenModel(e.target.value)} disabled={genBusy}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-amber-400">
                        {GEN_MODEL_PRESETS.map(m => (
                          <option key={m.id} value={m.id}>{m.label} — {m.id}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Question style</label>
                    <div className="flex gap-2">
                      {[
                        { key: 'factual',   label: 'Factual',   desc: 'Single-fact, extractive — answers directly in the passage.' },
                        { key: 'reasoning', label: 'Reasoning', desc: 'Inferential — requires combining facts from the passage.' },
                      ].map(opt => (
                        <button key={opt.key} type="button" disabled={genBusy}
                          onClick={() => setGenStyle(opt.key)}
                          title={opt.desc}
                          className={`flex-1 rounded-2xl border px-3 py-2 text-left transition-all ${genStyle === opt.key ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/30' : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'}`}>
                          <p className="text-xs font-black uppercase tracking-wider">{opt.label}</p>
                          <p className={`text-[10px] mt-0.5 ${genStyle === opt.key ? 'text-amber-50' : 'text-slate-400'}`}>{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {genError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 font-black flex items-start gap-2">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <span className="break-words">{genError}</span>
                    </div>
                  )}
                </>
              )}
              {genResult && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-700 font-black text-sm"><CheckCircle2 size={16} /> Generation complete</div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-1.5 text-xs">
                    <p className="font-black text-emerald-900">{genResult.dataset_name}</p>
                    <div className="grid grid-cols-2 gap-2 text-emerald-700 mt-2">
                      <span>📋 {genResult.question_count} questions</span>
                      <span>📄 {genResult.documents_used} documents</span>
                      <span>⊘ {genResult.skipped_chunks} chunks skipped</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 shrink-0">
              {!genResult && (
                <>
                  <button type="button" onClick={() => setGenOpen(false)} disabled={genBusy}
                    className="rounded-2xl border border-slate-200 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-white">Cancel</button>
                  <button type="button" onClick={handleGenerateTestset} disabled={genBusy || (!genDocsLoading && genDocs.length === 0)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:from-amber-400 hover:to-amber-400 shadow-md shadow-amber-500/30 disabled:opacity-50">
                    {genBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    {genBusy ? 'Generating…' : 'Generate'}
                  </button>
                </>
              )}
              {genResult && (
                <button type="button" onClick={() => { setGenOpen(false); setGenResult(null); }}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700">Done</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────

const AuditTab = () => {
  // ── State ──────────────────────────────────────────────────────
  const [mode, setMode] = useState('arena'); // 'arena' | 'benchmark'
  const [view, setView] = useState('list'); // 'list' | 'create' | 'session' | 'report'
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [backendFlows, setBackendFlows] = useState([]);
  const [backendFlowsLoading, setBackendFlowsLoading] = useState(false);

  // Create form
  const [sessionName, setSessionName] = useState('');
  const [selectedFlowIds, setSelectedFlowIds] = useState([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Active session
  const [activeSession, setActiveSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  // Current question round
  const [questionText, setQuestionText] = useState('');
  const [asking, setAskking] = useState(false);
  const [currentRound, setCurrentRound] = useState(null); // { question_index, responses, remaining }
  const [voted, setVoted] = useState(false);       // voted this round
  const [revealed, setRevealed] = useState(false); // show real flow names

  // Report
  const [report, setReport] = useState(null);

  const questionRef = useRef(null);

  // ── Data loading ───────────────────────────────────────────────
  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const data = await xragApi.listAuditSessions();
      setSessions(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    finally { setSessionsLoading(false); }
  };

  const loadBackendFlows = async () => {
    setBackendFlowsLoading(true);
    try {
      const data = await xragApi.listCanvasFlows();
      setBackendFlows(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    finally { setBackendFlowsLoading(false); }
  };

  useEffect(() => { loadSessions(); }, []);

  useEffect(() => {
    if (view === 'create') loadBackendFlows();
  }, [view]);

  // ── Create session ─────────────────────────────────────────────
  const handleCreate = async () => {
    if (selectedFlowIds.length < 2) { setCreateError('Select at least 2 flows.'); return; }
    setCreating(true); setCreateError('');
    try {
      const session = await xragApi.createAuditSession({
        name: sessionName.trim() || 'Audit Session',
        flow_ids: selectedFlowIds,
      });
      await loadSessions();
      openSession(session.id);
    } catch (e) {
      setCreateError(e.message || 'Failed to create session.');
    } finally {
      setCreating(false);
    }
  };

  // ── Open session ───────────────────────────────────────────────
  const openSession = async (sessionId) => {
    setSessionLoading(true);
    setCurrentRound(null); setVoted(false); setRevealed(false); setQuestionText('');
    try {
      const s = await xragApi.getAuditSession(sessionId);
      setActiveSession(s);
      if (s.status === 'finished') {
        const r = await xragApi.getAuditReport(sessionId);
        setReport(r);
        setView('report');
      } else {
        setView('session');
      }
    } catch { /* ignore */ }
    finally { setSessionLoading(false); }
  };

  // ── Ask question ───────────────────────────────────────────────
  const handleAsk = async () => {
    if (!questionText.trim() || asking || !activeSession) return;
    setAskking(true);
    try {
      const round = await xragApi.auditAsk(activeSession.id, questionText.trim());
      setCurrentRound(round);
      setVoted(false); setRevealed(false);
      setQuestionText('');
    } catch (e) {
      alert(e.message);
    } finally {
      setAskking(false);
    }
  };

  // ── Vote ───────────────────────────────────────────────────────
  const handleVote = async (winnerLabel) => {
    if (!currentRound || !activeSession) return;
    try {
      await xragApi.auditVote(activeSession.id, currentRound.question_index, winnerLabel);
      setVoted(true);
      // Refresh session
      const s = await xragApi.getAuditSession(activeSession.id);
      setActiveSession(s);
      if (s.status === 'finished') {
        const r = await xragApi.getAuditReport(s.id);
        setReport(r);
        await loadSessions();
      }
    } catch (e) {
      alert(e.message);
    }
  };

  // ── Finish ─────────────────────────────────────────────────────
  const handleFinish = async () => {
    if (!activeSession) return;
    try {
      const r = await xragApi.auditFinish(activeSession.id);
      setReport(r);
      setView('report');
      await loadSessions();
    } catch (e) {
      alert(e.message);
    }
  };

  // ── Delete session ─────────────────────────────────────────────
  const handleDelete = async (sessionId) => {
    try {
      await xragApi.deleteAuditSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch { /* ignore */ }
  };

  const questionsDone = activeSession
    ? activeSession.questions.filter((q) => q.winner_label).length
    : 0;
  const questionsAsked = activeSession ? activeSession.questions.length : 0;
  const canAsk = !asking && !currentRound && questionsAsked < MAX_Q && activeSession?.status !== 'finished';

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="h-full w-full overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-amber-950 px-6 py-12 md:px-12 md:py-14 border-b border-indigo-900/40">
        {/* Grid pattern */}
        <div className="pointer-events-none absolute inset-0 xrag-arena-grid-bg" />
        {/* Floating orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="xrag-arena-orb-1 absolute -top-16 -right-10 h-64 w-64 rounded-full bg-indigo-500/25 blur-3xl" />
          <div className="xrag-arena-orb-2 absolute -bottom-10 left-1/4 h-44 w-44 rounded-full bg-amber-500/20 blur-3xl" />
          <div className="xrag-arena-orb-3 absolute top-1/2 right-1/3 h-32 w-32 rounded-full bg-amber-500/15 blur-3xl" />
        </div>
        {/* Diagonal sheen */}
        <div className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12" />

        <div className="relative flex items-center justify-between gap-6 flex-wrap">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-amber-500/20 border border-indigo-400/40 flex items-center justify-center backdrop-blur-sm shadow-lg shadow-indigo-500/20">
                <Shield size={18} className="text-indigo-200" />
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950 shadow-lg shadow-emerald-400/50" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-[0.4em] text-indigo-300">Flow Arena</span>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.25em] text-indigo-200">
                <Sparkles size={9} /> v2
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-[1.05]">
              Audit <span className="bg-gradient-to-r from-indigo-300 via-amber-300 to-amber-300 bg-clip-text text-transparent">Arena</span>
            </h1>
            <p className="mt-3 text-sm md:text-base text-slate-400 leading-relaxed max-w-xl">
              Blind-test your saved RAG flows side-by-side. Ask up to <span className="font-black text-indigo-300">{MAX_Q}</span> questions, pick the best answer each time, and discover which pipeline truly fits you.
            </p>
            {/* mini stat row */}
            <div className="mt-5 flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-200 backdrop-blur-sm">
                <FlaskConical size={11} /> {sessions.length} session{sessions.length !== 1 ? 's' : ''}
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200 backdrop-blur-sm">
                <CheckCircle2 size={11} /> {sessions.filter(s => s.status === 'finished').length} finished
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200 backdrop-blur-sm">
                <Zap size={11} /> RAGAS + RAGChecker
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode === 'arena' && view !== 'list' && (
              <button
                type="button"
                onClick={() => { setView('list'); setActiveSession(null); setCurrentRound(null); }}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-200 hover:bg-white/10 hover:border-white/25 backdrop-blur-sm transition"
              >
                <ChevronRight size={13} className="rotate-180" /> All sessions
              </button>
            )}
            {mode === 'arena' && view === 'list' && (
              <button
                type="button"
                onClick={() => { setView('create'); setSelectedFlowIds([]); setSessionName(''); setCreateError(''); }}
                className="group relative inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-amber-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:from-indigo-400 hover:to-amber-500 shadow-xl shadow-indigo-500/40 transition-all hover:scale-105 overflow-hidden"
              >
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                <Plus size={13} className="relative" /> <span className="relative">New audit</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 md:px-12 py-8 max-w-5xl mx-auto">

        {/* Mode switcher — segmented sliding pill */}
        <div className="relative inline-flex items-center p-1 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200/70 border border-slate-200 shadow-inner mb-8">
          {/* Sliding indicator */}
          <span
            aria-hidden
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-white shadow-md shadow-indigo-500/10 ring-1 ring-slate-200 transition-transform duration-300 ease-out"
            style={{ transform: `translateX(${mode === 'arena' ? '0%' : '100%'})` }}
          />
          {[
            { key: 'arena', label: 'Blind Arena', icon: <FlaskConical size={13} /> },
            { key: 'benchmark', label: 'Benchmark', icon: <Target size={13} /> },
          ].map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`relative z-10 inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-[11px] font-black uppercase tracking-[0.15em] transition-colors ${
                mode === key ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {mode === 'arena' && (<>
        {/* LIST VIEW */}
        {view === 'list' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                {sessions.length} session{sessions.length !== 1 ? 's' : ''}
              </p>
              <button type="button" onClick={loadSessions} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-indigo-600">
                <RefreshCw size={11} className={sessionsLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            {sessionsLoading && (
              <div className="flex justify-center py-12">
                <Loader2 size={24} className="animate-spin text-indigo-400" />
              </div>
            )}

            {!sessionsLoading && sessions.length === 0 && (
              <div className="relative flex flex-col items-center py-20 text-center rounded-3xl border border-dashed border-slate-200 bg-gradient-to-b from-white to-slate-50/60 overflow-hidden">
                <div className="pointer-events-none absolute inset-0 xrag-arena-grid-bg opacity-50" />
                <div className="relative xrag-arena-ring text-indigo-300 w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-50 to-amber-50 border border-indigo-200 flex items-center justify-center text-indigo-500 mb-5 shadow-lg shadow-indigo-500/10">
                  <FlaskConical size={32} />
                </div>
                <p className="relative text-base font-black text-slate-700">No audit sessions yet</p>
                <p className="relative text-xs text-slate-400 mt-1.5 max-w-xs">Create one to start blind-testing your flows side by side.</p>
                <button
                  type="button"
                  onClick={() => setView('create')}
                  className="relative mt-5 group inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-amber-600 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:from-indigo-400 hover:to-amber-500 shadow-xl shadow-indigo-500/30 transition-all hover:scale-105 overflow-hidden"
                >
                  <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                  <Plus size={13} className="relative" /> <span className="relative">New audit session</span>
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sessions.map((s) => (
                <SessionCard key={s.id} session={s} onOpen={openSession} onDelete={handleDelete} />
              ))}
            </div>
          </div>
        )}

        {/* CREATE VIEW */}
        {view === 'create' && (
          <div className="max-w-xl mx-auto space-y-5">
            <div>
              <h2 className="text-lg font-black text-slate-800 mb-1">New audit session</h2>
              <p className="text-xs text-slate-500">Select 2–8 saved canvas flows to compare side by side.</p>
            </div>

            {/* Session name */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Session name</label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g. Q2 Pipeline Benchmark"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {/* Flow picker */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Flows to compare ({selectedFlowIds.length}/8 selected)
                </label>
                {backendFlowsLoading && <Loader2 size={12} className="animate-spin text-slate-400" />}
              </div>

              {!backendFlowsLoading && backendFlows.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
                  No saved flows found. Save canvas flows first.
                </div>
              )}

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {backendFlows.map((flow) => {
                  const isSelected = selectedFlowIds.includes(flow.id);
                  const idx = selectedFlowIds.indexOf(flow.id);
                  const accent = idx >= 0 ? ACCENT_PALETTE[idx % ACCENT_PALETTE.length] : null;
                  return (
                    <button
                      key={flow.id}
                      type="button"
                      onClick={() => {
                        setSelectedFlowIds((prev) =>
                          isSelected ? prev.filter((id) => id !== flow.id)
                                     : prev.length < 8 ? [...prev, flow.id] : prev
                        );
                      }}
                      className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                        isSelected
                          ? `${accent.border} ${accent.light} shadow-sm`
                          : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40'
                      }`}
                    >
                      <div className={`shrink-0 w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black text-white ${isSelected ? accent.bg : 'bg-slate-300'}`}>
                        {isSelected ? String.fromCharCode(65 + idx) : <Network size={13} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-black truncate ${isSelected ? accent.text : 'text-slate-700'}`}>
                          {flow.name}
                        </p>
                        <p className="text-[10px] text-slate-400">{flow.node_count} nodes · {flow.edge_count} edges</p>
                      </div>
                      {isSelected && <CheckCircle2 size={16} className={accent.text} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {createError && (
              <p className="flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 font-black">
                <AlertCircle size={13} /> {createError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setView('list')}
                className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || selectedFlowIds.length < 2}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creating ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
                Start audit
              </button>
            </div>
          </div>
        )}

        {/* SESSION VIEW */}
        {view === 'session' && activeSession && (
          <div className="space-y-6">
            {/* Progress bar */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-base font-black text-slate-800">{activeSession.name}</p>
                  <p className="text-[11px] text-slate-400 font-black uppercase tracking-wider mt-0.5">
                    {activeSession.flows.map((f) => f.blind_label).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${
                    questionsAsked >= MAX_Q
                      ? 'border-amber-300 bg-amber-50 text-amber-700'
                      : 'border-sky-300 bg-sky-50 text-sky-700'
                  }`}>
                    {questionsAsked}/{MAX_Q} questions
                  </span>
                  <button
                    type="button"
                    onClick={handleFinish}
                    className="rounded-2xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-100"
                  >
                    Finish & report
                  </button>
                </div>
              </div>

              {/* Per-flow live tally */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {activeSession.flows.map((entry) => {
                  const accent = labelAccent(entry.blind_label);
                  const wins = activeSession.tally?.[entry.flow_id] || 0;
                  return (
                    <div key={entry.flow_id} className={`rounded-2xl border ${accent.border} ${accent.light} px-3 py-2 text-center`}>
                      <p className={`text-lg font-black ${accent.text}`}>{wins}</p>
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 truncate">{entry.blind_label}</p>
                    </div>
                  );
                })}
              </div>

              {/* Progress fill */}
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                  style={{ width: `${(questionsDone / MAX_Q) * 100}%` }}
                />
              </div>
            </div>

            {/* Ask input */}
            {activeSession.status !== 'finished' && questionsAsked < MAX_Q && (
              <div className={`rounded-3xl border ${currentRound && !voted ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 bg-white'} p-5`}>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-3">
                  {currentRound ? (voted ? 'Ask next question' : 'Vote before asking next') : 'Ask a question'}
                </p>
                <div className="flex gap-2">
                  <textarea
                    ref={questionRef}
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && canAsk) { e.preventDefault(); handleAsk(); } }}
                    disabled={!canAsk}
                    placeholder={
                      !canAsk && currentRound && !voted
                        ? 'Vote on the current round first…'
                        : questionsAsked >= MAX_Q
                          ? 'Maximum questions reached. Finish to see report.'
                          : `Ask something (${MAX_Q - questionsAsked} remaining)…`
                    }
                    rows={2}
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400 resize-none disabled:opacity-50 disabled:bg-slate-50"
                  />
                  <button
                    type="button"
                    onClick={handleAsk}
                    disabled={!canAsk || !questionText.trim()}
                    className="shrink-0 h-full px-4 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {asking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            )}

            {/* Current round */}
            {currentRound && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black text-slate-700">
                    Q{currentRound.question_index + 1}: &ldquo;{activeSession.questions[currentRound.question_index]?.question}&rdquo;
                  </p>
                  <button
                    type="button"
                    onClick={() => setRevealed((v) => !v)}
                    disabled={!voted}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-indigo-600 disabled:opacity-30"
                  >
                    {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
                    {revealed ? 'Hide names' : 'Reveal flows'}
                  </button>
                </div>

                {!voted && (
                  <p className="text-[11px] text-indigo-700 font-black bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
                    Click the answer you prefer — your choice will be recorded anonymously.
                  </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentRound.responses.map((resp) => {
                    const winnerLabel = voted
                      ? activeSession.questions[currentRound.question_index]?.winner_label
                      : null;
                    const flowEntry = activeSession.flows.find((e) => e.blind_label === resp.blind_label);
                    return (
                      <ResponseCard
                        key={resp.blind_label}
                        resp={resp}
                        selected={winnerLabel}
                        onSelect={handleVote}
                        revealed={revealed && voted}
                        flowName={flowEntry?.flow_name}
                      />
                    );
                  })}
                </div>

                {voted && currentRound.remaining === 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
                    <p className="text-sm font-black text-amber-800">All {MAX_Q} questions used!</p>
                    <button
                      type="button"
                      onClick={handleFinish}
                      className="mt-2 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-amber-700"
                    >
                      <BarChart3 size={13} /> See final report
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Previous rounds */}
            {activeSession.questions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Previous rounds</p>
                {[...activeSession.questions].reverse().map((q) => {
                  if (currentRound && q.question_index === currentRound.question_index) return null;
                  const winnerEntry = activeSession.flows.find((e) => e.flow_id === q.winner_flow_id);
                  const accent = winnerEntry ? labelAccent(winnerEntry.blind_label) : ACCENT_PALETTE[0];
                  return (
                    <div key={q.question_index} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3">
                      <span className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white ${accent.bg}`}>
                        {q.question_index + 1}
                      </span>
                      <p className="flex-1 text-xs text-slate-700 truncate">{q.question}</p>
                      {q.winner_label ? (
                        <span className={`text-[10px] font-black ${accent.text}`}>
                          → {q.winner_label}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">pending</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* REPORT VIEW */}
        {view === 'report' && report && (
          <ReportView
            report={report}
            onClose={() => { setView('list'); setReport(null); setActiveSession(null); loadSessions(); }}
          />
        )}

        {sessionLoading && (
          <div className="flex justify-center py-20">
            <Loader2 size={28} className="animate-spin text-indigo-400" />
          </div>
        )}
        </>)}

        {/* BENCHMARK MODE */}
        {mode === 'benchmark' && <BenchmarkPanel />}
      </div>
    </div>
  );
};

export default AuditTab;
