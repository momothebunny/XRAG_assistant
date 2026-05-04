/**
 * OmniEmbeddingNode — Backend-proxy embedding model picker for Au;Relia.
 *
 * SECURITY:
 *   The OpenRouter API key NEVER leaves the server. This component talks
 *   exclusively to our own backend (`GET /api/models/embeddings` via
 *   `xragApi.listEmbeddingModels()`), which is responsible for forwarding
 *   the request to OpenRouter using the secret stored in `backend/.env`
 *   (`OPENROUTER_API_KEY`).
 *
 * The backend proxy already filters the catalogue to embedding models and
 * projects each entry to `{ id, name, context_length }` — no provider auth
 * UI is therefore required on the client.
 *
 * Hybrid dimension handling: OpenRouter does not report output vector size,
 * so we keep a small local DIMENSION_DICTIONARY for well-known IDs and
 * fall back to a manual number input for unknown models.
 *
 * Outbound payload (consumed by the canvas runtime / downstream nodes):
 *
 *   {
 *     gateway: 'backend_proxy',
 *     metadata: {
 *       model_id: string,
 *       max_token_capacity: number,
 *       output_dimensions: number,
 *       is_cached: boolean,
 *       batch_size: number,
 *     } | null,
 *   }
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  CircleHelp,
  Loader2,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { xragApi } from '../../services/xragApi';

// ─────────────────────────────────────────────────────────────────────────
// Hybrid dimension dictionary — OpenRouter does not expose `output_dimensions`
// for embedding models, so we hard-code the well-known ones and fall back to
// a manual number input for the rest.
// ─────────────────────────────────────────────────────────────────────────
const DIMENSION_DICTIONARY = {
  'openai/text-embedding-3-small':  1536,
  'openai/text-embedding-3-large':  3072,
  'openai/text-embedding-ada-002':  1536,
  'cohere/embed-multilingual-v3.0': 1024,
  'cohere/embed-english-v3.0':      1024,
  'cohere/embed-english-light-v3.0': 384,
  'google/text-embedding-004':       768,
  'voyage/voyage-3':                 1024,
  'voyage/voyage-3-lite':             512,
  'mistralai/mistral-embed':         1024,
  'baai/bge-m3':                     1024,
  'baai/bge-large-en-v1.5':          1024,
  // Pinecone integrated inference (server-side embedding).
  'intfloat/multilingual-e5-large':  1024,
  'pinecone/llama-text-embed-v2':    1024,
};

// ─────────────────────────────────────────────────────────────────────────
// Pure payload builder. Reused by the canvas runtime so downstream nodes see
// exactly the same shape as the inspector preview.
// ─────────────────────────────────────────────────────────────────────────
export const buildOmniEmbeddingPayload = (config) => {
  const modelId = String(config?.model_id ?? '');
  const ctx = Number(config?.max_token_capacity ?? 0);
  const dims = Number(config?.output_dimensions ?? DIMENSION_DICTIONARY[modelId] ?? 0);

  return {
    gateway: 'backend_proxy',
    metadata: modelId
      ? {
          model_id: modelId,
          max_token_capacity: ctx,
          output_dimensions: dims,
          is_cached: Boolean(config?.is_cached ?? true),
          batch_size: Number(config?.batch_size ?? 100),
        }
      : null,
  };
};

// ─────────────────────────────────────────────────────────────────────────
// Small UI primitives
// ─────────────────────────────────────────────────────────────────────────
const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400';

const FieldLabel = ({ title, help, required }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
      {title}
      {required && <span className="ml-1 text-rose-500">*</span>}
    </label>
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
        value ? 'bg-indigo-600' : 'bg-slate-300'
      }`}
    >
      <span
        className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-[left] duration-200"
        style={{ left: value ? '18px' : '2px' }}
      />
    </button>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────
const EmbeddingSettingsPanel = ({ value = {}, onChange }) => {
  const [models, setModels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Fetch from our own backend proxy ──────────────────────────────────
  const loadModels = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await xragApi.listEmbeddingModels();
      setModels(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || 'Failed to load embedding models from the backend.');
      setModels([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // ── Live payload + write-through to the node config ───────────────────
  const payload = useMemo(() => buildOmniEmbeddingPayload(value), [value]);
  useEffect(() => {
    const prevMeta = JSON.stringify(value.metadata || null);
    if (prevMeta !== JSON.stringify(payload.metadata)) onChange('metadata', payload.metadata);
    if (value.gateway !== 'backend_proxy') onChange('gateway', 'backend_proxy');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  const selectedModel = models.find((entry) => entry.id === value.model_id) || null;
  const cacheEnabled = Boolean(value.is_cached ?? true);
  const batchSize = Number(value.batch_size ?? 100);

  // Keep `max_token_capacity` in sync with the picked model's context_length.
  useEffect(() => {
    if (!selectedModel) return;
    const ctx = Number(selectedModel.context_length || 0);
    if (Number(value.max_token_capacity || 0) !== ctx) onChange('max_token_capacity', ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel?.id]);

  // When the user picks a model, prefill output_dimensions from the dictionary
  // (or clear it so the manual input shows up).
  const handleModelChange = (nextModelId) => {
    onChange('model_id', nextModelId);
    const next = models.find((entry) => entry.id === nextModelId);
    onChange('max_token_capacity', Number(next?.context_length || 0));
    const dictDim = DIMENSION_DICTIONARY[nextModelId];
    onChange('output_dimensions', dictDim ?? null);
  };

  const dimensionFromDict = DIMENSION_DICTIONARY[value.model_id];
  const requiresManualDimension = !!value.model_id && !dimensionFromDict && !value.output_dimensions;

  return (
    <div className="space-y-3 rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50/70 via-white to-white p-2.5 shadow-[0_0_0_1px_rgba(251,191,36,0.18)]">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} className="text-amber-500" />
          <p className="text-xs font-black uppercase tracking-wider text-slate-700">
            OpenRouter Embedding
          </p>
        </div>
        <button
          type="button"
          onClick={loadModels}
          title="Refresh model list"
          className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
          disabled={isLoading}
        >
          <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Security notice (replaces the old API key input) ──────────── */}
      <div className="flex items-start gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/80 px-2 py-1.5">
        <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-600" />
        <p className="text-[10px] leading-snug text-emerald-800">
          API key is held server-side. The browser only talks to{' '}
          <code className="rounded bg-emerald-100 px-1 py-px font-mono">/api/models/embeddings</code>.
        </p>
      </div>

      {/* ── Model selector ─────────────────────────────────────────────── */}
      <section className="space-y-2">
        <SectionHeading color="text-indigo-700">Model</SectionHeading>

        {isLoading ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
              <Loader2 size={12} className="animate-spin" />
              Syncing models…
            </div>
            <div className="h-7 w-full animate-pulse rounded bg-slate-200" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-300 bg-rose-50/70 p-2">
            <div className="flex items-start gap-2">
              <AlertTriangle size={13} className="mt-0.5 text-rose-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-rose-700">
                  Backend proxy unavailable
                </p>
                <p className="text-[11px] leading-snug text-rose-700/80 break-words">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={loadModels}
              className="mt-1.5 flex items-center gap-1 rounded-md border border-rose-300 bg-white px-2 py-0.5 text-[10px] font-bold text-rose-700 hover:bg-rose-100"
            >
              <RefreshCw size={11} />
              Retry
            </button>
          </div>
        ) : models.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
            No embedding models matched on the OpenRouter catalogue. Try refreshing or check the backend logs.
          </p>
        ) : (
          <>
            <div>
              <FieldLabel title="model_id" help="Filtered to text-embedding models only." required />
              <select
                value={value.model_id || ''}
                onChange={(event) => handleModelChange(event.target.value)}
                className={inputClass}
              >
                <option value="">Choose a model…</option>
                {value.model_id && !models.some((m) => m.id === value.model_id) && (
                  <option value={value.model_id}>{value.model_id} (saved)</option>
                )}
                {models.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {(entry.name || entry.id)} · {entry.id}
                  </option>
                ))}
              </select>
              {selectedModel && (
                <p className="mt-1 text-[10px] text-slate-500">
                  Context: {selectedModel.context_length ?? '—'} tokens
                </p>
              )}
            </div>

            {value.model_id && (
              <div>
                <FieldLabel
                  title="output_dimensions"
                  required
                  help={
                    dimensionFromDict
                      ? `Auto-filled from the local dimension dictionary (${dimensionFromDict}).`
                      : 'OpenRouter does not report this — please supply it manually for unknown models.'
                  }
                />
                <input
                  type="number"
                  min={1}
                  max={8192}
                  step={1}
                  value={value.output_dimensions ?? ''}
                  placeholder={dimensionFromDict ? String(dimensionFromDict) : 'e.g. 1536'}
                  onChange={(event) => {
                    const next = event.target.value;
                    onChange('output_dimensions', next === '' ? null : Number(next));
                  }}
                  className={`${inputClass} ${requiresManualDimension ? 'border-rose-400 bg-rose-50 text-rose-700' : ''}`}
                />
                {requiresManualDimension && (
                  <p className="mt-1 text-[10px] text-rose-600">
                    Required: this model is not in the local dictionary.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Advanced ───────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setShowAdvanced((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
      >
        <span className="flex items-center gap-1.5">
          <Settings2 size={13} />
          Advanced settings
        </span>
        <ChevronDown size={14} className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
      </button>

      {showAdvanced && (
        <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-white/60 p-2.5">
          <Toggle
            value={cacheEnabled}
            onChange={(next) => onChange('is_cached', next)}
            label="enable_cache"
            help="Stores already-computed vectors in a local cache. Re-indexing the same document is essentially free."
          />
          <div>
            <FieldLabel title="batch_size" help="Number of texts per embedding request." />
            <input
              type="number"
              min={1}
              max={1024}
              step={1}
              value={batchSize}
              onChange={(event) => onChange('batch_size', Number(event.target.value || 0))}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {/* ── Outbound payload preview ───────────────────────────────────── */}
      <details className="rounded-xl border border-slate-200 bg-slate-50/60 p-2" open>
        <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider text-slate-600">
          Outbound payload (data.metadata)
        </summary>
        <pre className="mt-1.5 overflow-x-auto rounded bg-slate-900/95 p-2 text-[10px] leading-snug text-slate-100 font-mono">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>
    </div>
  );
};

export default EmbeddingSettingsPanel;
