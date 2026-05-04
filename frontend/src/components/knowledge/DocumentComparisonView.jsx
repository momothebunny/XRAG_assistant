import {
  ArrowRightLeft,
  CalendarDays,
  FileText,
  Layers3,
  Loader2,
  Sigma,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { xragApi } from '../../services/xragApi';

const fmt = (n, dec = 0) =>
  n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtBytes = (b) => {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

const fmtAge = (epochMs) => {
  if (!epochMs) return '—';
  const days = Math.floor((Date.now() - epochMs) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
};

const safeDiv = (a, b) => (b > 0 ? a / b : 0);

const diffLabel = (a, b) => {
  if (a == null || b == null || a === b) return null;
  const minVal = Math.min(a, b);
  const maxVal = Math.max(a, b);
  const pct = minVal === 0 ? 0 : Math.round(((maxVal - minVal) / minVal) * 100);
  if (pct < 1) return null;
  return { text: `${a > b ? 'A' : 'B'} ${pct}% larger` };
};

// ── Compact 3-column comparison row ─────────────────────────────────────────
const CompareRow = ({ label, hint, aVal, bVal, format }) => {
  const fmt_ = format ?? ((v) => (v ?? 0).toLocaleString('en-US'));
  const max = Math.max(aVal || 0, bVal || 0);
  const aPct = max > 0 ? Math.round(((aVal || 0) / max) * 100) : 0;
  const bPct = max > 0 ? Math.round(((bVal || 0) / max) * 100) : 0;
  const diff = diffLabel(aVal, bVal);
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_minmax(0,3fr)] gap-x-4 items-center py-2.5 border-b border-slate-50 last:border-0">
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-wider text-slate-700 leading-tight">{label}</p>
        {hint && <p className="text-[8px] text-slate-400 italic mt-0.5 leading-snug">{hint}</p>}
        {diff && <span className="text-[8px] bg-indigo-50 text-indigo-500 rounded px-1 py-0.5 font-bold mt-1 inline-block">{diff.text}</span>}
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="w-3.5 h-3.5 rounded-sm bg-blue-100 flex items-center justify-center text-[6px] font-black text-blue-600 shrink-0">A</span>
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${aPct}%`, background: 'linear-gradient(90deg, #60a5fa, #818cf8)' }} />
        </div>
        <span className="text-[10px] font-black text-blue-700 tabular-nums shrink-0 w-10 text-right">{fmt_(aVal)}</span>
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="w-3.5 h-3.5 rounded-sm bg-amber-100 flex items-center justify-center text-[6px] font-black text-amber-600 shrink-0">B</span>
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${bPct}%`, background: 'linear-gradient(90deg, #fbbf24, #facc15)' }} />
        </div>
        <span className="text-[10px] font-black text-amber-700 tabular-nums shrink-0 w-10 text-right">{fmt_(bVal)}</span>
      </div>
    </div>
  );
};

// ── Compact 3-column score row (0–1 → %) ────────────────────────────────────
const ScoreRow = ({ label, hint, scoreA, scoreB }) => {
  const pA = Math.round((scoreA ?? 0) * 100);
  const pB = Math.round((scoreB ?? 0) * 100);
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_minmax(0,3fr)] gap-x-4 items-center py-2.5 border-b border-slate-50 last:border-0">
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-wider text-slate-700 leading-tight">{label}</p>
        {hint && <p className="text-[8px] text-slate-400 italic mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="w-3.5 h-3.5 rounded-sm bg-blue-100 flex items-center justify-center text-[6px] font-black text-blue-600 shrink-0">A</span>
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pA}%`, background: 'linear-gradient(90deg, #60a5fa, #818cf8)' }} />
        </div>
        <span className="text-[10px] font-black text-blue-700 tabular-nums shrink-0 w-8 text-right">{pA}%</span>
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="w-3.5 h-3.5 rounded-sm bg-amber-100 flex items-center justify-center text-[6px] font-black text-amber-600 shrink-0">B</span>
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pB}%`, background: 'linear-gradient(90deg, #fbbf24, #facc15)' }} />
        </div>
        <span className="text-[10px] font-black text-amber-700 tabular-nums shrink-0 w-8 text-right">{pB}%</span>
      </div>
    </div>
  );
};

const StatPair = ({ label, aVal, bVal }) => {
  const pill = (val, side) => {
    const isEmpty = val === '—' || val == null || val === '';
    if (isEmpty) return (
      <span className="text-[10px] italic text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-0.5">N/A</span>
    );
    return side === 'a'
      ? <span className="text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5 max-w-[10rem] truncate">{val}</span>
      : <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 max-w-[10rem] truncate">{val}</span>;
  };
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        {pill(aVal, 'a')}
        <span className="text-[8px] text-slate-300 shrink-0">vs</span>
        {pill(bVal, 'b')}
      </div>
    </div>
  );
};

const computeMetrics = (a, b) => {
  const aCPW = safeDiv(a.char_count, a.word_count);
  const bCPW = safeDiv(b.char_count, b.word_count);
  const aTPW = safeDiv(a.token_estimate, a.word_count);
  const bTPW = safeDiv(b.token_estimate, b.word_count);
  const aCPC = safeDiv(a.char_count, a.chunk_count);
  const bCPC = safeDiv(b.char_count, b.chunk_count);
  const aWPC = safeDiv(a.word_count, a.chunk_count);
  const bWPC = safeDiv(b.word_count, b.chunk_count);
  const aTPC = safeDiv(a.token_estimate, a.chunk_count);
  const bTPC = safeDiv(b.token_estimate, b.chunk_count);
  const aBPC = safeDiv(a.size_bytes, a.char_count);
  const bBPC = safeDiv(b.size_bytes, b.char_count);
  const aTPP = a.page_count > 0 ? safeDiv(a.token_estimate, a.page_count) : null;
  const bTPP = b.page_count > 0 ? safeDiv(b.token_estimate, b.page_count) : null;
  const aCPP = a.page_count > 0 ? safeDiv(a.chunk_count, a.page_count) : null;
  const bCPP = b.page_count > 0 ? safeDiv(b.chunk_count, b.page_count) : null;
  const aWPP = a.page_count > 0 ? safeDiv(a.word_count, a.page_count) : null;
  const bWPP = b.page_count > 0 ? safeDiv(b.word_count, b.page_count) : null;

  const IDEAL_TPC = 512;
  const aChunkEff = Math.min(1, aTPC / IDEAL_TPC);
  const bChunkEff = Math.min(1, bTPC / IDEAL_TPC);

  const maxTokens = Math.max(a.token_estimate || 1, b.token_estimate || 1);
  const aRichness = Math.min(1, (a.token_estimate || 0) / maxTokens);
  const bRichness = Math.min(1, (b.token_estimate || 0) / maxTokens);

  const keys = ['char_count', 'word_count', 'token_estimate', 'chunk_count'];
  let dot = 0, normA = 0, normB = 0;
  keys.forEach((k) => {
    const av = a[k] || 0; const bv = b[k] || 0;
    dot += av * bv; normA += av * av; normB += bv * bv;
  });
  const structSimilarity = normA > 0 && normB > 0 ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;

  const volKeys = ['char_count', 'word_count', 'token_estimate', 'chunk_count', 'size_bytes'];
  const diffs = volKeys.map((k) => {
    const av = a[k] || 0; const bv = b[k] || 0;
    const mx = Math.max(av, bv);
    return mx > 0 ? Math.abs(av - bv) / mx : 0;
  });
  const volumeProximity = 1 - diffs.reduce((s, v) => s + v, 0) / diffs.length;

  const TWO_YEARS_MS = 730 * 86_400_000;
  const aAge = a.created_at ? Math.floor((Date.now() - a.created_at) / 86_400_000) : null;
  const bAge = b.created_at ? Math.floor((Date.now() - b.created_at) / 86_400_000) : null;
  const aUpdAge = a.updated_at ? Math.floor((Date.now() - a.updated_at) / 86_400_000) : null;
  const bUpdAge = b.updated_at ? Math.floor((Date.now() - b.updated_at) / 86_400_000) : null;
  const aFreshness = a.updated_at ? Math.max(0, 1 - (Date.now() - a.updated_at) / TWO_YEARS_MS) : 0;
  const bFreshness = b.updated_at ? Math.max(0, 1 - (Date.now() - b.updated_at) / TWO_YEARS_MS) : 0;

  const catMatch = !!(a.category && b.category && a.category === b.category);
  const subCatMatch = !!(a.subcategory && b.subcategory && a.subcategory === b.subcategory);
  const taxonomyScore = catMatch ? (subCatMatch ? 1 : 0.6) : 0.05;

  const tokenComplexity = (tpw) => {
    if (!tpw) return 0.5;
    if (tpw < 0.8) return 0.3;
    if (tpw < 1.2) return 0.65;
    if (tpw < 1.6) return 1.0;
    if (tpw < 2.0) return 0.8;
    return 0.5;
  };

  const infoDensityScore = (d, tpc) => {
    const s1 = Math.min(1, (d.token_estimate || 0) / 100_000);
    const s2 = Math.min(1, (d.chunk_count || 0) / 200);
    const s3 = Math.min(1, tpc / IDEAL_TPC);
    return (s1 + s2 + s3) / 3;
  };

  const cfg = (d) => d.chunking_config ?? {};
  const aChunkSize = cfg(a).chunk_size ?? cfg(a).chunkSize ?? null;
  const bChunkSize = cfg(b).chunk_size ?? cfg(b).chunkSize ?? null;
  const aOverlap = cfg(a).chunk_overlap ?? cfg(a).chunkOverlap ?? null;
  const bOverlap = cfg(b).chunk_overlap ?? cfg(b).chunkOverlap ?? null;

  const semanticEst = Math.min(
    100,
    Math.round((taxonomyScore * 0.45 + structSimilarity * 0.35 + volumeProximity * 0.2) * 100),
  );

  return {
    aCPW, bCPW, aTPW, bTPW, aCPC, bCPC, aWPC, bWPC, aTPC, bTPC, aBPC, bBPC,
    aTPP, bTPP, aCPP, bCPP, aWPP, bWPP,
    aChunkEff, bChunkEff, aRichness, bRichness,
    structSimilarity, volumeProximity, semanticEst,
    aFreshness, bFreshness, aAge, bAge, aUpdAge, bUpdAge,
    catMatch, subCatMatch, taxonomyScore,
    aTokenComplexity: tokenComplexity(aTPW), bTokenComplexity: tokenComplexity(bTPW),
    aInfoDensity: infoDensityScore(a, aTPC), bInfoDensity: infoDensityScore(b, bTPC),
    aVerbosity: safeDiv(a.word_count, a.token_estimate), bVerbosity: safeDiv(b.word_count, b.token_estimate),
    aChunkSize, bChunkSize, aOverlap, bOverlap,
  };
};

const METRIC_TABS = [
  { id: 'volume',   label: 'Volume',   icon: FileText    },
  { id: 'density',  label: 'Density',  icon: Sigma       },
  { id: 'chunking', label: 'Chunking', icon: Layers3     },
  { id: 'temporal', label: 'Temporal', icon: CalendarDays },
  { id: 'profile',  label: 'Profile',  icon: TrendingUp  },
];

const DocumentComparisonView = () => {
  const [allDocs, setAllDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState(null);      // { status, summary }
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await xragApi.listKnowledgeDocuments();
        if (!cancelled) setAllDocs(list);
      } catch {
        if (!cancelled) setAllDocs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const comparableDocs = useMemo(
    () => allDocs.filter((d) => d.status === 'indexed' || d.status === 'Indexed'),
    [allDocs],
  );

  const [aId, setAId] = useState(null);
  const [bId, setBId] = useState(null);
  const [metricTab, setMetricTab] = useState('volume');

  useEffect(() => {
    if (comparableDocs.length >= 1 && aId == null) setAId(comparableDocs[0].id);
    if (comparableDocs.length >= 2 && bId == null) setBId(comparableDocs[1].id);
  }, [comparableDocs]);

  const docA = comparableDocs.find((d) => d.id === aId) ?? comparableDocs[0] ?? null;
  const docB =
    comparableDocs.find((d) => d.id === bId) ??
    comparableDocs.find((d) => d.id !== docA?.id) ??
    comparableDocs[0] ?? null;

  const m = useMemo(() => (docA && docB ? computeMetrics(docA, docB) : null), [docA, docB]);

  // Fetch AI summary whenever the document pair changes
  useEffect(() => {
    if (!docA || !docB || docA.id === docB.id) {
      setAiSummary(null);
      return;
    }
    let cancelled = false;
    setAiSummary(null);
    setAiSummaryLoading(true);
    (async () => {
      try {
        const result = await xragApi.compareDocumentsSummary(docA.id, docB.id);
        if (!cancelled) setAiSummary(result);
      } catch (err) {
        if (!cancelled) setAiSummary({ status: 'error', summary: `Failed to load summary: ${err.message}` });
      } finally {
        if (!cancelled) setAiSummaryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docA?.id, docB?.id]);

  if (loading) {
    return (
      <div className="p-14 flex flex-col items-center justify-center gap-3">
        <Loader2 size={28} className="animate-spin text-indigo-300" />
        <p className="text-xs text-slate-400 font-medium">Loading documents…</p>
      </div>
    );
  }

  if (comparableDocs.length < 2) {
    return (
      <div className="p-14 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <FileText size={24} className="text-slate-400" />
        </div>
        <p className="text-sm font-black text-slate-600">At least 2 indexed documents required</p>
        <p className="text-xs text-slate-400 mt-1">for comparison</p>
      </div>
    );
  }

  const isSamePair = docA?.id === docB?.id;

  return (
    <div className="p-5 md:p-7 space-y-6 bg-slate-50/50">

      {/* Document selector */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_48px_1fr] gap-3 items-end">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-md bg-blue-500 flex items-center justify-center text-[9px] font-black text-white shadow-sm">A</span>
            <label className="text-[10px] font-black uppercase tracking-wider text-blue-600">Document A</label>
          </div>
          <select
            value={docA?.id ?? ''}
            onChange={(e) => setAId(e.target.value)}
            className="w-full bg-white border-2 border-blue-100 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm"
          >
            {comparableDocs.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
          </select>
        </div>
        <div className="w-12 h-12 rounded-2xl border-2 border-slate-200 bg-white flex items-center justify-center text-slate-400 shrink-0 self-end shadow-sm">
          <ArrowRightLeft size={16} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-md bg-amber-500 flex items-center justify-center text-[9px] font-black text-white shadow-sm">B</span>
            <label className="text-[10px] font-black uppercase tracking-wider text-amber-600">Document B</label>
          </div>
          <select
            value={docB?.id ?? ''}
            onChange={(e) => setBId(e.target.value)}
            className="w-full bg-white border-2 border-amber-100 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all shadow-sm"
          >
            {comparableDocs.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
          </select>
        </div>
      </div>

      {isSamePair && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-2.5 text-xs font-bold text-amber-700">
          <span className="text-base">⚠️</span> Select two different documents for a meaningful comparison.
        </div>
      )}

      {m && (
        <>
          {/* Semantic similarity — hero card */}
          {(() => {
            const pct = m.semanticEst;
            const levelLabel =
              pct >= 70 ? 'Strong content match' : pct >= 30 ? 'Partial overlap' : 'Different topic';
            const r = 28;
            const circ = 2 * Math.PI * r;
            const dash = (pct / 100) * circ;
            return (
              <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-amber-600 p-5 text-white shadow-lg">
                <div className="flex items-center gap-5">
                  <div className="shrink-0 relative w-16 h-16 flex items-center justify-center">
                    <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
                      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="6" />
                      <circle
                        cx="32" cy="32" r={r} fill="none"
                        stroke="rgba(255,255,255,0.85)" strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={`${dash} ${circ}`}
                        style={{ transition: 'stroke-dasharray 0.7s ease' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-base font-black leading-none tabular-nums">{pct}%</span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <p className="text-sm font-black tracking-tight">Semantic Similarity</p>
                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full border border-white/30 bg-white/15 text-white shrink-0">{levelLabel}</span>
                    </div>
                    <p className="text-[9px] font-medium opacity-60 leading-relaxed">Taxonomy · structural cosine · volume proximity composite estimate</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 4 mini cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
            { label: 'Struct. similarity', value: `${Math.round(m.structSimilarity * 100)}%`, sub: 'cosine · volume vector', color: 'indigo', isNA: false },
            { label: 'Volume proximity',   value: `${Math.round(m.volumeProximity * 100)}%`,  sub: 'normalized metric distance',  color: 'indigo', isNA: false },
            { label: 'A freshness',        value: `${Math.round(m.aFreshness * 100)}%`,       sub: m.aUpdAge != null ? `updated ${m.aUpdAge}d ago` : '—', color: 'blue',   isNA: !docA.updated_at },
            { label: 'B freshness',        value: `${Math.round(m.bFreshness * 100)}%`,       sub: m.bUpdAge != null ? `updated ${m.bUpdAge}d ago` : '—', color: 'amber', isNA: !docB.updated_at },
            ].map(({ label, value, sub, color, isNA }) => {
              const cfg = {
                indigo: { card: 'bg-indigo-50/60 border-indigo-200', val: 'text-indigo-800', sub: 'text-indigo-400' },
                blue:   { card: 'bg-blue-50 border-blue-200',        val: 'text-blue-800',   sub: 'text-blue-400' },
                violet: { card: 'bg-amber-50 border-amber-200',    val: 'text-amber-800', sub: 'text-amber-400' },
              }[color];
              return (
                <div key={label} className={`rounded-2xl border-2 ${cfg.card} p-4 text-center shadow-sm`}>
                  {isNA ? (
                    <p className="text-sm italic text-slate-400 font-medium leading-tight py-0.5">No data<br />available</p>
                  ) : (
                    <p className={`text-3xl font-black tabular-nums ${cfg.val}`}>{value}</p>
                  )}
                  <p className="text-[9px] font-black uppercase tracking-widest mt-2 text-slate-500">{label}</p>
                  <p className={`text-[9px] mt-0.5 ${cfg.sub}`}>{isNA ? '—' : sub}</p>
                </div>
              );
            })}
          </div>

          {/* AI Content Summary */}
          <div className="rounded-2xl border border-indigo-200 overflow-hidden shadow-sm">
            <div className="flex items-center gap-2.5 px-5 py-3.5 bg-gradient-to-r from-indigo-600 to-amber-600">
              <div className="w-5 h-5 rounded-md bg-white/20 flex items-center justify-center shrink-0">
                <Sparkles size={11} className="text-white" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/90">AI Content Summary</p>
              {aiSummaryLoading && (
                <Loader2 size={12} className="ml-auto animate-spin text-white/70" />
              )}
            </div>
            <div className="px-5 py-4 bg-gradient-to-br from-indigo-50/50 via-white to-amber-50/30 min-h-[64px] flex items-center">
              {aiSummaryLoading ? (
                <p className="text-xs italic text-slate-400">Generating AI summary…</p>
              ) : aiSummary ? (
                <p className={`text-xs font-medium leading-relaxed ${
                  aiSummary.status === 'error' ? 'text-red-500 italic' : 'text-slate-700'
                }`}>
                  {aiSummary.summary}
                </p>
              ) : (
                <p className="text-xs italic text-slate-400">Select two different documents to generate a summary.</p>
              )}
            </div>
          </div>

          {/* Metric Tabs */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            {/* Tab bar */}
            <div className="flex border-b border-slate-100 bg-slate-50/70 overflow-x-auto">
              {METRIC_TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMetricTab(id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all border-b-2 shrink-0 ${
                    metricTab === id
                      ? 'text-indigo-700 border-indigo-500 bg-white'
                      : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-white/60'
                  }`}
                >
                  <Icon size={11} />
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="px-5 divide-y divide-slate-50">

              {/* Volumen */}
              {metricTab === 'volume' && [
                { label: 'Character count',    hint: 'Raw text length with spaces — file size proxy',                                                                              aVal: docA.char_count,     bVal: docB.char_count },
                { label: 'Word count',         hint: 'Whitespace-separated token count; readability indicator',                                                                   aVal: docA.word_count,     bVal: docB.word_count },
                { label: 'Token estimate',   hint: 'Tokens to load into an LLM (≈ words × 1.3); direct context-window cost',                                            aVal: docA.token_estimate, bVal: docB.token_estimate },
                { label: 'Chunk count', hint: 'How many vector segments the processor produced — more chunks = more searchable but costlier indexing',                                 aVal: docA.chunk_count,    bVal: docB.chunk_count },
                { label: 'Page count',       hint: 'Pages extracted from source; null for non-PDF / non-structured files',                                                                     aVal: docA.page_count,     bVal: docB.page_count },
                { label: 'File size',       hint: 'Original uploaded file size — e.g. image-heavy PDF has large size but low text density',                                      aVal: docA.size_bytes,     bVal: docB.size_bytes, format: fmtBytes },
              ].map(({ label, hint, aVal, bVal, format }) => (
                <CompareRow key={label} label={label} hint={hint} aVal={aVal} bVal={bVal} format={format} />
              ))}

              {/* Density */}
              {metricTab === 'density' && [
                { label: 'Chars / word',                        hint: 'Average word length; ~5–6 for normal prose, >8 for technical/foreign words',                                   aVal: parseFloat(m.aCPW.toFixed(2)),        bVal: parseFloat(m.bCPW.toFixed(2)) },
                { label: 'Tokens / word — expansion ratio',   hint: 'How much the text “bloats” during tokenization; >1.5 = complex/foreign words or code',                         aVal: parseFloat(m.aTPW.toFixed(2)),        bVal: parseFloat(m.bTPW.toFixed(2)) },
                { label: 'Words / token — verbosity',         hint: 'Inverse ratio; higher = more readable, more natural running text',                                             aVal: parseFloat(m.aVerbosity.toFixed(2)),  bVal: parseFloat(m.bVerbosity.toFixed(2)) },
                { label: 'Chars / chunk',                     hint: 'Average character length per chunk; indicates chunking granularity',                                          aVal: Math.round(m.aCPC),                   bVal: Math.round(m.bCPC) },
                { label: 'Words / chunk',                          hint: 'Average word count per chunk; 100–300 words is typical for RAG configs',                                               aVal: Math.round(m.aWPC),                   bVal: Math.round(m.bWPC) },
                { label: 'Tokens / chunk',                        hint: 'Most important chunking metric; ideal: 256–512 tokens/chunk for embedding models',                        aVal: Math.round(m.aTPC),                   bVal: Math.round(m.bTPC) },
                { label: 'Bytes / char — encoding efficiency', hint: 'UTF-8: ~1.0 for ASCII, ~2–3 for accented/CJK chars; indicates charset characteristics',                         aVal: parseFloat(m.aBPC.toFixed(2)),        bVal: parseFloat(m.bBPC.toFixed(2)) },
                ...(m.aTPP != null || m.bTPP != null ? [{ label: 'Tokens / page',   hint: 'Content richness per page; useful for PDF quality checks',   aVal: Math.round(m.aTPP ?? 0), bVal: Math.round(m.bTPP ?? 0) }] : []),
                ...(m.aWPP != null || m.bWPP != null ? [{ label: 'Words / page',     hint: 'Readability indicator; magazine ~300, academic ~600 words/page is typical', aVal: Math.round(m.aWPP ?? 0), bVal: Math.round(m.bWPP ?? 0) }] : []),
                ...(m.aCPP != null || m.bCPP != null ? [{ label: 'Chunks / page',   hint: 'Processing granularity; >3 chunks/page = very fine-grained segments', aVal: parseFloat((m.aCPP ?? 0).toFixed(1)), bVal: parseFloat((m.bCPP ?? 0).toFixed(1)) }] : []),
              ].map(({ label, hint, aVal, bVal }) => (
                <CompareRow key={label} label={label} hint={hint} aVal={aVal} bVal={bVal} />
              ))}

              {/* Chunking */}
              {metricTab === 'chunking' && <>
                <ScoreRow label="Chunk efficiency"   hint="How close to the ideal 512 tokens/chunk; 100% = perfectly sized segments"                scoreA={m.aChunkEff}        scoreB={m.bChunkEff} />
                <ScoreRow label="Content richness"  hint="Relative token volume compared to the pair; always 100% for the larger document"                           scoreA={m.aRichness}        scoreB={m.bRichness} />
                <ScoreRow label="Text complexity"   hint="Based on token/word ratio; peak (~100%) = 1.4–1.6 t/w, indicating complex but readable prose"     scoreA={m.aTokenComplexity} scoreB={m.bTokenComplexity} />
                <ScoreRow label="Information density"   hint="Composite: token volume (33%) + chunk count (33%) + chunk saturation (33%)"                           scoreA={m.aInfoDensity}     scoreB={m.bInfoDensity} />
                {(m.aChunkSize != null || m.bChunkSize != null) && (
                  <CompareRow label="Chunk size config (tokens)" hint="Max chunk size in tokens set during processing" aVal={m.aChunkSize ?? 0} bVal={m.bChunkSize ?? 0} />
                )}
                {(m.aOverlap != null || m.bOverlap != null) && (
                  <CompareRow label="Chunk overlap config (tokens)" hint="Overlap between adjacent chunks; helps preserve context at boundaries" aVal={m.aOverlap ?? 0} bVal={m.bOverlap ?? 0} />
                )}
              </>}

              {/* Temporal */}
              {metricTab === 'temporal' && (() => {
                const DocCard = ({ doc, age, updAge, freshness, side }) => {
                  const isA = side === 'a';
                  const accent = isA ? { bg: 'bg-blue-50', border: 'border-blue-200', chip: 'bg-blue-500', label: 'text-blue-500', val: 'text-blue-800', bar: 'from-blue-400 to-indigo-400', letter: 'A' }
                                     : { bg: 'bg-amber-50', border: 'border-amber-200', chip: 'bg-amber-500', label: 'text-amber-500', val: 'text-amber-800', bar: 'from-amber-400 to-yellow-400', letter: 'B' };
                  const freshPct = Math.round(freshness * 100);
                  const rows = [
                    { lbl: 'Created', val: fmtAge(doc.created_at) },
                    { lbl: 'Updated',  val: fmtAge(doc.updated_at) },
                    { lbl: 'Age (days)',  val: age != null ? fmt(age) : null },
                    { lbl: 'Last updated', val: updAge != null ? `${updAge} d ago` : null },
                  ];
                  return (
                    <div className={`rounded-xl border ${accent.border} ${accent.bg} overflow-hidden`}>
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-current/10">
                        <span className={`w-5 h-5 rounded-md ${accent.chip} flex items-center justify-center text-[9px] font-black text-white shrink-0`}>{accent.letter}</span>
                        <p className="text-[10px] font-black text-slate-700 truncate min-w-0">{doc.name}</p>
                      </div>
                      <div className="px-3 py-2 space-y-2">
                        {rows.map(({ lbl, val }) => (
                          <div key={lbl} className="flex items-center justify-between gap-2">
                            <span className={`text-[8px] font-black uppercase tracking-widest ${accent.label} shrink-0`}>{lbl}</span>
                            {val
                              ? <span className={`text-[10px] font-black ${accent.val} text-right`}>{val}</span>
                              : <span className="text-[10px] italic text-slate-400">N/A</span>
                            }
                          </div>
                        ))}
                        <div className="pt-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[8px] font-black uppercase tracking-widest ${accent.label}`}>Freshness</span>
                            <span className={`text-[11px] font-black tabular-nums ${accent.val}`}>{freshPct}%</span>
                          </div>
                          <div className="h-1.5 bg-white/70 rounded-full overflow-hidden border border-current/10">
                            <div className={`h-full rounded-full bg-gradient-to-r ${accent.bar} transition-all duration-700`} style={{ width: `${freshPct}%` }} />
                          </div>
                          <p className="text-[8px] text-slate-400 mt-1">2-year horizon; 0% = not updated for ≥2 years</p>
                        </div>
                      </div>
                    </div>
                  );
                };

                return (
                  <div className="py-4 space-y-5">
                    {/* Side-by-side document cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <DocCard doc={docA} age={m.aAge} updAge={m.aUpdAge} freshness={m.aFreshness} side="a" />
                      <DocCard doc={docB} age={m.bAge} updAge={m.bUpdAge} freshness={m.bFreshness} side="b" />
                    </div>

                    {/* Freshness comparison row */}
                    <ScoreRow
                      label="Freshness comparison"
                      hint="Which document is more recent — normalized over a 2-year time horizon"
                      scoreA={m.aFreshness}
                      scoreB={m.bFreshness}
                    />

                    {/* Taxonomy divider */}
                    <div className="flex items-center gap-3 pt-1">
                      <div className="h-px flex-1 bg-slate-100" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Taxonomy & classification</span>
                      <div className="h-px flex-1 bg-slate-100" />
                    </div>

                    {/* Taxonomy rows */}
                    <div className="space-y-0">
                      <StatPair label="Category"   aVal={docA.category || 'None'} bVal={docB.category || 'None'} />
                      <StatPair label="Subcategory" aVal={docA.subcategory || '—'}  bVal={docB.subcategory || '—'} />
                      <StatPair label="File type"   aVal={docA.content_type || '—'} bVal={docB.content_type || '—'} />
                      <StatPair label="Flow ID"     aVal={docA.flow_id ? docA.flow_id.slice(0, 8) + '…' : '—'} bVal={docB.flow_id ? docB.flow_id.slice(0, 8) + '…' : '—'} />
                    </div>

                    {/* Match badges */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full border ${m.catMatch ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>
                        {m.catMatch ? '✓ Same category' : '✗ Different category'}
                      </span>
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full border ${m.subCatMatch ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
                        {m.subCatMatch ? '✓ Same subcategory' : '✗ Different subcategory'}
                      </span>
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full border ${docA.content_type === docB.content_type ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
                        {docA.content_type === docB.content_type ? '✓ Same file type' : '✗ Different file type'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Profil */}
              {metricTab === 'profile' && [
                { label: 'Content volume',        hint: 'Relative token count; the larger document always gets 100%',                                                        aScore: m.aRichness,        bScore: m.bRichness },
                { label: 'Chunk efficiency',       hint: 'Approximation to the ideal 512 tokens/chunk',                                                                  aScore: m.aChunkEff,        bScore: m.bChunkEff },
                { label: 'Text complexity',       hint: 'Token expansion; highest for complex but readable prose',                                            aScore: m.aTokenComplexity, bScore: m.bTokenComplexity },
                { label: 'Information density',       hint: 'Composite: volume + chunk count + chunk saturation',                                                         aScore: m.aInfoDensity,     bScore: m.bInfoDensity },
                { label: 'Freshness',              hint: 'How recently modified within a 2-year horizon; 0% = not updated for >=2 years',                                  aScore: m.aFreshness,       bScore: m.bFreshness },
                { label: 'Taxonomy match',      hint: 'Category + subcategory comparison; both docs get the same score — this is a "shared" dimension',                        aScore: m.taxonomyScore,    bScore: m.taxonomyScore },
                { label: 'Structural similarity', hint: 'Cosine in [char, word, token, chunk] vector space; also a shared dimension',                         aScore: m.structSimilarity, bScore: m.structSimilarity },
              ].map(({ label, hint, aScore, bScore }) => (
                <ScoreRow key={label} label={label} hint={hint} scoreA={aScore} scoreB={bScore} />
              ))}

            </div>
          </div>

          {/* Content hash */}
          {(docA.content_hash || docB.content_hash) && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">Content identification — Content hash</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <span className="w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center text-[9px] font-black text-white shrink-0">A</span>
                  <code className="text-[10px] font-mono text-blue-700 break-all leading-relaxed">{docA.content_hash || '—'}</code>
                </div>
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <span className="w-6 h-6 rounded-md bg-amber-500 flex items-center justify-center text-[9px] font-black text-white shrink-0">B</span>
                  <code className="text-[10px] font-mono text-amber-700 break-all leading-relaxed">{docB.content_hash || '—'}</code>
                </div>
                {docA.content_hash && docB.content_hash && (
                  <div className={`text-xs font-black px-4 py-2.5 rounded-xl border ${docA.content_hash === docB.content_hash ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                    {docA.content_hash === docB.content_hash ? '✓ Identical content — duplicate detected' : '✗ Different content'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Insight footer */}
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-slate-50 to-indigo-50/30 p-5 flex items-start gap-3 shadow-sm">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
              <TrendingUp size={15} className="text-indigo-600" />
            </div>
            <div className="text-[11px] font-medium text-slate-600 leading-relaxed space-y-2 min-w-0">
              <p>
                <strong className="text-slate-800">Structural similarity:</strong> {Math.round(m.structSimilarity * 100)}% — cosine similarity across four volume dimensions (chars, words, tokens, chunks).{' '}
                {m.catMatch ? 'Same category — thematically related documents.' : 'Different category — belong to different thematic domains.'}
              </p>
              <p>
                <strong className="text-slate-800">Tokens/chunk:</strong> A = {Math.round(m.aTPC)}, B = {Math.round(m.bTPC)} (ideal: 512).{' '}
                {Math.abs(m.aTPC - m.bTPC) > 150 ? 'Significant difference in chunking granularity.' : 'Similar chunking granularity.'}
              </p>
              <p>
                <strong className="text-slate-800">Verbosity (words/token):</strong> A = {m.aVerbosity.toFixed(2)}, B = {m.bVerbosity.toFixed(2)} —{' '}
                {m.aVerbosity > 0.75 ? 'A is mostly natural-language text.' : 'A is technical/code-heavy text.'}{' '}
                {m.bVerbosity > 0.75 ? 'B is mostly natural-language text.' : 'B is technical/code-heavy text.'}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DocumentComparisonView;
