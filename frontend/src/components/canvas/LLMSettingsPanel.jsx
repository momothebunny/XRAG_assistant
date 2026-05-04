/**
 * LLMSettingsPanel — OpenRouter-backed chat-completion node (`brain-llm`).
 *
 * Visual language matches User / Question / Response panels (hero card,
 * preset grid, sectioned cards, ToggleChip pills, range sliders,
 * validation strip, collapsible payload preview), but with an
 * AMBER / YELLOW palette to mirror the brain-llm node colour
 * (bg-amber-50 border-amber-200 text-amber-700 in canvasConfig).
 *
 * BACKEND CONTRACT (UNCHANGED — backend canvas runner depends on it)
 *   step_type = "llm"
 *   gateway   = "backend_proxy"
 *   metadata  = { model_id, fallback_model_id, temperature, max_tokens,
 *                 top_p, response_format, streaming, stop_sequences,
 *                 frequency_penalty, presence_penalty, seed,
 *                 context_overflow_strategy, structured_config? }
 *
 * Models list is loaded from the server proxy (`GET /api/models/hf-chat`)
 * with a curated fallback so the picker is never empty.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Compass,
  Database,
  Flame,
  RefreshCw,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  Wand2,
  Zap,
} from 'lucide-react';

import { xragApi } from '../../services/xragApi';

// ─── Curated fallback (when the proxy is unreachable) ───────────────────
const FALLBACK_MODELS = [
  { id: 'openai/gpt-4o',                         name: 'gpt-4o' },
  { id: 'openai/gpt-4o-mini',                    name: 'gpt-4o-mini' },
  { id: 'anthropic/claude-3.5-sonnet',           name: 'claude-3.5-sonnet' },
  { id: 'anthropic/claude-3-haiku',              name: 'claude-3-haiku' },
  { id: 'google/gemini-2.0-flash-001',           name: 'gemini-2.0-flash' },
  { id: 'meta-llama/llama-3.3-70b-instruct',     name: 'llama-3.3-70b-instruct' },
  { id: 'mistralai/mistral-large',               name: 'mistral-large' },
  { id: 'deepseek/deepseek-chat',                name: 'deepseek-chat' },
];

const HF_MODEL_LIMIT = 500;

let _modelsPromise = null;
const loadModels = (force = false) => {
  if (force || !_modelsPromise) {
    _modelsPromise = xragApi
      .listHuggingFaceChatModels(HF_MODEL_LIMIT)
      .then((list) => (Array.isArray(list) && list.length ? list : FALLBACK_MODELS))
      .catch(() => FALLBACK_MODELS);
  }
  return _modelsPromise;
};

// ─── Shared atoms (amber palette) ────────────────────────────────────────
const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {title}
    </label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-amber-500">
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
        ? 'border-amber-300 bg-amber-50 text-amber-800 shadow-sm shadow-amber-200/40'
        : 'border-slate-200 bg-white text-slate-500 hover:border-amber-200 hover:text-amber-700'
    }`}
  >
    <span
      aria-hidden
      className={`inline-block h-2 w-2 rounded-full transition ${
        checked ? 'bg-amber-500' : 'bg-slate-300 group-hover:bg-amber-300'
      }`}
    />
    {label}
  </button>
);

// ─── Domain options ──────────────────────────────────────────────────────
const RESPONSE_FORMATS = [
  { value: 'text',        label: 'Plain text',       hint: 'Free-form natural language.' },
  { value: 'markdown',    label: 'Markdown',         hint: 'Hint the LLM to emit Markdown.' },
  { value: 'json_object', label: 'JSON object',      hint: 'Strict valid JSON (free schema).' },
  { value: 'json_schema', label: 'JSON schema',      hint: 'JSON validated against a schema.' },
  { value: 'latex',       label: 'LaTeX',            hint: 'Equations / scientific output.' },
];

const OVERFLOW_STRATEGIES = [
  { value: 'strict',          label: 'Strict — fail on overflow' },
  { value: 'truncate_middle', label: 'Truncate middle of context' },
  { value: 'truncate_end',    label: 'Truncate end of context' },
];

// Quick presets — same pattern as RESPONSE_PRESETS in ResponseSettingsPanel.
const LLM_PRESETS = [
  {
    id: 'precise',
    label: 'Precise',
    description: 'Low temperature, factual.',
    icon: Target,
    overrides: {
      temperature: 0.05,
      top_p: 1.0,
      max_tokens: 1024,
      response_format: 'text',
      streaming: true,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Default RAG settings.',
    icon: Compass,
    overrides: {
      temperature: 0.2,
      top_p: 1.0,
      max_tokens: 1024,
      response_format: 'text',
      streaming: true,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
    },
  },
  {
    id: 'creative',
    label: 'Creative',
    description: 'Higher temperature, longer.',
    icon: Wand2,
    overrides: {
      temperature: 0.8,
      top_p: 0.95,
      max_tokens: 2048,
      response_format: 'markdown',
      streaming: true,
      frequency_penalty: 0.2,
      presence_penalty: 0.2,
    },
  },
  {
    id: 'json',
    label: 'JSON Tool',
    description: 'Structured JSON output.',
    icon: Sliders,
    overrides: {
      temperature: 0.0,
      top_p: 1.0,
      max_tokens: 1024,
      response_format: 'json_object',
      streaming: false,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
    },
  },
];

// ─── Public payload builder (UNCHANGED — backend depends on this shape) ──
export function buildLlmPayload(config = {}) {
  const meta = config.metadata || {};
  const stopSeqRaw = Array.isArray(meta.stop_sequences) ? meta.stop_sequences : [];
  const seedRaw = meta.seed;
  const seed =
    seedRaw === null || seedRaw === undefined || seedRaw === ''
      ? null
      : Number.isFinite(Number(seedRaw))
        ? Math.trunc(Number(seedRaw))
        : null;
  return {
    step_type: 'llm',
    gateway: config.gateway || 'backend_proxy',
    metadata: {
      model_id: meta.model_id || 'openai/gpt-4o',
      fallback_model_id:
        typeof meta.fallback_model_id === 'string' && meta.fallback_model_id.trim()
          ? meta.fallback_model_id.trim()
          : null,
      temperature: Number(meta.temperature ?? 0.2),
      max_tokens: Number(meta.max_tokens ?? 1024),
      top_p: Number(meta.top_p ?? 1.0),
      response_format: ['text', 'json_object', 'json_schema', 'markdown', 'latex'].includes(
        meta.response_format,
      )
        ? meta.response_format
        : 'text',
      streaming: meta.streaming !== undefined ? Boolean(meta.streaming) : true,
      stop_sequences: stopSeqRaw.filter((s) => typeof s === 'string' && s.length > 0).slice(0, 4),
      frequency_penalty: Number(meta.frequency_penalty ?? 0.0),
      presence_penalty: Number(meta.presence_penalty ?? 0.0),
      seed,
      context_overflow_strategy: ['strict', 'truncate_middle', 'truncate_end'].includes(
        meta.context_overflow_strategy,
      )
        ? meta.context_overflow_strategy
        : 'strict',
    },
  };
}

// ─── Default config ──────────────────────────────────────────────────────
export const DEFAULT_LLM_CONFIG = {
  gateway: 'backend_proxy',
  metadata: {
    model_id: 'openai/gpt-4o',
    fallback_model_id: null,
    temperature: 0.2,
    max_tokens: 1024,
    top_p: 1.0,
    response_format: 'text',
    streaming: true,
    stop_sequences: [],
    frequency_penalty: 0.0,
    presence_penalty: 0.0,
    seed: null,
    context_overflow_strategy: 'strict',
  },
  preset: 'balanced',
};

// ─── Component ───────────────────────────────────────────────────────────
export default function LLMSettingsPanel({
  value = {},
  onChange,
  hasQuerySource = false,
  hasChunksUpstream = false,
  hasSystemPromptUpstream = false,
  upstreamChunkCount = 0,
}) {
  const [models, setModels] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [stopInput, setStopInput] = useState('');

  const metadata = value.metadata || {};
  const modelId = metadata.model_id || 'openai/gpt-4o';

  // Lazily ensure config carries `gateway` and `metadata` even on legacy drafts.
  useEffect(() => {
    if (!value.gateway) onChange?.('gateway', 'backend_proxy');
    if (!value.metadata) {
      onChange?.('metadata', {
        model_id: modelId,
        temperature: 0.2,
        max_tokens: 1024,
        top_p: 1.0,
        response_format: 'text',
        streaming: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = (force = false) => {
    setRefreshing(true);
    setLoadError(null);
    loadModels(force)
      .then((list) => {
        setModels(list);
        if (list === FALLBACK_MODELS) {
          setLoadError('Backend unavailable — using built-in fallback list.');
        }
      })
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMeta = (key, next) => {
    onChange?.('metadata', { ...metadata, [key]: next });
    // Any direct edit invalidates the preset highlight.
    if (value.preset && value.preset !== 'custom') {
      onChange?.('preset', 'custom');
    }
  };

  const applyPreset = (presetId) => {
    const preset = LLM_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onChange?.('preset', preset.id);
    onChange?.('metadata', { ...metadata, ...preset.overrides });
  };

  // Catalogue + filter ---------------------------------------------------
  const catalogue = models || FALLBACK_MODELS;

  // Always materialise the saved model id so the picker reflects what's
  // persisted (even if the catalogue doesn't list it).
  const list = useMemo(() => {
    const seen = new Set();
    const out = [];
    if (modelId) {
      out.push({ id: modelId, name: modelId.split('/').slice(1).join('/') || modelId });
      seen.add(modelId);
    }
    for (const m of catalogue) {
      if (!m?.id || seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    return out;
  }, [catalogue, modelId]);

  const filteredList = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return list.slice(0, 60);
    return list
      .filter((m) => `${m.id} ${m.name || ''}`.toLowerCase().includes(needle))
      .slice(0, 60);
  }, [list, searchQuery]);

  const selectedModel = list.find((m) => m.id === modelId);
  const provider = String(modelId).split('/')[0] || 'unknown';
  const displayName = selectedModel?.name || modelId.split('/').slice(1).join('/') || modelId;

  // Stop-sequences tag editor ------------------------------------------
  const stopSeqs = Array.isArray(metadata.stop_sequences) ? metadata.stop_sequences : [];
  const addStopSeq = () => {
    const v = stopInput.trim();
    if (!v) return;
    if (stopSeqs.includes(v)) return;
    if (stopSeqs.length >= 4) return;
    setMeta('stop_sequences', [...stopSeqs, v]);
    setStopInput('');
  };
  const removeStopSeq = (s) => setMeta('stop_sequences', stopSeqs.filter((x) => x !== s));

  // Validation -----------------------------------------------------------
  const warnings = [];
  if (!hasQuerySource) {
    warnings.push('No query source connected — connect Question / Query Rewriter / Reranker.');
  }
  if (metadata.response_format === 'json_object' && metadata.streaming) {
    warnings.push('JSON object output works best with streaming disabled.');
  }
  if ((metadata.max_tokens ?? 0) > 4096 && metadata.response_format === 'json_object') {
    warnings.push('Very large JSON outputs are often invalid — consider lowering max_tokens.');
  }

  const payload = useMemo(() => buildLlmPayload(value), [value]);

  // ─── Sleeping state (no query upstream) ────────────────────────────────
  if (!hasQuerySource) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/40 p-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-amber-200">
              <Brain size={18} className="text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                LLM · idle
              </p>
              <p className="text-xs font-semibold text-slate-700">
                Connect a query source to wake this node.
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-500">
            <Search size={12} />
            <span className="font-bold">Query (text)</span>
            <span className="ml-auto font-mono text-[10px] text-amber-600">missing</span>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
            Generation without a query is meaningless. Recommended pipeline:{' '}
            <span className="font-mono font-bold">Reranker → LLM</span>, optional System
            Prompt attached.
          </p>
        </div>
      </div>
    );
  }

  // ─── Awake state ───────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* ── Hero card ───────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-300"
        />
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-50 to-yellow-50 text-amber-600 ring-1 ring-amber-200/60">
            <Brain size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800">{displayName}</p>
            <p className="truncate font-mono text-[10.5px] text-slate-500">
              {provider} · {metadata.response_format || 'text'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-amber-700">
              T={Number(metadata.temperature ?? 0.2).toFixed(2)}
            </span>
            <span className="font-mono text-[10px] text-slate-500">
              {metadata.streaming ? 'streamed' : 'one-shot'}
            </span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-500">
          The <span className="font-semibold text-slate-700">generation hop</span> — reads the
          query, the retrieved chunks, and the system prompt, and produces the chat completion
          consumed by downstream nodes (Hallucination Guard, Response, Chat).
        </p>
      </div>

      {/* ── Upstream contract ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck size={14} className="text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">
              Upstream contract
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <UpstreamPill
                label="Query"
                ok={hasQuerySource}
                hint={hasQuerySource ? 'connected' : 'missing'}
                Icon={Search}
              />
              <UpstreamPill
                label="Chunks"
                ok={hasChunksUpstream}
                hint={hasChunksUpstream ? `${upstreamChunkCount || '?'} found` : 'optional'}
                Icon={Database}
              />
              <UpstreamPill
                label="Sys-Prompt"
                ok={hasSystemPromptUpstream}
                hint={hasSystemPromptUpstream ? 'wired' : 'inline only'}
                Icon={Sparkles}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick presets ───────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
        <header className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Quick presets
          </p>
          {!LLM_PRESETS.some((p) => p.id === value.preset) && (
            <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700">
              custom
            </span>
          )}
        </header>
        <div className="grid grid-cols-2 gap-1.5">
          {LLM_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const active = value.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={`group flex flex-col gap-1 rounded-xl border bg-white p-2 text-left transition ${
                  active
                    ? 'border-amber-300 ring-2 ring-amber-200/60'
                    : 'border-slate-200 hover:border-amber-200'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md transition ${
                      active
                        ? 'bg-amber-100 text-amber-600'
                        : 'bg-slate-100 text-slate-500 group-hover:bg-amber-50 group-hover:text-amber-500'
                    }`}
                  >
                    <Icon size={11} />
                  </span>
                  <span
                    className={`text-[11px] font-bold ${
                      active ? 'text-amber-800' : 'text-slate-700'
                    }`}
                  >
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

      {/* ── Model selector ──────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain size={12} className="text-amber-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Model
            </h4>
          </div>
          <button
            type="button"
            onClick={() => refresh(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:border-amber-200 hover:text-amber-700 disabled:opacity-50"
            title="Reload model catalogue"
          >
            <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </header>

        <div className="relative">
          <Search
            size={12}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={searchQuery}
            placeholder="Filter models (e.g. claude, llama, gpt-4)…"
            onChange={(event) => setSearchQuery(event.target.value)}
            className={`${inputClass} pl-7`}
          />
        </div>

        <div className="max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white">
          {filteredList.length === 0 ? (
            <p className="p-3 text-center text-[11px] text-slate-500">No models match.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filteredList.map((model) => {
                const active = model.id === modelId;
                const prov = String(model.id).split('/')[0];
                return (
                  <li key={model.id}>
                    <button
                      type="button"
                      onClick={() => setMeta('model_id', model.id)}
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition ${
                        active
                          ? 'bg-amber-50 text-amber-900'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                          active ? 'bg-amber-500' : 'bg-slate-300'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11.5px] font-semibold">
                          {model.name || model.id.split('/').slice(1).join('/')}
                        </p>
                        <p className="truncate font-mono text-[9.5px] text-slate-500">
                          {prov}
                        </p>
                      </div>
                      {active && (
                        <CheckCircle2 size={11} className="shrink-0 text-amber-600" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {loadError && (
          <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
            <AlertTriangle size={10} className="mt-0.5 shrink-0" />
            {loadError}
          </p>
        )}
      </section>

      {/* ── Sampling ────────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Flame size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Sampling
          </h4>
        </header>

        <SliderRow
          label="Temperature"
          help="Higher = more creative. 0 = deterministic."
          value={Number(metadata.temperature ?? 0.2)}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => setMeta('temperature', v)}
          format={(v) => v.toFixed(2)}
        />
        <SliderRow
          label="Top-p (nucleus)"
          help="Sample from the smallest set whose total probability ≥ p."
          value={Number(metadata.top_p ?? 1.0)}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => setMeta('top_p', v)}
          format={(v) => v.toFixed(2)}
        />
        <SliderRow
          label="Max tokens"
          help="Hard cap on completion length."
          value={Number(metadata.max_tokens ?? 1024)}
          min={64}
          max={8192}
          step={64}
          onChange={(v) => setMeta('max_tokens', v)}
          format={(v) => `${v}`}
        />
      </section>

      {/* ── Output format ───────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Sparkles size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Output format
          </h4>
        </header>

        <div>
          <FieldLabel
            title="Response format"
            help="Hint passed to the LLM (e.g. JSON object enforcement)."
          />
          <select
            value={metadata.response_format || 'text'}
            onChange={(event) => setMeta('response_format', event.target.value)}
            className={inputClass}
          >
            {RESPONSE_FORMATS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.hint}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <ToggleChip
            checked={metadata.streaming !== false}
            onChange={(v) => setMeta('streaming', v)}
            label="Stream tokens"
            help="Token-by-token SSE response."
          />
        </div>
      </section>

      {/* ── Advanced (collapsible) ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setAdvancedOpen((s) => !s)}
          className="flex w-full items-center justify-between p-3 text-left"
        >
          <div className="flex items-center gap-2">
            <Sliders size={12} className="text-amber-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Advanced
            </h4>
          </div>
          <ChevronDown
            size={14}
            className={`text-slate-400 transition ${advancedOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {advancedOpen && (
          <div className="space-y-3 border-t border-slate-100 p-3">
            <SliderRow
              label="Frequency penalty"
              help="Penalises repeated tokens (-2 .. 2)."
              value={Number(metadata.frequency_penalty ?? 0)}
              min={-2}
              max={2}
              step={0.1}
              onChange={(v) => setMeta('frequency_penalty', v)}
              format={(v) => v.toFixed(1)}
            />
            <SliderRow
              label="Presence penalty"
              help="Penalises tokens already in the text (-2 .. 2)."
              value={Number(metadata.presence_penalty ?? 0)}
              min={-2}
              max={2}
              step={0.1}
              onChange={(v) => setMeta('presence_penalty', v)}
              format={(v) => v.toFixed(1)}
            />

            <div>
              <FieldLabel title="Seed" help="Integer for reproducibility, blank = random." />
              <input
                type="number"
                value={metadata.seed ?? ''}
                placeholder="random"
                onChange={(event) => {
                  const raw = event.target.value;
                  setMeta('seed', raw === '' ? null : Number(raw));
                }}
                className={inputClass}
              />
            </div>

            <div>
              <FieldLabel title="Stop sequences (max 4)" help="Stop generation when one is emitted." />
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={stopInput}
                  placeholder='e.g. "\nUser:"'
                  onChange={(event) => setStopInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addStopSeq();
                    }
                  }}
                  className={`${inputClass} font-mono`}
                />
                <button
                  type="button"
                  onClick={addStopSeq}
                  disabled={!stopInput.trim() || stopSeqs.length >= 4}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              {stopSeqs.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {stopSeqs.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-800"
                    >
                      {JSON.stringify(s)}
                      <button
                        type="button"
                        onClick={() => removeStopSeq(s)}
                        className="text-amber-500 hover:text-amber-700"
                        aria-label={`Remove ${s}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <FieldLabel
                title="Fallback model"
                help="Retry against this model on rate-limit / network failure."
              />
              <input
                type="text"
                value={metadata.fallback_model_id || ''}
                placeholder="openai/gpt-4o-mini"
                onChange={(event) => setMeta('fallback_model_id', event.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <FieldLabel title="Context overflow strategy" />
              <select
                value={metadata.context_overflow_strategy || 'strict'}
                onChange={(event) => setMeta('context_overflow_strategy', event.target.value)}
                className={inputClass}
              >
                {OVERFLOW_STRATEGIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-emerald-800">
          <CheckCircle2 size={11} />
          Configuration valid — ready to generate.
        </div>
      )}

      {/* ── Output payload preview ──────────────────────────────────────── */}
      <details className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-amber-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-amber-400" />
        Output: <span className="font-mono text-amber-700">chat_completion</span> → Response / Chat
      </div>
    </div>
  );
}

// ─── Small atoms used by the panel ───────────────────────────────────────
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
      <p className="mt-0.5 font-mono text-[9px]">{hint}</p>
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
            <span title={help} className="cursor-help text-slate-300 hover:text-amber-500">
              <CircleHelp size={11} />
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] font-bold text-amber-700">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange?.(Number(event.target.value))}
        className="w-full accent-amber-400"
      />
    </div>
  );
}
