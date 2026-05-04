/**
 * RetrieverSettingsPanel — context-aware top-k retriever inspector.
 *
 * Wakes up only when BOTH of these are wired in upstream:
 *   1. A query source: `input-question` / `process-query-rewriter` / `brain-hyde-gen`
 *      (anything that emits `text` / `query`).
 *   2. A vector index: `storage-vector` (preferred) or `process-embedding`
 *      (in-memory fallback).
 *
 * The panel inherits the embedding profile (model + dimension + metric) and
 * the vector store identity (provider + index + namespace) from upstream,
 * locks them as read-only, and only then exposes the strategy controls.
 *
 * Strategy-driven UI: similarity / similarity_with_threshold / mmr / hybrid.
 * Each strategy reveals only its relevant knobs to keep the inspector tidy.
 */

import { useEffect, useMemo } from 'react';
import {
  CircleHelp,
  Database,
  Filter,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────
// Strategy catalog (frontend-only — display labels + which knobs to render).
// ─────────────────────────────────────────────────────────────────────────
const STRATEGIES = [
  {
    id: 'similarity',
    label: 'Similarity',
    badge: 'Default',
    description: 'Pure top-k vector similarity. Returns the K closest chunks.',
    knobs: ['topK'],
  },
  {
    id: 'similarity_with_threshold',
    label: 'Similarity + threshold',
    badge: 'Strict',
    description: 'Top-k filtered by a minimum similarity score. Drops weak matches.',
    knobs: ['topK', 'similarityThreshold'],
  },
  {
    id: 'mmr',
    label: 'MMR',
    badge: 'Diversity',
    description: 'Maximal Marginal Relevance: trade off relevance against diversity.',
    knobs: ['topK', 'mmrLambda', 'mmrFetchK'],
  },
  {
    id: 'hybrid',
    label: 'Hybrid (sparse + dense)',
    badge: 'Power-user',
    description: 'Blend dense vectors with BM25-style sparse signals.',
    knobs: ['topK', 'hybridAlpha'],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// UI primitives
// ─────────────────────────────────────────────────────────────────────────
const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">{title}</label>
    {help && (
      <button type="button" title={help} className="shrink-0 text-slate-400 hover:text-slate-700">
        <CircleHelp size={11} />
      </button>
    )}
  </div>
);

const SectionHeading = ({ children, color = 'text-slate-600' }) => (
  <h4 className={`text-[10px] font-black uppercase tracking-wider ${color}`}>{children}</h4>
);

const Toggle = ({ value, onChange, label, help }) => (
  <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
    <div className="flex min-w-0 items-center gap-1">
      <p className="truncate text-[11px] font-bold text-slate-700">{label}</p>
      {help && (
        <button type="button" title={help} className="shrink-0 text-slate-400 hover:text-slate-700">
          <CircleHelp size={12} />
        </button>
      )}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative inline-block h-5 w-9 shrink-0 overflow-hidden rounded-full transition-colors ${
        value ? 'bg-amber-600' : 'bg-slate-300'
      }`}
    >
      <span
        className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-[left] duration-200"
        style={{ left: value ? '18px' : '2px' }}
      />
    </button>
  </div>
);

const Slider = ({ value, onChange, min = 0, max = 1, step = 0.01, label, help }) => (
  <div>
    <div className="mb-1 flex items-center justify-between">
      <FieldLabel title={label} help={help} />
      <span className="font-mono text-[10px] font-bold text-slate-700">{Number(value).toFixed(2)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full accent-amber-600"
    />
  </div>
);

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────
export default function RetrieverSettingsPanel({
  value = {},
  onChange,
  embeddingProfile,
  vectorStore,
  hasQuerySource,
}) {
  const hasIndex = Boolean(vectorStore?.provider || embeddingProfile?.modelId);
  const isAwake = hasIndex && hasQuerySource;

  const strategy = useMemo(
    () => STRATEGIES.find((entry) => entry.id === value.strategy) || STRATEGIES[0],
    [value.strategy],
  );

  const setField = (field, fieldValue) => onChange?.(field, fieldValue);

  // Persist a snapshot of upstream identity so the canvas runtime can rebuild
  // the trace without walking the graph again.
  useEffect(() => {
    if (!embeddingProfile && !vectorStore) return;

    const nextProfile = embeddingProfile
      ? {
          modelId: embeddingProfile.modelId,
          provider: embeddingProfile.provider,
          nativeDimension: embeddingProfile.nativeDimension,
          metric: embeddingProfile.metric,
        }
      : null;
    const nextStore = vectorStore
      ? {
          provider: vectorStore.provider,
          indexName: vectorStore.indexName,
          namespace: vectorStore.namespace,
          collection: vectorStore.collection,
          metric: vectorStore.metric,
        }
      : null;

    if (JSON.stringify(value.embeddingProfile) !== JSON.stringify(nextProfile)) {
      setField('embeddingProfile', nextProfile);
    }
    if (JSON.stringify(value.vectorStore) !== JSON.stringify(nextStore)) {
      setField('vectorStore', nextStore);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embeddingProfile?.modelId, vectorStore?.provider, vectorStore?.indexName]);

  // ─── SLEEPING STATE ─────────────────────────────────────────────────────
  if (!isAwake) {
    const missing = [];
    if (!hasQuerySource) missing.push('query (Question / Query Rewriter / HyDE)');
    if (!hasIndex) missing.push('vector index (Vector DB or Embedding)');

    return (
      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-sm">
            <Lock size={16} className="text-slate-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Retriever · idle / sleeping
            </p>
            <p className="text-xs font-semibold text-slate-700">
              {missing.length === 2
                ? 'Connect a query source AND a vector index.'
                : `Missing: ${missing[0]}.`}
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <div
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] ${
              hasQuerySource ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <Search size={12} />
            <span className="font-bold">Query source</span>
            <span className="ml-auto font-mono text-[10px]">
              {hasQuerySource ? '✓ connected' : '— missing'}
            </span>
          </div>
          <div
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] ${
              hasIndex ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <Database size={12} />
            <span className="font-bold">Vector index</span>
            <span className="ml-auto font-mono text-[10px]">
              {hasIndex ? '✓ connected' : '— missing'}
            </span>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
          The Retriever inherits the vector index's dimension and metric from
          the upstream Vector DB, and takes the question from the query source.
          Both are required to run.
        </p>
      </div>
    );
  }

  // ─── AWAKE STATE ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* ── Upstream handshake card ─────────────────────────────────────── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-amber-700" />
          <p className="text-[11px] font-black uppercase tracking-wider text-amber-800">
            Upstream · auto-synced
          </p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
          {vectorStore?.provider && (
            <div className="rounded-lg bg-white/70 px-2 py-1.5">
              <p className="text-[9px] font-black uppercase tracking-wider text-amber-600">Vector DB</p>
              <p className="truncate font-mono text-[11px] font-bold text-slate-800">
                {vectorStore.provider}
                {vectorStore.indexName ? ` · ${vectorStore.indexName}` : ''}
              </p>
            </div>
          )}
          {embeddingProfile?.modelId && (
            <div className="rounded-lg bg-white/70 px-2 py-1.5">
              <p className="text-[9px] font-black uppercase tracking-wider text-amber-600">Embedding</p>
              <p className="truncate font-mono text-[11px] font-bold text-slate-800" title={embeddingProfile.modelId}>
                {embeddingProfile.modelId}
              </p>
            </div>
          )}
          {embeddingProfile?.nativeDimension && (
            <div className="rounded-lg bg-white/70 px-2 py-1.5">
              <p className="text-[9px] font-black uppercase tracking-wider text-amber-600">Dimension</p>
              <p className="font-mono text-[11px] font-bold text-slate-800">
                {embeddingProfile.nativeDimension}
              </p>
            </div>
          )}
          {(vectorStore?.metric || embeddingProfile?.metric) && (
            <div className="rounded-lg bg-white/70 px-2 py-1.5">
              <p className="text-[9px] font-black uppercase tracking-wider text-amber-600">Metric</p>
              <p className="font-mono text-[11px] font-bold text-slate-800">
                {vectorStore?.metric || embeddingProfile?.metric}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Strategy picker ─────────────────────────────────────────────── */}
      <div>
        <SectionHeading color="text-amber-700">Search strategy</SectionHeading>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {STRATEGIES.map((entry) => {
            const selected = entry.id === strategy.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setField('strategy', entry.id)}
                className={`flex flex-col items-start gap-0.5 rounded-lg border px-2 py-1.5 text-left transition ${
                  selected
                    ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-300'
                    : 'border-slate-200 bg-white hover:border-amber-300'
                }`}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="text-[11px] font-bold text-slate-800">{entry.label}</span>
                  <Search size={11} className="text-slate-400" />
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600">
                  {entry.badge}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">{strategy.description}</p>
      </div>

      {/* ── Strategy-specific knobs ─────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <SectionHeading>Strategy parameters</SectionHeading>

        {strategy.knobs.includes('topK') && (
          <div>
            <FieldLabel title="Top K" help="How many chunks to return after ranking." />
            <input
              type="number"
              min={1}
              max={100}
              value={value.topK ?? 8}
              onChange={(event) => setField('topK', Number(event.target.value))}
              className={inputClass}
            />
          </div>
        )}

        {strategy.knobs.includes('similarityThreshold') && (
          <Slider
            value={value.similarityThreshold ?? 0.72}
            onChange={(next) => setField('similarityThreshold', next)}
            label="Similarity threshold"
            help="Minimum similarity score required to include a chunk."
          />
        )}

        {strategy.knobs.includes('mmrLambda') && (
          <Slider
            value={value.mmrLambda ?? 0.5}
            onChange={(next) => setField('mmrLambda', next)}
            label="MMR λ (relevance ↔ diversity)"
            help="1.0 = pure relevance, 0.0 = max diversity."
          />
        )}

        {strategy.knobs.includes('mmrFetchK') && (
          <div>
            <FieldLabel
              title="MMR candidate pool"
              help="How many top-similar candidates to consider before MMR re-ranking."
            />
            <input
              type="number"
              min={Math.max(value.topK ?? 8, 1)}
              max={500}
              value={value.mmrFetchK ?? Math.max(24, (value.topK ?? 8) * 3)}
              onChange={(event) => setField('mmrFetchK', Number(event.target.value))}
              className={inputClass}
            />
          </div>
        )}

        {strategy.knobs.includes('hybridAlpha') && (
          <Slider
            value={value.hybridAlpha ?? 0.5}
            onChange={(next) => setField('hybridAlpha', next)}
            label="Hybrid α (dense ↔ sparse)"
            help="1.0 = pure vector, 0.0 = pure BM25."
          />
        )}

        {strategy.id === 'hybrid' && vectorStore && !vectorStore.hybridSearch && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] leading-relaxed text-rose-800">
            ⚠️ Hybrid search is not enabled on the upstream Vector DB.
            Enable it in the Vector DB panel, otherwise it will fall back
            to dense-only mode at runtime.
          </div>
        )}
      </div>

      {/* ── Output shaping + filters ────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <SectionHeading>
          <span className="inline-flex items-center gap-1">
            <Filter size={11} /> Output shaping
          </span>
        </SectionHeading>

        <Toggle
          value={Boolean(value.includeScores ?? true)}
          onChange={(next) => setField('includeScores', next)}
          label="Include relevance scores"
          help="Attach the similarity score to each returned chunk."
        />

        <Toggle
          value={Boolean(value.includeMetadata ?? true)}
          onChange={(next) => setField('includeMetadata', next)}
          label="Include chunk metadata"
          help="Pass through source, title, page, etc. — useful for citations."
        />

        <div>
          <FieldLabel
            title="Metadata filter"
            help="Comma-separated key=value pairs. Only chunks whose metadata match are considered."
          />
          <input
            type="text"
            value={value.metadataFilter || ''}
            onChange={(event) => setField('metadataFilter', event.target.value)}
            className={`${inputClass} font-mono`}
            placeholder="source=docs,lang=en"
            spellCheck={false}
          />
        </div>
      </div>

      {/* ── Footer hint ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-amber-500" />
        Allowed inputs: <span className="font-mono">chunks</span> + <span className="font-mono">text</span>
      </div>
    </div>
  );
}
