/**
 * EmbeddingSettingsPanel — Backend-proxy embedding model picker for Au;Relia.
 *
 * Visual language: same modern atoms as the LLM (amber) / Retriever (cyan) /
 * Vector DB (emerald) panels — hero card, sectioned cards, ToggleChip pills,
 * validation strip, payload preview, footer. SKY palette to mirror the
 * `process-embedding` node colour (`bg-sky-50 border-sky-200 text-sky-700`).
 *
 * SECURITY:
 *   The OpenRouter API key NEVER leaves the server. This component talks
 *   exclusively to our own backend (`GET /api/models/embeddings` via
 *   `xragApi.listEmbeddingModels()`), which forwards the request to
 *   OpenRouter using the secret stored in `backend/.env`
 *   (`OPENROUTER_API_KEY`).
 *
 * The backend proxy already filters the catalogue to embedding models and
 * projects each entry to `{ id, name, context_length }` — no provider auth
 * UI is therefore required on the client.
 *
 * Hybrid dimension handling: OpenRouter does not report output vector size,
 * so we keep a small local DIMENSION_DICTIONARY for well-known IDs and fall
 * back to a manual number input for unknown models.
 *
 * BACKEND CONTRACT (UNCHANGED — `default_config` of `process-embedding` in
 * `backend/app/canvas/nodes.py` depends on these field names):
 *   { gateway, model_id, max_token_capacity, output_dimensions,
 *     is_cached, batch_size, metadata }
 *
 * Outbound payload (consumed by the canvas runtime / downstream nodes):
 *   {
 *     gateway: 'backend_proxy',
 *     metadata: {
 *       model_id, max_token_capacity, output_dimensions,
 *       is_cached, batch_size,
 *     } | null,
 *   }
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Compass,
  Database,
  Layers,
  Loader2,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

import { xragApi } from '../../services/xragApi';

// ─── Hybrid dimension dictionary ─────────────────────────────────────────
// OpenRouter does not expose `output_dimensions` for embedding models, so
// we hard-code the well-known ones and fall back to a manual input below.
const DIMENSION_DICTIONARY = {
  'openai/text-embedding-3-small':   1536,
  'openai/text-embedding-3-large':   3072,
  'openai/text-embedding-ada-002':   1536,
  'cohere/embed-multilingual-v3.0':  1024,
  'cohere/embed-english-v3.0':       1024,
  'cohere/embed-english-light-v3.0':  384,
  'google/text-embedding-004':        768,
  'voyage/voyage-3':                 1024,
  'voyage/voyage-3-lite':             512,
  'mistralai/mistral-embed':         1024,
  'baai/bge-m3':                     1024,
  'baai/bge-large-en-v1.5':          1024,
  // Pinecone integrated inference (server-side embedding).
  'intfloat/multilingual-e5-large':  1024,
  'pinecone/llama-text-embed-v2':    1024,
};

// Quick-pick presets so users can ship a sane config in one click.
const QUICK_PRESETS = [
  { id: 'openai-large',  label: 'OpenAI · 3-large',   model_id: 'openai/text-embedding-3-large',  hint: '3072d · 8k ctx' },
  { id: 'openai-small',  label: 'OpenAI · 3-small',   model_id: 'openai/text-embedding-3-small',  hint: '1536d · cheap' },
  { id: 'cohere-multi',  label: 'Cohere · multi v3',  model_id: 'cohere/embed-multilingual-v3.0', hint: '1024d · 100+ lang' },
  { id: 'bge-m3',        label: 'BGE · m3',           model_id: 'baai/bge-m3',                    hint: '1024d · OSS hybrid' },
];

// ─── Pure payload builder. Reused by the canvas runtime so downstream
// nodes see exactly the same shape as the inspector preview. (Field
// names preserved.)
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

// ─── Shared atoms (sky palette) ──────────────────────────────────────────
const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-200/50';

const FieldLabel = ({ title, help, required }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {title}
      {required && <span className="ml-1 text-rose-500">*</span>}
    </label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-sky-500">
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
        ? 'border-sky-300 bg-sky-50 text-sky-800 shadow-sm shadow-sky-200/40'
        : 'border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:text-sky-700'
    }`}
  >
    <span
      aria-hidden
      className={`inline-block h-2 w-2 rounded-full transition ${
        checked ? 'bg-sky-500' : 'bg-slate-300 group-hover:bg-sky-300'
      }`}
    />
    {label}
  </button>
);

function StatPill({ label, hint, ok = true, Icon }) {
  return (
    <div
      className={`rounded-lg border px-2 py-1.5 text-[10px] ${
        ok
          ? 'border-sky-200 bg-sky-50 text-sky-800'
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

// ─── Component ───────────────────────────────────────────────────────────
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
  const requiresManualDimension =
    Boolean(value.model_id) && !dimensionFromDict && !value.output_dimensions;

  // ── Validation ────────────────────────────────────────────────────────
  const warnings = [];
  if (!value.model_id) warnings.push('Pick an embedding model to activate this node.');
  if (requiresManualDimension) warnings.push('Output dimension required — model not in local dictionary.');
  if (batchSize < 1 || batchSize > 1024) warnings.push('Batch size should be between 1 and 1024.');

  const dims =
    Number(value.output_dimensions ?? DIMENSION_DICTIONARY[value.model_id] ?? 0) || null;
  const ctx = Number(value.max_token_capacity || 0) || null;

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* ── Hero card ───────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-300 via-sky-400 to-cyan-300"
        />
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-50 to-cyan-50 text-sky-600 ring-1 ring-sky-200/60">
            <Sparkles size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800">
              {value.model_id || 'No model selected'}
            </p>
            <p className="truncate font-mono text-[10.5px] text-slate-500">
              {dims ? `${dims}d` : '—'} · {ctx ? `${ctx} ctx` : '—'} · backend proxy
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="truncate max-w-[90px] text-[10.5px] font-bold text-sky-700">
              {selectedModel?.name?.split('/').slice(-1)[0] || 'embedding'}
            </span>
            <span className="font-mono text-[10px] text-slate-500">openrouter</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-500">
          The <span className="font-semibold text-slate-700">vectorisation hop</span> —
          turns chunks into dense vectors. The downstream Vector DB locks its dimension
          and metric to whatever you pick here.
        </p>
      </div>

      {/* ── Security contract ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck size={14} className="text-sky-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-800">
              Backend proxy · key stays server-side
            </p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill
                label="Model"
                ok={Boolean(value.model_id)}
                hint={value.model_id || 'unset'}
                Icon={Sparkles}
              />
              <StatPill
                label="Dimension"
                ok={Boolean(dims)}
                hint={dims ? `${dims}d` : '—'}
                Icon={Compass}
              />
              <StatPill
                label="Context"
                ok={Boolean(ctx)}
                hint={ctx ? `${ctx}` : '—'}
                Icon={Layers}
              />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-sky-900/80">
              The browser only talks to{' '}
              <span className="font-mono font-semibold">/api/models/embeddings</span>;
              the key lives in <span className="font-mono font-semibold">backend/.env</span>{' '}
              (<span className="font-mono">OPENROUTER_API_KEY</span>).
            </p>
          </div>
        </div>
      </div>

      {/* ── Quick presets ───────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Zap size={12} className="text-sky-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Quick presets
          </h4>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {QUICK_PRESETS.map((preset) => {
            const selected = value.model_id === preset.model_id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleModelChange(preset.model_id)}
                className={`group flex flex-col items-start gap-0.5 rounded-xl border p-2 text-left transition ${
                  selected
                    ? 'border-sky-300 bg-sky-50 ring-2 ring-sky-200/60'
                    : 'border-slate-200 bg-white hover:border-sky-200'
                }`}
              >
                <span
                  className={`text-[11px] font-bold ${
                    selected ? 'text-sky-900' : 'text-slate-800'
                  }`}
                >
                  {preset.label}
                </span>
                <span
                  className={`text-[9px] font-bold uppercase tracking-wider ${
                    selected ? 'text-sky-700' : 'text-slate-500'
                  }`}
                >
                  {preset.hint}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Model selector ──────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database size={12} className="text-sky-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Model catalog
            </h4>
            {!isLoading && !error && (
              <span className="rounded-full bg-sky-100 px-1.5 py-px text-[9px] font-bold text-sky-700">
                {models.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={loadModels}
            disabled={isLoading}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-50"
          >
            <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </header>

        {isLoading ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <Loader2 size={12} className="animate-spin" />
              Syncing models from the backend proxy…
            </div>
            <div className="h-7 w-full animate-pulse rounded bg-slate-200" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-300 bg-rose-50/70 p-2">
            <div className="flex items-start gap-2">
              <AlertTriangle size={13} className="mt-0.5 text-rose-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                  Backend proxy unavailable
                </p>
                <p className="break-words text-[11px] leading-snug text-rose-700/80">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={loadModels}
              className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-2 py-0.5 text-[10px] font-bold text-rose-700 hover:bg-rose-100"
            >
              <RefreshCw size={11} />
              Retry
            </button>
          </div>
        ) : models.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
            No embedding models matched on the OpenRouter catalogue. Try
            refreshing or check the backend logs.
          </p>
        ) : (
          <>
            <div>
              <FieldLabel
                title="model_id"
                help="Filtered to text-embedding models only."
                required
              />
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
                      ? `Auto-filled from the local dictionary (${dimensionFromDict}).`
                      : 'OpenRouter does not report this — supply it manually for unknown models.'
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
                  className={`${inputClass} ${
                    requiresManualDimension ? 'border-rose-400 bg-rose-50 text-rose-700' : ''
                  }`}
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

      {/* ── Advanced ────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-3">
        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600 transition hover:text-sky-700"
        >
          <span className="flex items-center gap-2">
            <Settings2 size={12} className="text-sky-500" />
            Advanced settings
          </span>
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
          />
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-2.5">
            <div className="flex flex-wrap gap-1.5">
              <ToggleChip
                checked={cacheEnabled}
                onChange={(next) => onChange('is_cached', next)}
                label="enable_cache"
                help="Stores already-computed vectors in a local cache. Re-indexing the same document is essentially free."
              />
            </div>
            <div>
              <FieldLabel
                title="batch_size"
                help="Number of texts per embedding request."
              />
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
        <div className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-sky-800">
          <CheckCircle2 size={11} />
          Configuration valid — ready to embed.
        </div>
      )}

      {/* ── Output payload preview ──────────────────────────────────────── */}
      <details className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Output payload (data.metadata)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-sky-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-sky-400" />
        Output: <span className="font-mono text-sky-700">embedded_chunks</span> → next-node
      </div>
    </div>
  );
};

export default EmbeddingSettingsPanel;
