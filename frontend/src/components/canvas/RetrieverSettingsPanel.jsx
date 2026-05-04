/**
 * RetrieverSettingsPanel — context-aware top-k retriever inspector.
 *
 * Visual language: same modern atoms as the LLM panel
 * (hero card, upstream contract pills, quick-preset grid, sectioned cards,
 * ToggleChip pills, range sliders, validation strip, payload preview),
 * CYAN palette to mirror the process-retriever node colour
 * (`bg-cyan-50 border-cyan-200 text-cyan-700`).
 *
 * Wakes only when BOTH are wired upstream:
 *   1. A query source: `input-question` / `process-query-rewriter` / `brain-hyde-gen`
 *      (anything that emits `text` / `query`).
 *   2. A vector index: `storage-vector` (preferred) or `process-embedding`
 *      (in-memory fallback).
 *
 * BACKEND CONTRACT (UNCHANGED — canvasConfig + runtime depend on it)
 *   { strategy, topK, similarityThreshold, mmrLambda, mmrFetchK, hybridAlpha,
 *     includeMetadata, includeScores, metadataFilter,
 *     embeddingProfile, vectorStore }
 */

import { useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Compass,
  Database,
  Filter,
  GitBranch,
  Layers,
  Lock,
  Search,
  ShieldCheck,
  Sliders,
  Target,
  Wand2,
  Zap,
} from 'lucide-react';

// ─── Strategy catalog ────────────────────────────────────────────────────
const STRATEGIES = [
  {
    id: 'similarity',
    label: 'Similarity',
    badge: 'Default',
    description: 'Pure top-k vector similarity. Returns the K closest chunks.',
    Icon: Search,
    knobs: ['topK'],
  },
  {
    id: 'similarity_with_threshold',
    label: 'Similarity + threshold',
    badge: 'Strict',
    description: 'Top-k filtered by a minimum similarity score. Drops weak matches.',
    Icon: Target,
    knobs: ['topK', 'similarityThreshold'],
  },
  {
    id: 'mmr',
    label: 'MMR',
    badge: 'Diversity',
    description: 'Maximal Marginal Relevance — trade off relevance against diversity.',
    Icon: Compass,
    knobs: ['topK', 'mmrLambda', 'mmrFetchK'],
  },
  {
    id: 'hybrid',
    label: 'Hybrid (sparse + dense)',
    badge: 'Power-user',
    description: 'Blend dense vectors with BM25-style sparse signals.',
    Icon: GitBranch,
    knobs: ['topK', 'hybridAlpha'],
  },
];

const RETRIEVER_PRESETS = [
  {
    id: 'precise',
    label: 'Precise',
    description: 'Strict threshold, tight K.',
    icon: Target,
    overrides: {
      strategy: 'similarity_with_threshold',
      topK: 5, similarityThreshold: 0.78,
      includeScores: true, includeMetadata: true,
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Default top-k similarity.',
    icon: Compass,
    overrides: {
      strategy: 'similarity',
      topK: 8,
      includeScores: true, includeMetadata: true,
    },
  },
  {
    id: 'diverse',
    label: 'Diverse',
    description: 'MMR for varied chunks.',
    icon: Wand2,
    overrides: {
      strategy: 'mmr',
      topK: 8, mmrLambda: 0.45, mmrFetchK: 32,
      includeScores: true, includeMetadata: true,
    },
  },
  {
    id: 'hybrid',
    label: 'Hybrid',
    description: 'Dense + sparse blend.',
    icon: Sliders,
    overrides: {
      strategy: 'hybrid',
      topK: 10, hybridAlpha: 0.6,
      includeScores: true, includeMetadata: true,
    },
  },
];

// ─── Shared atoms (cyan palette) ─────────────────────────────────────────
const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {title}
    </label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-cyan-500">
        <CircleHelp size={11} />
      </span>
    )}
  </div>
);

const ToggleChip = ({ checked, onChange, label, help }) => (
  <button
    type="button"
    title={help}
    aria-pressed={Boolean(checked)}
    onClick={() => onChange?.(!checked)}
    className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
      checked
        ? 'border-cyan-300 bg-cyan-50 text-cyan-800 shadow-sm shadow-cyan-200/40'
        : 'border-slate-200 bg-white text-slate-500 hover:border-cyan-200 hover:text-cyan-700'
    }`}
  >
    <span
      aria-hidden
      className={`inline-block h-2 w-2 rounded-full transition ${
        checked ? 'bg-cyan-500' : 'bg-slate-300 group-hover:bg-cyan-300'
      }`}
    />
    {label}
  </button>
);

function UpstreamPill({ label, ok, hint, Icon }) {
  return (
    <div
      className={`rounded-lg border px-2 py-1.5 text-[10px] ${
        ok
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-slate-200 bg-white text-slate-500'
      }`}
    >
      <div className="flex items-center gap-1">
        <Icon size={10} />
        <p className="font-bold">{label}</p>
      </div>
      <p className="mt-0.5 truncate font-mono text-[9px]">{hint}</p>
    </div>
  );
}

function SliderRow({ label, help, value, min, max, step, onChange, format }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {label}
          </span>
          {help && (
            <span title={help} className="cursor-help text-slate-300 hover:text-cyan-500">
              <CircleHelp size={11} />
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] font-bold text-cyan-700">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange?.(Number(event.target.value))}
        className="w-full accent-cyan-400"
      />
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────
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

  const setField = (field, fieldValue) => {
    onChange?.(field, fieldValue);
    if (value.preset && value.preset !== 'custom' && field !== 'preset') {
      onChange?.('preset', 'custom');
    }
  };

  const applyPreset = (presetId) => {
    const preset = RETRIEVER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onChange?.('preset', preset.id);
    Object.entries(preset.overrides).forEach(([key, val]) => onChange?.(key, val));
  };

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
      onChange?.('embeddingProfile', nextProfile);
    }
    if (JSON.stringify(value.vectorStore) !== JSON.stringify(nextStore)) {
      onChange?.('vectorStore', nextStore);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embeddingProfile?.modelId, vectorStore?.provider, vectorStore?.indexName]);

  // ─── Sleeping state ────────────────────────────────────────────────────
  if (!isAwake) {
    const missing = [];
    if (!hasQuerySource) missing.push('query (Question / Query Rewriter / HyDE)');
    if (!hasIndex) missing.push('vector index (Vector DB or Embedding)');

    return (
      <div className="space-y-3">
        <div className="rounded-2xl border-2 border-dashed border-cyan-300 bg-cyan-50/40 p-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-cyan-200">
              <Lock size={18} className="text-cyan-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">
                Retriever · idle
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
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                hasQuerySource
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              <Search size={12} />
              <span className="font-bold">Query source</span>
              <span className="ml-auto font-mono text-[10px]">
                {hasQuerySource ? '✓ connected' : '— missing'}
              </span>
            </div>
            <div
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                hasIndex
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-500'
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
      </div>
    );
  }

  // ─── Validation ────────────────────────────────────────────────────────
  const warnings = [];
  if (strategy.id === 'hybrid' && vectorStore && !vectorStore.hybridSearch) {
    warnings.push('Hybrid search is not enabled on the upstream Vector DB — runtime will fall back to dense-only.');
  }
  if (strategy.id === 'mmr' && (value.mmrFetchK ?? 24) <= (value.topK ?? 8)) {
    warnings.push('MMR candidate pool should be larger than Top K (otherwise diversity has nothing to pick from).');
  }
  if ((value.topK ?? 8) > 50) {
    warnings.push('Very large Top K — downstream LLM context may overflow.');
  }
  if (
    embeddingProfile?.metric &&
    vectorStore?.metric &&
    embeddingProfile.metric !== vectorStore.metric
  ) {
    warnings.push(`Metric mismatch: embedding=${embeddingProfile.metric}, store=${vectorStore.metric}.`);
  }

  // ─── Payload preview ───────────────────────────────────────────────────
  const payload = {
    step_type: 'retriever',
    strategy: strategy.id,
    metadata: {
      top_k: Number(value.topK ?? 8),
      ...(strategy.knobs.includes('similarityThreshold') && {
        similarity_threshold: Number(value.similarityThreshold ?? 0.72),
      }),
      ...(strategy.knobs.includes('mmrLambda') && {
        mmr_lambda: Number(value.mmrLambda ?? 0.5),
        mmr_fetch_k: Number(value.mmrFetchK ?? 24),
      }),
      ...(strategy.knobs.includes('hybridAlpha') && {
        hybrid_alpha: Number(value.hybridAlpha ?? 0.5),
      }),
      include_scores: Boolean(value.includeScores ?? true),
      include_metadata: Boolean(value.includeMetadata ?? true),
      metadata_filter: value.metadataFilter || '',
    },
    embedding: embeddingProfile
      ? { model: embeddingProfile.modelId, dim: embeddingProfile.nativeDimension }
      : null,
    store: vectorStore
      ? { provider: vectorStore.provider, index: vectorStore.indexName }
      : null,
  };

  // ─── Awake state ───────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* ── Hero card ───────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-300 via-cyan-400 to-sky-300"
        />
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-50 to-sky-50 text-cyan-600 ring-1 ring-cyan-200/60">
            <Search size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800">{strategy.label}</p>
            <p className="truncate font-mono text-[10.5px] text-slate-500">
              top-k {value.topK ?? 8} ·{' '}
              {vectorStore?.provider || embeddingProfile?.provider || 'in-memory'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-cyan-700">
              {value.topK ?? 8} chunks
            </span>
            <span className="font-mono text-[10px] text-slate-500">
              {strategy.badge.toLowerCase()}
            </span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-500">
          The <span className="font-semibold text-slate-700">retrieval hop</span> — embeds
          the query, searches the upstream vector index and returns the top-k chunks for
          the LLM (or a re-ranker downstream).
        </p>
      </div>

      {/* ── Upstream contract ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck size={14} className="text-cyan-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-800">
              Upstream contract · auto-synced
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <UpstreamPill
                label="Query"
                ok={hasQuerySource}
                hint={hasQuerySource ? 'connected' : 'missing'}
                Icon={Search}
              />
              <UpstreamPill
                label="Vector DB"
                ok={Boolean(vectorStore?.provider)}
                hint={vectorStore?.provider || 'in-memory'}
                Icon={Database}
              />
              <UpstreamPill
                label="Embedding"
                ok={Boolean(embeddingProfile?.modelId)}
                hint={
                  embeddingProfile?.nativeDimension
                    ? `${embeddingProfile.nativeDimension}d`
                    : 'inherited'
                }
                Icon={Layers}
              />
            </div>
            {(vectorStore?.indexName ||
              embeddingProfile?.modelId ||
              vectorStore?.metric ||
              embeddingProfile?.metric) && (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {vectorStore?.indexName && (
                  <div className="rounded-lg bg-white/70 px-2 py-1">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-cyan-600">
                      Index
                    </p>
                    <p className="truncate font-mono text-[10px] font-semibold text-slate-800">
                      {vectorStore.indexName}
                      {vectorStore.namespace ? ` · ${vectorStore.namespace}` : ''}
                    </p>
                  </div>
                )}
                {embeddingProfile?.modelId && (
                  <div className="rounded-lg bg-white/70 px-2 py-1">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-cyan-600">
                      Embedding model
                    </p>
                    <p
                      className="truncate font-mono text-[10px] font-semibold text-slate-800"
                      title={embeddingProfile.modelId}
                    >
                      {embeddingProfile.modelId}
                    </p>
                  </div>
                )}
                {(vectorStore?.metric || embeddingProfile?.metric) && (
                  <div className="rounded-lg bg-white/70 px-2 py-1">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-cyan-600">
                      Metric
                    </p>
                    <p className="font-mono text-[10px] font-semibold text-slate-800">
                      {vectorStore?.metric || embeddingProfile?.metric}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick presets ───────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
        <header className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Quick presets
          </p>
          {!RETRIEVER_PRESETS.some((p) => p.id === value.preset) && (
            <span className="rounded-full border border-cyan-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-700">
              custom
            </span>
          )}
        </header>
        <div className="grid grid-cols-2 gap-1.5">
          {RETRIEVER_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const active = value.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={`group flex flex-col gap-1 rounded-xl border bg-white p-2 text-left transition ${
                  active
                    ? 'border-cyan-300 ring-2 ring-cyan-200/60'
                    : 'border-slate-200 hover:border-cyan-200'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md transition ${
                      active
                        ? 'bg-cyan-100 text-cyan-600'
                        : 'bg-slate-100 text-slate-500 group-hover:bg-cyan-50 group-hover:text-cyan-500'
                    }`}
                  >
                    <Icon size={11} />
                  </span>
                  <span className={`text-[11px] font-bold ${active ? 'text-cyan-800' : 'text-slate-700'}`}>
                    {preset.label}
                  </span>
                </div>
                <span className="text-[9.5px] leading-snug text-slate-500">
                  {preset.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Strategy picker ─────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Compass size={12} className="text-cyan-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Search strategy
          </h4>
        </header>
        <div className="grid grid-cols-2 gap-1.5">
          {STRATEGIES.map((entry) => {
            const selected = entry.id === strategy.id;
            const Icon = entry.Icon;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setField('strategy', entry.id)}
                className={`group flex flex-col items-start gap-1 rounded-xl border p-2 text-left transition ${
                  selected
                    ? 'border-cyan-300 bg-cyan-50 ring-2 ring-cyan-200/60'
                    : 'border-slate-200 bg-white hover:border-cyan-200'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md transition ${
                      selected
                        ? 'bg-cyan-100 text-cyan-600'
                        : 'bg-slate-100 text-slate-500 group-hover:bg-cyan-50 group-hover:text-cyan-500'
                    }`}
                  >
                    <Icon size={11} />
                  </span>
                  <span
                    className={`text-[11px] font-bold ${selected ? 'text-cyan-900' : 'text-slate-800'}`}
                  >
                    {entry.label}
                  </span>
                </div>
                <span
                  className={`text-[9px] font-bold uppercase tracking-wider ${
                    selected ? 'text-cyan-700' : 'text-slate-500'
                  }`}
                >
                  {entry.badge}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] leading-relaxed text-slate-500">{strategy.description}</p>
      </section>

      {/* ── Strategy-specific knobs ─────────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Sliders size={12} className="text-cyan-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Strategy parameters
          </h4>
        </header>

        {strategy.knobs.includes('topK') && (
          <SliderRow
            label="Top K"
            help="How many chunks to return after ranking."
            value={Number(value.topK ?? 8)}
            min={1}
            max={50}
            step={1}
            onChange={(v) => setField('topK', v)}
            format={(v) => `${v}`}
          />
        )}

        {strategy.knobs.includes('similarityThreshold') && (
          <SliderRow
            label="Similarity threshold"
            help="Minimum similarity score required to include a chunk."
            value={Number(value.similarityThreshold ?? 0.72)}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setField('similarityThreshold', v)}
            format={(v) => v.toFixed(2)}
          />
        )}

        {strategy.knobs.includes('mmrLambda') && (
          <SliderRow
            label="MMR λ (relevance ↔ diversity)"
            help="1.0 = pure relevance, 0.0 = max diversity."
            value={Number(value.mmrLambda ?? 0.5)}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => setField('mmrLambda', v)}
            format={(v) => v.toFixed(2)}
          />
        )}

        {strategy.knobs.includes('mmrFetchK') && (
          <SliderRow
            label="MMR candidate pool"
            help="Top-similar candidates considered before MMR re-ranking."
            value={Number(value.mmrFetchK ?? Math.max(24, (value.topK ?? 8) * 3))}
            min={Math.max(value.topK ?? 8, 1)}
            max={200}
            step={1}
            onChange={(v) => setField('mmrFetchK', v)}
            format={(v) => `${v}`}
          />
        )}

        {strategy.knobs.includes('hybridAlpha') && (
          <SliderRow
            label="Hybrid α (dense ↔ sparse)"
            help="1.0 = pure vector, 0.0 = pure BM25."
            value={Number(value.hybridAlpha ?? 0.5)}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => setField('hybridAlpha', v)}
            format={(v) => v.toFixed(2)}
          />
        )}
      </section>

      {/* ── Output shaping ──────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Filter size={12} className="text-cyan-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Output shaping
          </h4>
        </header>
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip
            checked={Boolean(value.includeScores ?? true)}
            onChange={(v) => setField('includeScores', v)}
            label="Include scores"
            help="Attach similarity score to each returned chunk."
          />
          <ToggleChip
            checked={Boolean(value.includeMetadata ?? true)}
            onChange={(v) => setField('includeMetadata', v)}
            label="Include metadata"
            help="Pass through source, title, page — useful for citations."
          />
        </div>
        <div>
          <FieldLabel
            title="Metadata filter"
            help="Comma-separated key=value pairs. Only chunks whose metadata match are considered."
          />
          <input
            type="text"
            value={value.metadataFilter || ''}
            onChange={(event) => setField('metadataFilter', event.target.value)}
            placeholder="source=docs,lang=en"
            spellCheck={false}
            className={`${inputClass} font-mono`}
          />
        </div>
      </section>

      {/* ── Validation strip ────────────────────────────────────────────── */}
      {warnings.length > 0 ? (
        <ul className="space-y-1">
          {warnings.map((warning) => (
            <li
              key={warning}
              className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-800"
            >
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-emerald-800">
          <CheckCircle2 size={11} />
          Configuration valid — ready to retrieve.
        </div>
      )}

      {/* ── Output payload preview ──────────────────────────────────────── */}
      <details className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-cyan-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-cyan-400" />
        Output: <span className="font-mono text-cyan-700">chunks</span> +{' '}
        <span className="font-mono text-cyan-700">scores</span> → Reranker / LLM
      </div>
    </div>
  );
}
