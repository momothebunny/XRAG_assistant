/**
 * RerankerSettingsPanel — OpenRouter-backed query-aware reranker.
 *
 * ARCHITECTURE
 *   • No client-side API keys. The panel calls the backend proxy at
 *     `GET /api/models/rerankers`, which talks to OpenRouter using the
 *     server-side `OPENROUTER_API_KEY` env var.
 *   • The dropdown is filtered to ids containing "rerank" (the backend
 *     enforces the same filter, so this is defence-in-depth).
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 9)
 *   • Inputs:  `chunks` (Retriever / Hybrid Merge / Vector DB) + `text` (query)
 *   • Outputs: `chunks` re-ranked, `top_n` filtered, with `rerank_score`.
 *
 * SLEEPING vs. AWAKE
 *   - Sleeps until both upstream `chunks` AND a `query` source are wired in.
 *   - Awake: model picker + Top N + Score Threshold + read-only payload preview.
 *
 * OUTPUT PAYLOAD (mirrors EmbeddingSettingsPanel.buildOmniEmbeddingPayload)
 *   {
 *     "step_type": "reranker",
 *     "gateway": "backend_proxy",
 *     "metadata": { "model_id": "...", "top_n": 5, "score_threshold": 0.0 }
 *   }
 */

import { useEffect, useMemo, useState } from 'react';
import SliderRow from './SliderRow';
import {
  Award,
  CircleHelp,
  Cloud,
  Filter,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Zap,
} from 'lucide-react';

import { xragApi } from '../../services/xragApi';

// ─────────────────────────────────────────────────────────────────────────
// Fallback model list — used if the backend is unreachable. Mirrors the
// curated catalogue in `backend/app/openrouter_proxy.py` so the dev UI is
// never empty.
// ─────────────────────────────────────────────────────────────────────────
const FALLBACK_MODELS = [
  { id: 'cohere/rerank-4-pro',                 name: 'Cohere Rerank 4 Pro',                 context_length: 4096 },
  { id: 'cohere/rerank-4-fast',                name: 'Cohere Rerank 4 Fast',                context_length: 4096 },
  { id: 'cohere/rerank-v3.5',                  name: 'Cohere Rerank v3.5',                  context_length: 4096 },
  { id: 'cohere/rerank-english-v3.0',          name: 'Cohere Rerank English v3',            context_length: 4096 },
  { id: 'cohere/rerank-multilingual-v3.0',     name: 'Cohere Rerank Multilingual v3',       context_length: 4096 },
  { id: 'voyage/rerank-2',                     name: 'Voyage Rerank 2',                     context_length: 16000 },
  { id: 'jina/reranker-v2-base-multilingual',  name: 'Jina Reranker v2 Multilingual',       context_length: 8192 },
];

// In-module cache so flipping between Reranker nodes doesn't re-hit the API.
let _modelsPromise = null;
const loadModels = (force = false) => {
  if (force || !_modelsPromise) {
    _modelsPromise = xragApi
      .listRerankerModels()
      .then((list) => (Array.isArray(list) && list.length ? list : FALLBACK_MODELS))
      .catch(() => FALLBACK_MODELS);
  }
  return _modelsPromise;
};

// ─────────────────────────────────────────────────────────────────────────
// Public payload builder — symmetrical with `buildOmniEmbeddingPayload`.
// ─────────────────────────────────────────────────────────────────────────
export function buildRerankerPayload(config = {}) {
  const meta = config.metadata || {};
  return {
    step_type: 'reranker',
    gateway: config.gateway || 'backend_proxy',
    metadata: {
      model_id: meta.model_id || 'cohere/rerank-4-pro',
      top_n: Number(meta.top_n ?? 5),
      score_threshold: Number(meta.score_threshold ?? 0.0),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// UI primitives
// ─────────────────────────────────────────────────────────────────────────
const inputClass =
  'w-full rounded-lg border border-slate-700/50 bg-[#0d1117] px-2 py-1.5 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-cyan-400';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{title}</label>
    {help && (
      <button type="button" title={help} className="shrink-0 text-slate-400 hover:text-slate-200">
        <CircleHelp size={11} />
      </button>
    )}
  </div>
);

const SectionHeading = ({ children, color = 'text-slate-300' }) => (
  <h4 className={`text-[10px] font-black uppercase tracking-wider ${color}`}>{children}</h4>
);

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────
export default function RerankerSettingsPanel({
  value = {},
  onChange,
  hasChunksUpstream,
  hasQuerySource,
  upstreamChunkCount,
}) {
  const [models, setModels] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const refreshModels = (force = false) => {
    setRefreshing(true);
    setLoadError(null);
    loadModels(force)
      .then((list) => {
        setModels(list);
        if (list === FALLBACK_MODELS) {
          setLoadError('Backend unavailable — using built-in list.');
        }
      })
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    refreshModels(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Defence in depth: even if the backend leaks non-rerank models, we filter again.
  const filteredModels = useMemo(
    () => (models || FALLBACK_MODELS).filter((m) => String(m.id || '').toLowerCase().includes('rerank')),
    [models],
  );

  const metadata = value.metadata || {};
  const modelId = metadata.model_id || 'cohere/rerank-4-pro';
  const topN = metadata.top_n ?? 5;
  const scoreThreshold = metadata.score_threshold ?? 0.0;

  const selectedModel = filteredModels.find((m) => m.id === modelId);
  const isAwake = Boolean(hasChunksUpstream && hasQuerySource);

  // Push every change through the canonical metadata bag so the saved
  // config exactly matches the documented React Flow data shape.
  const setMeta = (key, next) => {
    onChange?.('metadata', { ...metadata, [key]: next });
  };

  // Lazily ensure config carries `gateway` and `metadata` even on legacy drafts.
  useEffect(() => {
    if (!value.gateway) onChange?.('gateway', 'backend_proxy');
    if (!value.metadata) {
      onChange?.('metadata', {
        model_id: modelId,
        top_n: topN,
        score_threshold: scoreThreshold,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── SLEEPING STATE ─────────────────────────────────────────────────────
  if (!isAwake) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-600/60 bg-slate-800/40 p-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-sm">
            <Lock size={16} className="text-slate-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              Reranker · idle / sleeping
            </p>
            <p className="text-xs font-semibold text-slate-200">
              Connect a <span className="font-mono">chunks</span> AND query source.
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <div
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] ${
              hasChunksUpstream
                ? 'border-emerald-700/40 bg-emerald-900/20 text-emerald-300'
                : 'border-slate-700/50 bg-[#0d1117] text-slate-400'
            }`}
          >
            <Filter size={12} />
            <span className="font-bold">Chunks (Retriever / Hybrid Merge / Vector DB)</span>
            <span className="ml-auto font-mono text-[10px]">
              {hasChunksUpstream ? '✓' : '— missing'}
            </span>
          </div>
          <div
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] ${
              hasQuerySource
                ? 'border-emerald-700/40 bg-emerald-900/20 text-emerald-300'
                : 'border-slate-700/50 bg-[#0d1117] text-slate-400'
            }`}
          >
            <Search size={12} />
            <span className="font-bold">Query (Question / Query Rewriter / HyDE)</span>
            <span className="ml-auto font-mono text-[10px]">
              {hasQuerySource ? '✓' : '— missing'}
            </span>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-300">
          The reranker pairwise-scores <strong>(query, chunk)</strong> pairs. Both inputs are required.
        </p>
      </div>
    );
  }

  // ─── AWAKE STATE ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* ── Context-aware banner ────────────────────────────────────────── */}
      <div className="rounded-xl border border-cyan-700/40 bg-cyan-900/15 p-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-cyan-400" />
          <p className="text-[11px] font-black uppercase tracking-wider text-cyan-300">
            Context-aware
          </p>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-200">
          Bemenet:{' '}
          <span className="font-mono font-bold text-cyan-400">
            {upstreamChunkCount ?? '?'} chunk
          </span>{' '}
          ➔ Output:{' '}
          <span className="font-mono font-bold text-cyan-400">{topN} most relevant chunks</span>
        </p>
      </div>

      {/* ── Backend proxy badge ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-2.5 py-1.5 text-[10px] font-bold text-emerald-300">
        <Cloud size={12} />
        <span>OpenRouter via backend proxy</span>
        <span className="ml-auto font-mono text-[9px] text-emerald-600">no client API key</span>
      </div>

      {/* ── Model picker ────────────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-700/50 bg-[#0d1117] p-3">
        <div className="flex items-center justify-between">
          <SectionHeading color="text-cyan-400">Reranker model</SectionHeading>
          <button
            type="button"
            onClick={() => refreshModels(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded border border-slate-700/50 bg-[#0d1117] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-800/50 disabled:opacity-50"
          >
            <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {loadError && (
          <p className="rounded border border-cyan-700/40 bg-cyan-900/15 px-2 py-1 text-[10px] text-cyan-300">
            {loadError}
          </p>
        )}

        <FieldLabel title="Model picker" help="OpenRouter rerank models (id ⊃ 'rerank')." />
        <select
          value={modelId}
          onChange={(event) => setMeta('model_id', event.target.value)}
          className={inputClass}
        >
          {modelId && !filteredModels.some((m) => m.id === modelId) && (
            <option value={modelId}>{modelId} (saved)</option>
          )}
          {filteredModels.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name || model.id} — {model.id}
            </option>
          ))}
        </select>

        {selectedModel && (
          <div className="flex flex-wrap gap-1 text-[9px] font-mono text-slate-400">
            <span className="rounded bg-slate-800/60 px-1.5 py-0.5">id: {selectedModel.id}</span>
            {selectedModel.context_length && (
              <span className="rounded bg-slate-800/60 px-1.5 py-0.5">
                ctx: {selectedModel.context_length}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Reranker parameters ─────────────────────────────────────────── */}
      <div className="space-y-3 rounded-xl border border-slate-700/50 bg-[#0d1117] p-3">
        <SectionHeading>
          <span className="inline-flex items-center gap-1">
            <Award size={11} /> Advanced settings
          </span>
        </SectionHeading>

        <SliderRow
          label="Top N (output chunks)"
          help="This many documents are forwarded to the LLM."
          value={topN}
          min={1}
          max={20}
          step={1}
          onChange={(v) => setMeta('top_n', v)}
          accentColor="#22d3ee"
        />

        <SliderRow
          label="Relevance threshold"
          help="Hits below this score are dropped to avoid hallucinations."
          value={scoreThreshold}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setMeta('score_threshold', v)}
          format={(v) => v.toFixed(2)}
          accentColor="#22d3ee"
          minLabel={scoreThreshold === 0 ? 'disabled (0)' : '0'}
          maxLabel="1"
        />
      </div>

      {/* ── Read-only output payload ────────────────────────────────────── */}
      <div>
        <SectionHeading>Output payload (read-only)</SectionHeading>
        <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-emerald-300">
{JSON.stringify(buildRerankerPayload(value), null, 2)}
        </pre>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg bg-slate-800/60 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <Zap size={11} className="text-cyan-500" />
        Allowed inputs: <span className="font-mono">chunks</span> + <span className="font-mono">text</span>
      </div>
    </div>
  );
}
