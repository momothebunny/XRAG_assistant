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
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-fuchsia-400';

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
          setLoadError('Backend nem elérhető — beépített lista használatban.');
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
      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-sm">
            <Lock size={16} className="text-slate-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Reranker · alvó állapot
            </p>
            <p className="text-xs font-semibold text-slate-700">
              Csatlakoztass <span className="font-mono">chunks</span> ÉS query forrást.
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <div
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] ${
              hasChunksUpstream
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <Filter size={12} />
            <span className="font-bold">Chunks (Retriever / Hybrid Merge / Vector DB)</span>
            <span className="ml-auto font-mono text-[10px]">
              {hasChunksUpstream ? '✓' : '— hiányzik'}
            </span>
          </div>
          <div
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] ${
              hasQuerySource
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <Search size={12} />
            <span className="font-bold">Query (Question / Query Rewriter / HyDE)</span>
            <span className="ml-auto font-mono text-[10px]">
              {hasQuerySource ? '✓' : '— hiányzik'}
            </span>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
          A reranker pairwise pontoz <strong>(query, chunk)</strong> párokat. Mindkét bemenet kötelező.
        </p>
      </div>
    );
  }

  // ─── AWAKE STATE ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* ── Context-aware banner ────────────────────────────────────────── */}
      <div className="rounded-xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-white p-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-fuchsia-700" />
          <p className="text-[11px] font-black uppercase tracking-wider text-fuchsia-800">
            Context-aware
          </p>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-700">
          Bemenet:{' '}
          <span className="font-mono font-bold text-fuchsia-700">
            {upstreamChunkCount ?? '?'} chunk
          </span>{' '}
          ➔ Kimenet:{' '}
          <span className="font-mono font-bold text-fuchsia-700">{topN} legrelevánsabb chunk</span>
        </p>
      </div>

      {/* ── Backend proxy badge ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-800">
        <Cloud size={12} />
        <span>OpenRouter via backend proxy</span>
        <span className="ml-auto font-mono text-[9px] text-emerald-600">no client API key</span>
      </div>

      {/* ── Model picker ────────────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <SectionHeading color="text-fuchsia-700">Reranker model</SectionHeading>
          <button
            type="button"
            onClick={() => refreshModels(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {loadError && (
          <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
            {loadError}
          </p>
        )}

        <FieldLabel title="Modell választó" help="OpenRouter rerank modellek (id ⊃ 'rerank')." />
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
          <div className="flex flex-wrap gap-1 text-[9px] font-mono text-slate-500">
            <span className="rounded bg-slate-100 px-1.5 py-0.5">id: {selectedModel.id}</span>
            {selectedModel.context_length && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5">
                ctx: {selectedModel.context_length}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Reranker parameters ─────────────────────────────────────────── */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
        <SectionHeading>
          <span className="inline-flex items-center gap-1">
            <Award size={11} /> Haladó beállítások
          </span>
        </SectionHeading>

        <div>
          <FieldLabel
            title="Top N (kimeneti chunks)"
            help="Ennyi dokumentumot küldünk tovább az LLM-nek."
          />
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={topN}
              onChange={(event) => setMeta('top_n', Number(event.target.value))}
              className="flex-1 accent-fuchsia-600"
            />
            <input
              type="number"
              min={1}
              max={50}
              value={topN}
              onChange={(event) => setMeta('top_n', Number(event.target.value))}
              className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center font-mono text-xs"
            />
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            Ennyi dokumentumot küldünk tovább az LLM-nek.
          </p>
        </div>

        <div>
          <FieldLabel
            title="Relevancia küszöb (Score Threshold)"
            help="Ezen pontszám alatti találatokat a rendszer eldobja a hallucinációk elkerülése végett."
          />
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={scoreThreshold}
              onChange={(event) => setMeta('score_threshold', Number(event.target.value))}
              className="flex-1 accent-fuchsia-600"
            />
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={scoreThreshold}
              onChange={(event) => setMeta('score_threshold', Number(event.target.value))}
              className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center font-mono text-xs"
            />
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            Ezen pontszám alatti találatokat a rendszer eldobja a hallucinációk
            elkerülése végett. {scoreThreshold === 0 && '(0 = kikapcsolva)'}
          </p>
        </div>
      </div>

      {/* ── Read-only output payload ────────────────────────────────────── */}
      <div>
        <SectionHeading>Output payload (read-only)</SectionHeading>
        <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-emerald-300">
{JSON.stringify(buildRerankerPayload(value), null, 2)}
        </pre>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-fuchsia-500" />
        Engedélyezett bemenetek: <span className="font-mono">chunks</span> + <span className="font-mono">text</span>
      </div>
    </div>
  );
}
