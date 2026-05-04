/**
 * LLMSettingsPanel — OpenRouter-backed grounded chat completion.
 *
 * ARCHITECTURE
 *   • No client-side API keys. Calls `GET /api/models/chat`, which proxies
 *     OpenRouter using the server-side `OPENROUTER_API_KEY`.
 *   • The model dropdown lists OpenRouter chat/completion models (excludes
 *     embed + rerank) plus a curated fallback so the UI is never empty.
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 13)
 *   • Inputs:
 *       - `text` (REQUIRED) — the user query (Question / QueryRewriter / HyDE
 *         / Router / Reranker pipeline).
 *       - `chunks` (recommended) — retrieved evidence (Reranker / Compression
 *         / Retriever).
 *       - `system_prompt` (optional) — from the dedicated System Prompt node.
 *         If absent, the inline `systemPrompt` config field is used as fallback.
 *   • Outputs: `answer`, `text`.
 *
 * SLEEP vs. AWAKE
 *   - Sleeps until at least a `text` (query) source is wired in. Without a
 *     query there is nothing to answer.
 *   - Awake: shows model picker, sampling knobs, system-prompt origin badge,
 *     context-aware preview, and the read-only output payload.
 *
 * OUTPUT PAYLOAD
 *   {
 *     "step_type": "llm",
 *     "gateway": "backend_proxy",
 *     "metadata": {
 *       "model_id": "openai/gpt-4o",
 *       "temperature": 0.2,
 *       "max_tokens": 1024,
 *       "top_p": 1.0,
 *       "response_format": "text"
 *     }
 *   }
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain,
  Check,
  ChevronDown,
  CircleHelp,
  Cloud,
  Database,
  Download,
  ExternalLink,
  Flame,
  Heart,
  Lock,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  Sliders,
  X,
  Zap,
} from 'lucide-react';

import { xragApi } from '../../services/xragApi';
import { getProviderLogo, hasProviderLogo } from '../../data/providerLogos';

// ─────────────────────────────────────────────────────────────────────────
// Curated fallback (used only when HF is unreachable). Keeps the picker
// non-empty so the canvas remains operable offline.
// ─────────────────────────────────────────────────────────────────────────
const FALLBACK_MODELS = [
  { id: 'meta-llama/Meta-Llama-3-8B-Instruct',     name: 'Meta-Llama-3-8B-Instruct',     downloads: 0, likes: 0 },
  { id: 'meta-llama/Meta-Llama-3-70B-Instruct',    name: 'Meta-Llama-3-70B-Instruct',    downloads: 0, likes: 0 },
  { id: 'mistralai/Mistral-7B-Instruct-v0.3',      name: 'Mistral-7B-Instruct-v0.3',     downloads: 0, likes: 0 },
  { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1',    name: 'Mixtral-8x7B-Instruct-v0.1',   downloads: 0, likes: 0 },
  { id: 'Qwen/Qwen2.5-7B-Instruct',                name: 'Qwen2.5-7B-Instruct',          downloads: 0, likes: 0 },
  { id: 'Qwen/Qwen2.5-72B-Instruct',               name: 'Qwen2.5-72B-Instruct',         downloads: 0, likes: 0 },
  { id: 'google/gemma-2-9b-it',                    name: 'gemma-2-9b-it',                downloads: 0, likes: 0 },
  { id: 'deepseek-ai/DeepSeek-R1',                 name: 'DeepSeek-R1',                  downloads: 0, likes: 0 },
];

const HF_MODEL_LIMIT = 1000;

// Sort options for the model picker. Each entry pairs a sort key with an
// icon + label + accent palette so the dropdown can render brand-matching
// chips and the selected-row check.
const SORT_OPTIONS = [
  { key: 'downloads', label: 'Downloads', short: 'Downloads', Icon: Download, accent: 'amber' },
  { key: 'likes',     label: 'Likes',     short: 'Likes',     Icon: Heart,    accent: 'rose'   },
  { key: 'recent',    label: 'Newest',    short: 'Newest',    Icon: RefreshCw, accent: 'sky'   },
  { key: 'name',      label: 'Name (A–Z)', short: 'A–Z',      Icon: ScrollText, accent: 'slate' },
];

const SORT_ACCENTS = {
  violet: { ring: 'border-amber-300 bg-amber-50 text-amber-800', dot: 'bg-amber-500',  soft: 'text-amber-600' },
  rose:   { ring: 'border-rose-300 bg-rose-50 text-rose-800',       dot: 'bg-rose-500',    soft: 'text-rose-600'   },
  sky:    { ring: 'border-sky-300 bg-sky-50 text-sky-800',          dot: 'bg-sky-500',     soft: 'text-sky-600'    },
  slate:  { ring: 'border-slate-300 bg-slate-100 text-slate-800',   dot: 'bg-slate-500',   soft: 'text-slate-600'  },
};

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

// ─────────────────────────────────────────────────────────────────────────
// Public payload builder
// ─────────────────────────────────────────────────────────────────────────
export function buildLlmPayload(config = {}) {
  const meta = config.metadata || {};
  // Coerce / validate the advanced fields. `seed` is preserved as null when
  // empty so downstream code can detect "random". stop_sequences is hard-
  // capped at 4 entries to match the UI validation.
  const stopSeqRaw = Array.isArray(meta.stop_sequences) ? meta.stop_sequences : [];
  const seedRaw = meta.seed;
  const seed =
    seedRaw === null || seedRaw === undefined || seedRaw === ''
      ? null
      : Number.isFinite(Number(seedRaw))
        ? Math.trunc(Number(seedRaw))
        : null;
  const payload = {
    step_type: 'llm',
    gateway: config.gateway || 'backend_proxy',
    metadata: {
      model_id: meta.model_id || 'meta-llama/Meta-Llama-3-8B-Instruct',
      // Optional resilience hop: if the primary model errors with a
      // network failure or 429 (rate limit), the gateway transparently
      // retries the same prompt against this id. `null` disables the
      // fallback (default — no behavioural change).
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
  const sc = buildStructuredConfig(meta);
  if (sc) payload.metadata.structured_config = sc;
  return payload;
}

// Build the `structured_config` sub-object only when the chosen response
// format requires it. Keeps the emitted payload tight: `text` and
// `json_object` (free-form) get no extra config; `json_schema` carries the
// parsed schema, `markdown`/`latex` carry the template instructions.
function buildStructuredConfig(meta = {}) {
  const fmt = meta.response_format;
  const cfg = meta.structured_config || {};
  if (fmt === 'json_schema') {
    const raw = typeof cfg.schema_text === 'string' ? cfg.schema_text : '';
    if (!raw.trim()) return { schema: null };
    try {
      return { schema: JSON.parse(raw) };
    } catch {
      // Surface invalid drafts so backend / debugger can see something
      // happened, without crashing the live JSON preview.
      return { schema: { __invalid: true, raw } };
    }
  }
  if (fmt === 'markdown' || fmt === 'latex') {
    return {
      template_instructions:
        typeof cfg.template_instructions === 'string' ? cfg.template_instructions : '',
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Provider visual identity. Mapping the OpenRouter `vendor/...` prefix to a
// short label + colour palette gives the picker a recognisable, designy feel
// instead of a wall of monospaced ids.
// ─────────────────────────────────────────────────────────────────────────
const PROVIDER_STYLE = {
  // OpenAI / Anthropic / xAI etc. don't publish on HF, but keep the entries
  // so the curated fallback (or future hybrid sources) still get colours.
  openai:        { label: 'OpenAI',     dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',  solid: 'bg-emerald-500 border-emerald-600 text-white', ring: 'ring-emerald-300' },
  anthropic:     { label: 'Anthropic',  dot: 'bg-orange-500',  chip: 'bg-orange-50 text-orange-700 border-orange-200',     solid: 'bg-orange-500 border-orange-600 text-white',   ring: 'ring-orange-300' },
  google:        { label: 'Google',     dot: 'bg-sky-500',     chip: 'bg-sky-50 text-sky-700 border-sky-200',              solid: 'bg-sky-500 border-sky-600 text-white',         ring: 'ring-sky-300' },
  'meta-llama':  { label: 'Meta',       dot: 'bg-blue-600',    chip: 'bg-blue-50 text-blue-700 border-blue-200',           solid: 'bg-blue-600 border-blue-700 text-white',       ring: 'ring-blue-300' },
  mistralai:     { label: 'Mistral',    dot: 'bg-rose-500',    chip: 'bg-rose-50 text-rose-700 border-rose-200',           solid: 'bg-rose-500 border-rose-600 text-white',       ring: 'ring-rose-300' },
  deepseek:      { label: 'DeepSeek',   dot: 'bg-indigo-500',  chip: 'bg-indigo-50 text-indigo-700 border-indigo-200',     solid: 'bg-indigo-500 border-indigo-600 text-white',   ring: 'ring-indigo-300' },
  'deepseek-ai': { label: 'DeepSeek',   dot: 'bg-indigo-500',  chip: 'bg-indigo-50 text-indigo-700 border-indigo-200',     solid: 'bg-indigo-500 border-indigo-600 text-white',   ring: 'ring-indigo-300' },
  Qwen:          { label: 'Qwen',       dot: 'bg-yellow-500',  chip: 'bg-yellow-50 text-yellow-700 border-yellow-200',     solid: 'bg-yellow-500 border-yellow-600 text-white',   ring: 'ring-yellow-300' },
  qwen:          { label: 'Qwen',       dot: 'bg-yellow-500',  chip: 'bg-yellow-50 text-yellow-700 border-yellow-200',     solid: 'bg-yellow-500 border-yellow-600 text-white',   ring: 'ring-yellow-300' },
  cohere:        { label: 'Cohere',     dot: 'bg-pink-500',    chip: 'bg-pink-50 text-pink-700 border-pink-200',           solid: 'bg-pink-500 border-pink-600 text-white',       ring: 'ring-pink-300' },
  CohereForAI:   { label: 'Cohere',     dot: 'bg-pink-500',    chip: 'bg-pink-50 text-pink-700 border-pink-200',           solid: 'bg-pink-500 border-pink-600 text-white',       ring: 'ring-pink-300' },
  ai21:          { label: 'AI21',       dot: 'bg-yellow-500',  chip: 'bg-yellow-50 text-yellow-800 border-yellow-200',     solid: 'bg-yellow-500 border-yellow-600 text-white',   ring: 'ring-yellow-300' },
  perplexity:    { label: 'Perplexity', dot: 'bg-cyan-500',    chip: 'bg-cyan-50 text-cyan-700 border-cyan-200',           solid: 'bg-cyan-500 border-cyan-600 text-white',       ring: 'ring-cyan-300' },
  xai:           { label: 'xAI',        dot: 'bg-slate-700',   chip: 'bg-slate-100 text-slate-800 border-slate-300',       solid: 'bg-slate-800 border-slate-900 text-white',     ring: 'ring-slate-400' },
  nvidia:        { label: 'NVIDIA',     dot: 'bg-lime-500',    chip: 'bg-lime-50 text-lime-700 border-lime-200',           solid: 'bg-lime-500 border-lime-600 text-white',       ring: 'ring-lime-300' },
  microsoft:     { label: 'Microsoft',  dot: 'bg-blue-500',    chip: 'bg-blue-50 text-blue-700 border-blue-200',           solid: 'bg-blue-500 border-blue-600 text-white',       ring: 'ring-blue-300' },
  // Common HF orgs
  HuggingFaceH4: { label: 'HF H4',      dot: 'bg-yellow-500',  chip: 'bg-yellow-50 text-yellow-800 border-yellow-200',     solid: 'bg-yellow-500 border-yellow-600 text-white',   ring: 'ring-yellow-300' },
  TIGER_Lab:     { label: 'TIGER Lab',  dot: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-700 border-amber-200',        solid: 'bg-amber-500 border-amber-600 text-white',     ring: 'ring-amber-300' },
  NousResearch:  { label: 'Nous',       dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 border-amber-200',  solid: 'bg-amber-500 border-amber-600 text-white', ring: 'ring-amber-300' },
  THUDM:         { label: 'THUDM',      dot: 'bg-red-500',     chip: 'bg-red-50 text-red-700 border-red-200',              solid: 'bg-red-500 border-red-600 text-white',         ring: 'ring-red-300' },
  bigcode:       { label: 'BigCode',    dot: 'bg-teal-500',    chip: 'bg-teal-50 text-teal-700 border-teal-200',           solid: 'bg-teal-500 border-teal-600 text-white',       ring: 'ring-teal-300' },
  tiiuae:        { label: 'TII',        dot: 'bg-emerald-600', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',  solid: 'bg-emerald-600 border-emerald-700 text-white', ring: 'ring-emerald-300' },
  databricks:    { label: 'Databricks', dot: 'bg-red-600',     chip: 'bg-red-50 text-red-700 border-red-200',              solid: 'bg-red-600 border-red-700 text-white',         ring: 'ring-red-300' },
  stabilityai:   { label: 'Stability',  dot: 'bg-amber-500',  chip: 'bg-amber-50 text-amber-700 border-amber-200',     solid: 'bg-amber-500 border-amber-600 text-white',   ring: 'ring-amber-300' },
};
const DEFAULT_PROVIDER_STYLE = {
  label: null, dot: 'bg-slate-400',
  chip: 'bg-slate-50 text-slate-700 border-slate-200',
  solid: 'bg-slate-700 border-slate-800 text-white',
  ring: 'ring-slate-300',
};
const providerStyle = (id) => PROVIDER_STYLE[id] || DEFAULT_PROVIDER_STYLE;
const providerLabel = (id) => providerStyle(id).label || id;

const formatContext = (n) => {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
};

// Compact human-readable count (downloads / likes). HF returns very large
// integers (10M+ for popular checkpoints) — rendering raw numbers is noisy.
const formatCount = (n) => {
  if (!n || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
};

const stripProvider = (id) => String(id || '').split('/').slice(1).join('/') || id;

// ─────────────────────────────────────────────────────────────────────────
// UI primitives
// ─────────────────────────────────────────────────────────────────────────
const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-400';

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

const SliderRow = ({ value, onChange, min, max, step, label, help }) => (
  <div>
    <div className="mb-1 flex items-center justify-between">
      <FieldLabel title={label} help={help} />
      <span className="font-mono text-[10px] font-bold text-slate-700">
        {Number(value).toFixed(step < 1 ? 2 : 0)}
      </span>
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
export default function LLMSettingsPanel({
  value = {},
  onChange,
  hasQuerySource,
  hasChunksUpstream,
  hasSystemPromptUpstream,
  upstreamChunkCount,
}) {
  const [models, setModels] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [providerFilter, setProviderFilter] = useState('all');
  const [providerOpen, setProviderOpen] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // Sort key for the model list. HF returns models pre-sorted by
  // downloads, but the user may want likes / recency / alphabetical.
  // Applied AFTER provider+search filtering so chosen subset stays sorted.
  const [sortBy, setSortBy] = useState('downloads');
  const [sortOpen, setSortOpen] = useState(false);
  // User-imported custom HF models. Persisted to localStorage so a refresh
  // doesn't lose them. They merge into the picker list ahead of the cached
  // top-1000 (custom always wins on id collision).
  const [customModels, setCustomModels] = useState(() => {
    try {
      const raw = localStorage.getItem('xrag.llm.customModels');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [customId, setCustomId] = useState('');
  const [customError, setCustomError] = useState(null);
  const [customLoading, setCustomLoading] = useState(false);
  // HF model ids that the Health Dashboard has confirmed as `unsupported`
  // (no Inference Provider routing). We hide these from the picker so the
  // user can't accidentally pick a dead model. Sourced from the
  // `xrag.health.unsupported` localStorage key + a custom in-tab event
  // dispatched by the HealthTab whenever the watchlist changes.
  const [unsupportedSet, setUnsupportedSet] = useState(() => {
    try {
      const raw = localStorage.getItem('xrag.health.unsupported');
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    const onSameTab = (event) => {
      const list = Array.isArray(event?.detail) ? event.detail : [];
      setUnsupportedSet(new Set(list));
    };
    const onCrossTab = (event) => {
      if (event.key !== 'xrag.health.unsupported') return;
      try {
        const parsed = event.newValue ? JSON.parse(event.newValue) : [];
        setUnsupportedSet(new Set(Array.isArray(parsed) ? parsed : []));
      } catch {
        // Ignore malformed entries; keep the previous snapshot.
      }
    };
    window.addEventListener('xrag:unsupported-models', onSameTab);
    window.addEventListener('storage', onCrossTab);
    return () => {
      window.removeEventListener('xrag:unsupported-models', onSameTab);
      window.removeEventListener('storage', onCrossTab);
    };
  }, []);
  // Advanced settings accordion + local input state for the stop-sequences
  // tag editor (the array itself lives in metadata.stop_sequences).
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [stopInput, setStopInput] = useState('');
  // Debounced query — typing into the search box on a 1 000-row dataset
  // would otherwise re-filter on every keystroke and re-render the
  // virtualized list. 150 ms feels instant but cuts work by ~10×.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery), 150);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  // Virtualized scroll state — fixed row height (52 px), small overscan so
  // fast scrolling doesn't flash empty rows.
  const ROW_HEIGHT = 52;
  const VIEWPORT_HEIGHT = 360;
  const OVERSCAN = 4;
  const listRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Close the provider dropdown on outside click. Using mousedown so the
  // close fires before the new click target swallows the event.
  const providerMenuRef = useRef(null);
  useEffect(() => {
    if (!providerOpen) return undefined;
    const handle = (event) => {
      if (providerMenuRef.current && !providerMenuRef.current.contains(event.target)) {
        setProviderOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [providerOpen]);

  // Same outside-click pattern for the sort combobox.
  const sortMenuRef = useRef(null);
  useEffect(() => {
    if (!sortOpen) return undefined;
    const handle = (event) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [sortOpen]);

  const refresh = (force = false) => {
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

  // Persist user-imported custom models across reloads.
  useEffect(() => {
    try {
      localStorage.setItem('xrag.llm.customModels', JSON.stringify(customModels));
    } catch {
      /* storage quota / disabled — fail silently */
    }
  }, [customModels]);

  // Validate + import a single HF model id. We hit the backend so the secret
  // stays server-side and so 404s are detected before the user thinks the
  // model "works".
  const addCustomModel = async () => {
    const raw = customId.trim();
    setCustomError(null);
    if (!raw) return;
    if (!/^[\w.\-]+\/[\w.\-]+$/.test(raw)) {
      setCustomError('Format: org/model-name (e.g. meta-llama/Llama-3.1-8B-Instruct).');
      return;
    }
    if (customModels.some((m) => m.id === raw)) {
      setCustomError('Already in your custom list.');
      return;
    }
    setCustomLoading(true);
    try {
      const projected = await xragApi.getHuggingFaceModel(raw);
      const tag = String(projected.pipeline_tag || '').toLowerCase();
      if (tag && tag !== 'text-generation' && tag !== 'text2text-generation') {
        setCustomError(`Not a text-generation model (pipeline: ${tag}).`);
        return;
      }
      setCustomModels((prev) => [{ ...projected, __custom: true }, ...prev]);
      // Auto-select the newly imported model so it's immediately usable.
      setMeta('model_id', projected.id);
      setCustomId('');
    } catch (err) {
      // requestJson throws an Error whose message is the raw response body —
      // typically `{"detail":"..."}` for FastAPI 4xx. Try to peel that out.
      let detail = err?.message || 'Failed to fetch model.';
      try {
        const parsed = JSON.parse(detail);
        if (parsed?.detail) detail = parsed.detail;
      } catch { /* not JSON, keep raw */ }
      setCustomError(String(detail));
    } finally {
      setCustomLoading(false);
    }
  };

  const removeCustomModel = (id) => {
    setCustomModels((prev) => prev.filter((m) => m.id !== id));
  };

  useEffect(() => {
    refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catalogue = models || FALLBACK_MODELS;
  const metadata = value.metadata || {};
  const modelId = metadata.model_id || 'openai/gpt-4o';
  // Merge custom models in front of the catalogue. Dedupe by id so a custom
  // entry tagged `__custom: true` always wins over a cached duplicate.
  // Hide ids the Health Dashboard has flagged as `unsupported`, but never
  // hide the currently-selected model (otherwise the picker would silently
  // contradict the saved metadata).
  const list = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const m of customModels) {
      if (!m?.id || seen.has(m.id)) continue;
      seen.add(m.id);
      out.push({ ...m, __custom: true });
    }
    for (const m of catalogue) {
      if (!m?.id || seen.has(m.id)) continue;
      if (unsupportedSet.has(m.id) && m.id !== modelId) continue;
      seen.add(m.id);
      out.push(m);
    }
    // Always materialise the saved model id so the picker reflects what's
    // actually persisted in the flow JSON. Without this an OpenRouter id
    // (e.g. `openai/gpt-4o-mini`) saved on disk would silently appear
    // unselected because the HF catalogue doesn't list it.
    if (modelId && !seen.has(modelId)) {
      out.unshift({ id: modelId, name: modelId, __custom: true, downloads: 0, likes: 0 });
    }
    return out;
  }, [catalogue, customModels, unsupportedSet, modelId]);
  const selectedModel = list.find((m) => m.id === modelId);

  // Group models by provider (the part of the OpenRouter id before the slash:
  // openai/gpt-4o → "openai"). Used by the provider filter dropdown so users
  // can narrow a 200+ entry list to e.g. only Anthropic models.
  const providers = useMemo(() => {
    const counts = new Map();
    for (const model of list) {
      const provider = String(model.id || '').split('/')[0] || 'unknown';
      counts.set(provider, (counts.get(provider) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([id, count]) => ({ id, count }));
  }, [list]);

  const filteredList = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    const filtered = list.filter((model) => {
      const provider = String(model.id || '').split('/')[0];
      if (providerFilter !== 'all' && provider !== providerFilter) return false;
      if (!needle) return true;
      const haystack = `${model.id || ''} ${model.name || ''}`.toLowerCase();
      return haystack.includes(needle);
    });
    // Sort on a copy so we never mutate the cached `models` array.
    const sorted = filtered.slice();
    if (sortBy === 'downloads') {
      sorted.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    } else if (sortBy === 'likes') {
      sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    } else if (sortBy === 'recent') {
      sorted.sort((a, b) => {
        const ta = Date.parse(a.last_modified || '') || 0;
        const tb = Date.parse(b.last_modified || '') || 0;
        return tb - ta;
      });
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    }
    return sorted;
  }, [list, providerFilter, debouncedSearch, sortBy]);

  // Reset scroll to top whenever the filter narrows the list, otherwise the
  // user may end up "scrolled past the end" and see only the empty padding.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [providerFilter, debouncedSearch, sortBy]);

  // Window of indices to render. With ROW_HEIGHT=52 and 360 px viewport
  // we render ~7 rows + overscan, regardless of total list size — meaning
  // the React reconciler stays small even with 1 000 entries.
  const totalHeight = filteredList.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    filteredList.length,
    Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN,
  );
  const visibleSlice = filteredList.slice(startIndex, endIndex);
  const offsetY = startIndex * ROW_HEIGHT;

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
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMeta = (key, next) => {
    onChange?.('metadata', { ...metadata, [key]: next });
  };

  // ─── SLEEPING STATE ─────────────────────────────────────────────────────
  if (!hasQuerySource) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-sm">
            <Lock size={16} className="text-slate-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              LLM · idle
            </p>
            <p className="text-xs font-semibold text-slate-700">
              Connect a query source (Question / Query Rewriter / Reranker).
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-500">
            <Search size={12} />
            <span className="font-bold">Query (text)</span>
            <span className="ml-auto font-mono text-[10px]">— missing</span>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
          Generation without a query is meaningless. Recommended pipeline:
          Reranker → LLM, optional System Prompt attached.
        </p>
      </div>
    );
  }

  // ─── AWAKE STATE ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* ── Context-aware banner ────────────────────────────────────────── */}
      <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-amber-700" />
          <p className="text-[11px] font-black uppercase tracking-wider text-amber-800">
            Input overview
          </p>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
          <div className={`rounded-lg border px-2 py-1.5 ${hasQuerySource ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'}`}>
            <Search size={11} />
            <p className="mt-0.5 font-bold">Query</p>
            <p className="font-mono text-[9px]">{hasQuerySource ? '✓' : '—'}</p>
          </div>
          <div className={`rounded-lg border px-2 py-1.5 ${hasChunksUpstream ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <Database size={11} />
            <p className="mt-0.5 font-bold">Chunks</p>
            <p className="font-mono text-[9px]">
              {hasChunksUpstream ? `${upstreamChunkCount ?? '?'} items` : 'none (ungrounded!)'}
            </p>
          </div>
          <div className={`rounded-lg border px-2 py-1.5 ${hasSystemPromptUpstream ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'}`}>
            <ScrollText size={11} />
            <p className="mt-0.5 font-bold">Sys.prompt</p>
            <p className="font-mono text-[9px]">{hasSystemPromptUpstream ? 'upstream' : 'inline'}</p>
          </div>
        </div>
      </div>

      {/* ── Model picker ────────────────────────────────────────────────── */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3 shadow-sm">
        {/* Hero banner: announces the curated HF top-1000 catalogue. The
            flame icon hints at "trending" / "hot" — amber→rose gradient ties
            into the Hugging Face brand palette without aping their logo. */}
        <div className="relative overflow-hidden rounded-lg border border-amber-200/70 bg-gradient-to-r from-amber-50 via-rose-50 to-amber-50 px-3 py-2 shadow-inner">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br from-amber-300/40 to-rose-300/30 blur-xl" />
          <div className="relative flex items-center gap-2.5">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-white shadow-md ring-1 ring-amber-300/60">
              <Flame size={14} className="drop-shadow-sm" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-rose-700">
                  Top {HF_MODEL_LIMIT}
                </span>
                <span className="rounded-full bg-white/70 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-200">
                  Trending
                </span>
              </div>
              <div className="truncate text-[10px] font-semibold text-slate-700">
                Most popular models on Hugging Face
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/80 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-emerald-200">
              <Cloud size={10} />
              proxy
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <SectionHeading color="text-amber-700">
            <span className="inline-flex items-center gap-1.5">
              <Brain size={12} />
              <span>Model</span>
              <span className="rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-bold text-amber-700">
                {filteredList.length}/{list.length}
              </span>
            </span>
          </SectionHeading>
          <button
            type="button"
            onClick={() => refresh(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
          >
            <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {loadError && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
            {loadError}
          </p>
        )}

        {/* Toolbar: search (flex-1) + compact sort select. Single row keeps
            the panel tight on narrow node widths and avoids ugly chip wrap. */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Search
              size={12}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name or id…"
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-7 text-xs text-slate-700 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div ref={sortMenuRef} className="relative shrink-0">
            {(() => {
              const active = SORT_OPTIONS.find((o) => o.key === sortBy) || SORT_OPTIONS[0];
              const accent = SORT_ACCENTS[active.accent];
              const ActiveIcon = active.Icon;
              return (
                <>
                  <button
                    type="button"
                    onClick={() => setSortOpen((open) => !open)}
                    title={`Sort: ${active.label}`}
                    aria-haspopup="listbox"
                    aria-expanded={sortOpen}
                    className={`group inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold shadow-sm transition ${accent.ring} hover:shadow`}
                  >
                    <ActiveIcon
                      size={12}
                      className={active.accent === 'rose' ? 'fill-rose-500 text-rose-500' : ''}
                    />
                    <span>{active.short}</span>
                    <ChevronDown
                      size={12}
                      className={`transition ${sortOpen ? 'rotate-180' : ''} opacity-70 group-hover:opacity-100`}
                    />
                  </button>

                  {sortOpen && (
                    <div
                      role="listbox"
                      className="absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-xl ring-1 ring-black/5 backdrop-blur"
                    >
                      <div className="border-b border-slate-100 bg-slate-50/80 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                        Sort
                      </div>
                      <ul className="py-1">
                        {SORT_OPTIONS.map((opt) => {
                          const isActive = opt.key === sortBy;
                          const optAccent = SORT_ACCENTS[opt.accent];
                          const OptIcon = opt.Icon;
                          return (
                            <li key={opt.key}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                onClick={() => {
                                  setSortBy(opt.key);
                                  setSortOpen(false);
                                }}
                                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                                  isActive
                                    ? `${optAccent.ring} font-semibold`
                                    : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <span
                                  className={`inline-flex h-5 w-5 items-center justify-center rounded-md ${
                                    isActive ? optAccent.dot + ' text-white' : 'bg-slate-100 ' + optAccent.soft
                                  }`}
                                >
                                  <OptIcon
                                    size={11}
                                    className={
                                      opt.accent === 'rose' && isActive
                                        ? 'fill-white text-white'
                                        : opt.accent === 'rose'
                                          ? 'fill-rose-500 text-rose-500'
                                          : ''
                                    }
                                  />
                                </span>
                                <span className="flex-1">{opt.label}</span>
                                {isActive && <Check size={12} className={optAccent.soft} />}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Custom model teaser — the actual form lives BELOW the model list
            so the picker stays the visual focus. (Removed top banner —
            merged into the lower importer card.) */}

        {/* Provider dropdown — custom combobox so we can render the brand
            colour dot on both the trigger and the options (native <select>
            would strip the styling). */}
        {(() => {
          const isAll = providerFilter === 'all';
          const activeStyle = isAll ? null : providerStyle(providerFilter);
          const activeCount = isAll
            ? list.length
            : providers.find((p) => p.id === providerFilter)?.count ?? 0;
          const needle = providerSearch.trim().toLowerCase();
          const visibleProviders = needle
            ? providers.filter((p) => p.id.toLowerCase().includes(needle))
            : providers;
          return (
            <div ref={providerMenuRef} className="relative">
              <label className="mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-500">
                Provider
              </label>
              <button
                type="button"
                onClick={() => setProviderOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={providerOpen}
                className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs font-bold shadow-sm transition ${
                  isAll
                    ? 'border-slate-200 bg-white text-slate-700 hover:border-amber-300'
                    : `${activeStyle.solid} hover:brightness-110`
                }`}
              >
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                    isAll ? 'bg-amber-100 text-amber-700' : 'bg-white/25 text-white'
                  }`}
                >
                  {isAll ? (
                    <span className="text-[9px] font-black">∀</span>
                  ) : (
                    <Check size={11} />
                  )}
                </span>
                <span className="flex-1 truncate">
                  {isAll ? 'All providers' : providerLabel(providerFilter)}
                </span>
                <span
                  className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] ${
                    isAll ? 'bg-slate-100 text-slate-600' : 'bg-white/25 text-white'
                  }`}
                >
                  {activeCount}
                </span>
                <ChevronDown
                  size={14}
                  className={`shrink-0 transition ${providerOpen ? 'rotate-180' : ''} ${
                    isAll ? 'text-slate-400' : 'text-white/80'
                  }`}
                />
              </button>

              {providerOpen && (
                <div
                  role="listbox"
                  className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
                >
                  {/* Search inside dropdown */}
                  <div className="relative border-b border-slate-100 bg-slate-50 px-2 py-1.5">
                    <Search
                      size={11}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="search"
                      value={providerSearch}
                      onChange={(event) => setProviderSearch(event.target.value)}
                      autoFocus
                      placeholder={`Search providers (${providers.length})…`}
                      className="w-full rounded-md border border-slate-200 bg-white py-1 pl-6 pr-2 text-[11px] outline-none focus:border-amber-300 focus:ring-1 focus:ring-amber-200"
                    />
                  </div>

                  <div className="max-h-64 overflow-y-auto py-1">
                    {/* "All" option always first */}
                    <button
                      type="button"
                      role="option"
                      aria-selected={isAll}
                      onClick={() => {
                        setProviderFilter('all');
                        setProviderOpen(false);
                        setProviderSearch('');
                      }}
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition ${
                        isAll ? 'bg-amber-50 text-amber-900' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-amber-100 text-[9px] font-black text-amber-700">
                        ∀
                      </span>
                      <span className="flex-1 font-bold">All providers</span>
                      <span className="font-mono text-[9px] text-slate-500">{list.length}</span>
                      {isAll && <Check size={12} className="text-amber-600" />}
                    </button>

                    <div className="my-1 h-px bg-slate-100" />

                    {visibleProviders.length === 0 && (
                      <p className="px-3 py-3 text-center text-[11px] text-slate-400">
                        No such provider.
                      </p>
                    )}

                    {visibleProviders.map((provider) => {
                      const style = providerStyle(provider.id);
                      const active = providerFilter === provider.id;
                      return (
                        <button
                          key={provider.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => {
                            setProviderFilter(provider.id);
                            setProviderOpen(false);
                            setProviderSearch('');
                          }}
                          className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition ${
                            active
                              ? 'bg-amber-50 text-amber-900'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`}
                            aria-hidden
                          />
                          <span className="flex-1 truncate">
                            <span className="font-bold">{providerLabel(provider.id)}</span>
                            {providerLabel(provider.id) !== provider.id && (
                              <span className="ml-1.5 font-mono text-[9px] text-slate-400">
                                {provider.id}
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-[9px] text-slate-500">
                            {provider.count}
                          </span>
                          {active && <Check size={12} className="text-amber-600" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Model card list — VIRTUALIZED. With 1 000 HF entries we render
            only the rows that intersect the viewport (~7-8 visible + small
            overscan). The outer scroller is sized to `totalHeight` so the
            scrollbar reflects the full dataset; the inner absolute layer
            positions visible rows with translateY. */}
        {filteredList.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-8 text-center text-[11px] text-slate-400">
            No results — narrow your search or pick another provider.
          </div>
        ) : (
          <div
            ref={listRef}
            role="listbox"
            aria-label="Available models"
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            className="relative overflow-y-auto rounded-lg border border-slate-200 bg-white"
            style={{ height: VIEWPORT_HEIGHT }}
          >
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div
                style={{
                  transform: `translateY(${offsetY}px)`,
                  position: 'absolute',
                  left: 0,
                  right: 0,
                }}
              >
                {visibleSlice.map((model) => {
                  const provider = String(model.id || '').split('/')[0];
                  const style = providerStyle(provider);
                  const isActive = model.id === modelId;
                  const dl = formatCount(model.downloads);
                  const lk = formatCount(model.likes);
                  return (
                    <button
                      key={model.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => setMeta('model_id', model.id)}
                      style={{ height: ROW_HEIGHT }}
                      className={`group flex w-full items-center gap-2 border-b border-slate-100 px-2 text-left transition ${
                        isActive
                          ? 'bg-amber-50 ring-1 ring-inset ring-amber-300'
                          : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`relative grid h-7 w-7 shrink-0 place-items-center rounded-full shadow-sm ${
                          hasProviderLogo(provider) ? 'bg-white ring-1 ring-slate-200' : `text-white ${style.dot}`
                        }`}
                        aria-hidden
                      >
                        {hasProviderLogo(provider) ? (
                          getProviderLogo(provider, 18)
                        ) : (
                          <span className="text-[9px] font-black">
                            {providerLabel(provider).slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        {isActive && (
                          <span className="absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-amber-600 text-white ring-2 ring-white">
                            <Check size={8} strokeWidth={3} />
                          </span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-xs font-bold ${isActive ? 'text-amber-900' : 'text-slate-800'}`}>
                          {model.__custom && (
                            <Sparkles
                              size={10}
                              className="mr-1 inline-block -translate-y-px text-amber-500"
                            />
                          )}
                          {model.name || stripProvider(model.id)}
                        </p>
                        <p className="truncate font-mono text-[9px] text-slate-400">{model.id}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5 text-[9px] font-mono text-slate-500">
                        {dl && (
                          <span className="inline-flex items-center gap-0.5" title={`${model.downloads} downloads`}>
                            <Download size={9} />
                            {dl}
                          </span>
                        )}
                        {lk && (
                          <span className="inline-flex items-center gap-0.5 text-rose-500" title={`${model.likes} likes`}>
                            <Heart size={9} />
                            {lk}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Active selection (shown only when filtered out) */}
        {selectedModel && !filteredList.find((m) => m.id === modelId) && (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">
            <Check size={11} />
            <span>
              Active: <span className="font-mono font-bold">{modelId}</span>
            </span>
            <span className="ml-auto text-[9px] opacity-70">(filtered out)</span>
          </div>
        )}

        {/* Custom HF model importer — lives below the picker so it doesn't
            push the model list down. Accepts any `org/model-name` id and
            validates server-side. Imported models persist in localStorage
            and jump to the top of the picker with a Sparkles badge. */}
        <div className="space-y-2 rounded-lg border border-dashed border-amber-200 bg-gradient-to-br from-amber-50/60 via-white to-amber-50/60 p-2.5">
          <div className="flex items-center gap-1.5">
            <Sparkles size={12} className="text-amber-600" />
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-amber-700">
              Import custom HF model
            </span>
          </div>
          <p className="text-[10px] leading-snug text-slate-600">
            Don't see your model?{' '}
            <a
              href="https://huggingface.co/models?pipeline_tag=text-generation&sort=trending"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-semibold text-amber-700 underline decoration-amber-300 underline-offset-2 transition hover:text-amber-900 hover:decoration-amber-600"
            >
              Browse on Hugging Face
              <ExternalLink size={9} />
            </a>{' '}
            and paste any{' '}
            <span className="font-mono text-[9.5px] text-slate-700">org/model-name</span> below.
          </p>
          <div className="flex items-stretch gap-1.5">
            <input
              type="text"
              value={customId}
              onChange={(event) => {
                setCustomId(event.target.value);
                if (customError) setCustomError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addCustomModel();
                }
              }}
              placeholder="org/model-name (e.g. meta-llama/Llama-3.1-8B-Instruct)"
              className="flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-mono text-slate-700 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200"
            />
            <button
              type="button"
              onClick={addCustomModel}
              disabled={customLoading || !customId.trim()}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-gradient-to-br from-amber-500 to-amber-600 px-2.5 text-[11px] font-bold text-white shadow-sm transition hover:from-amber-600 hover:to-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {customLoading ? (
                <RefreshCw size={11} className="animate-spin" />
              ) : (
                <Plus size={11} />
              )}
              Import
            </button>
          </div>
          {customError && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
              {customError}
            </p>
          )}
          {customModels.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {customModels.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white/80 py-0.5 pl-1.5 pr-1 text-[10px] font-medium text-amber-800"
                  title={m.id}
                >
                  <Sparkles size={9} className="text-amber-500" />
                  <span className="max-w-[140px] truncate">{m.name || m.id}</span>
                  <button
                    type="button"
                    onClick={() => removeCustomModel(m.id)}
                    className="ml-0.5 rounded-full p-0.5 text-amber-400 hover:bg-amber-100 hover:text-amber-700"
                    aria-label={`Remove ${m.id}`}
                  >
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Fallback model — graceful degradation when the primary model is
            offline or rate-limited (5xx / 429). The gateway retries the
            same prompt transparently against this id. Optional: empty value
            disables the fallback. Same `list` source as the picker so any
            HF top-1000 entry or imported custom model can be the safety
            net. The primary model is filtered out to prevent self-loops. */}
        {(() => {
          const fallbackId = metadata.fallback_model_id || '';
          const fallbackOptions = list.filter((m) => m.id !== modelId);
          const customIds = new Set(customModels.map((m) => m.id));
          const customOpts = fallbackOptions.filter((m) => customIds.has(m.id));
          const hfOpts = fallbackOptions.filter((m) => !customIds.has(m.id));
          const fallbackMeta = list.find((m) => m.id === fallbackId);
          const fallbackUnknown = fallbackId && !fallbackMeta;
          return (
            <div className="space-y-1.5 rounded-lg border border-dashed border-amber-200 bg-gradient-to-br from-amber-50/60 via-white to-orange-50/40 p-2.5">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={12} className="text-amber-600" />
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-amber-700">
                  Fallback model
                </span>
                <span className="ml-auto text-[9.5px] font-medium text-slate-500">
                  Auto-retry on 429 / 5xx
                </span>
              </div>
              <p className="text-[10px] leading-snug text-slate-600">
                If the primary model returns a network error or rate-limit response,
                the gateway silently retries the prompt against this fallback model.
              </p>
              <select
                value={fallbackId}
                onChange={(event) => setMeta('fallback_model_id', event.target.value || null)}
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-mono text-slate-700 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200"
              >
                <option value="">— No fallback (fail loud) —</option>
                {fallbackUnknown && (
                  <option value={fallbackId}>{fallbackId} (not in catalogue)</option>
                )}
                {customOpts.length > 0 && (
                  <optgroup label="Custom imports">
                    {customOpts.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}
                      </option>
                    ))}
                  </optgroup>
                )}
                {hfOpts.length > 0 && (
                  <optgroup label="Hugging Face — Top 1000">
                    {hfOpts.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {fallbackId ? (
                <p className="flex items-center gap-1 text-[10px] font-medium text-amber-800">
                  <ShieldCheck size={10} className="text-amber-600" />
                  Active fallback: <span className="font-mono font-bold">{fallbackId}</span>
                </p>
              ) : (
                <p className="text-[10px] text-slate-500">
                  No fallback — execution halts if the primary model fails.
                </p>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Sampling knobs ──────────────────────────────────────────────── */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
        <SectionHeading>Sampling</SectionHeading>

        <SliderRow
          label="Temperature"
          help="Higher = more creative / random; lower = deterministic, recommended 0.0–0.3 for RAG."
          value={metadata.temperature ?? 0.2}
          onChange={(next) => setMeta('temperature', next)}
          min={0}
          max={2}
          step={0.05}
        />

        <SliderRow
          label="Top P"
          help="Nucleus sampling. 1.0 = disabled, lower = only top-probability tokens."
          value={metadata.top_p ?? 1.0}
          onChange={(next) => setMeta('top_p', next)}
          min={0}
          max={1}
          step={0.05}
        />

        <div>
          <FieldLabel title="Max tokens (output)" help="Maximum response length in tokens." />
          <input
            type="number"
            min={1}
            max={Math.min(8192, selectedModel?.context_length || 8192)}
            value={metadata.max_tokens ?? 1024}
            onChange={(event) => setMeta('max_tokens', Number(event.target.value))}
            className={inputClass}
          />
        </div>

        <div>
          <FieldLabel
            title="Response format"
            help="`text` = plain response; structured options shape the output (schema / template)."
          />
          <select
            value={metadata.response_format || 'text'}
            onChange={(event) => setMeta('response_format', event.target.value)}
            className={inputClass}
          >
            <option value="text">text — Plain text</option>
            <option value="json_object">json_object — Generic JSON</option>
            <option value="json_schema">json_schema — Strict JSON schema</option>
            <option value="markdown">markdown — Structured Markdown</option>
            <option value="latex">latex — Scientific LaTeX</option>
          </select>
        </div>

        {/* Conditional structured-output editor. Only rendered when the
            chosen response_format actually needs extra config — `text` and
            `json_object` (free-form) skip this entirely. */}
        {(() => {
          const fmt = metadata.response_format || 'text';
          if (fmt === 'text' || fmt === 'json_object') return null;
          const sc = metadata.structured_config || {};
          const setSc = (key, next) => {
            setMeta('structured_config', { ...sc, [key]: next });
          };

          if (fmt === 'json_schema') {
            const raw = typeof sc.schema_text === 'string' ? sc.schema_text : '';
            let parseError = null;
            if (raw.trim()) {
              try {
                JSON.parse(raw);
              } catch (err) {
                parseError = err.message;
              }
            }
            return (
              <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/30 p-2">
                <FieldLabel
                  title="JSON Schema Definition"
                  help="OpenAI-compatible JSON Schema. The model generates output strictly bound to it."
                />
                <textarea
                  rows={8}
                  value={raw}
                  onChange={(event) => setSc('schema_text', event.target.value)}
                  spellCheck={false}
                  placeholder={'{\n  "type": "object",\n  "properties": {\n    "result": { "type": "string" }\n  },\n  "required": ["result"]\n}'}
                  className="w-full resize-y rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-emerald-300 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-300/40 placeholder:text-slate-600"
                  style={{ minHeight: 120 }}
                />
                {parseError ? (
                  <p className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                    ⚠ Invalid JSON: {parseError}
                  </p>
                ) : raw.trim() ? (
                  <p className="text-[10px] font-medium text-emerald-700">✓ Valid JSON</p>
                ) : (
                  <p className="text-[10px] text-slate-500">Empty schema — the model can answer freely.</p>
                )}
              </div>
            );
          }

          // markdown / latex template instructions
          const tpl = typeof sc.template_instructions === 'string' ? sc.template_instructions : '';
          const isLatex = fmt === 'latex';
          return (
            <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/30 p-2">
              <FieldLabel
                title="Output Template / Constraints"
                help="The backend appends this text as an instruction to the end of the prompt."
              />
              <textarea
                rows={5}
                value={tpl}
                onChange={(event) => setSc('template_instructions', event.target.value)}
                placeholder={
                  isLatex
                    ? 'e.g. „Use specific LaTeX environment for all formulas (align*, equation). Cite sources with \\\\cite{}.”'
                    : 'e.g. „The answer should be a 3-section Markdown: Introduction, Analysis, Conclusion in table format.”'
                }
                className="w-full resize-y rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-emerald-300 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-300/40 placeholder:text-slate-500"
                style={{ minHeight: 90 }}
              />
              <p className="text-[10px] text-slate-500">
                {tpl.length} characters · {isLatex ? 'LaTeX' : 'Markdown'} mode
              </p>
            </div>
          );
        })()}
      </div>

      {/* ── Advanced settings (Progressive Disclosure) ──────────────────── */}
      {(() => {
        const streaming = metadata.streaming !== undefined ? Boolean(metadata.streaming) : true;
        const stopSeqs = Array.isArray(metadata.stop_sequences) ? metadata.stop_sequences : [];
        const freqPenalty = Number(metadata.frequency_penalty ?? 0.0);
        const presPenalty = Number(metadata.presence_penalty ?? 0.0);
        const seedVal = metadata.seed;
        const seedDisplay = seedVal === null || seedVal === undefined ? '' : String(seedVal);

        const addStopSeq = () => {
          const trimmed = stopInput.trim();
          if (!trimmed) return;
          if (stopSeqs.length >= 4) return;
          if (stopSeqs.includes(trimmed)) {
            setStopInput('');
            return;
          }
          setMeta('stop_sequences', [...stopSeqs, trimmed]);
          setStopInput('');
        };
        const removeStopSeq = (idx) => {
          const next = stopSeqs.slice();
          next.splice(idx, 1);
          setMeta('stop_sequences', next);
        };

        return (
          <div className="rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setAdvancedOpen((open) => !open)}
              aria-expanded={advancedOpen}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-slate-50"
            >
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                <Sliders size={11} className="text-amber-500" />
                Advanced settings
              </span>
              <ChevronDown
                size={14}
                className={`text-slate-400 transition ${advancedOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {advancedOpen && (
              <div className="space-y-4 border-t border-slate-100 px-3 py-3">
                {/* Streaming toggle — same visual idiom as the Citation toggle */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-slate-700">Streaming</p>
                    <p className="text-[10px] leading-snug text-slate-500">
                      Continuous token-level response (lower perceived latency).
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={streaming}
                    onClick={() => setMeta('streaming', !streaming)}
                    className={`relative mt-0.5 inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${
                      streaming ? 'bg-amber-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-[left] duration-200"
                      style={{ left: streaming ? '18px' : '2px' }}
                    />
                  </button>
                </div>

                {/* Stop sequences — tag input, max 4 */}
                <div>
                  <FieldLabel
                    title={`Stop Sequences (${stopSeqs.length}/4)`}
                    help="The LLM stops if it generates these characters. Enter = add."
                  />
                  <div
                    className={`flex flex-wrap items-center gap-1 rounded-lg border bg-white px-1.5 py-1 transition focus-within:border-amber-300 focus-within:ring-2 focus-within:ring-amber-200 ${
                      stopSeqs.length >= 4 ? 'border-slate-200' : 'border-slate-200'
                    }`}
                  >
                    {stopSeqs.map((seq, idx) => (
                      <span
                        key={`${seq}-${idx}`}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 py-0.5 pl-1.5 pr-1 text-[10px] font-mono text-amber-800"
                        title={seq}
                      >
                        <span className="max-w-[120px] truncate">
                          {seq.replace(/\n/g, '\\n').replace(/\t/g, '\\t')}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeStopSeq(idx)}
                          className="rounded-full p-0.5 text-amber-400 hover:bg-amber-100 hover:text-amber-700"
                          aria-label={`Remove: ${seq}`}
                        >
                          <X size={9} />
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={stopInput}
                      onChange={(event) => setStopInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addStopSeq();
                        } else if (event.key === 'Backspace' && !stopInput && stopSeqs.length) {
                          // Quick-delete the last tag when input is empty.
                          removeStopSeq(stopSeqs.length - 1);
                        }
                      }}
                      disabled={stopSeqs.length >= 4}
                      placeholder={
                        stopSeqs.length >= 4
                          ? 'Limit reached (4)'
                          : stopSeqs.length === 0
                            ? 'e.g. \\nUser:, END — Enter'
                            : '+ new…'
                      }
                      className="flex-1 min-w-[80px] bg-transparent px-1 py-0.5 text-[11px] font-mono text-slate-700 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Penalty sliders — reuse the existing SliderRow visual */}
                <SliderRow
                  label="Frequency Penalty"
                  help="Penalizes repeating tokens. Negative = encourages repetition."
                  value={freqPenalty}
                  onChange={(next) => setMeta('frequency_penalty', next)}
                  min={-2}
                  max={2}
                  step={0.1}
                />

                <SliderRow
                  label="Presence Penalty"
                  help="Penalizes already-seen tokens — encourages new topics."
                  value={presPenalty}
                  onChange={(next) => setMeta('presence_penalty', next)}
                  min={-2}
                  max={2}
                  step={0.1}
                />

                {/* Seed input — null/empty = random */}
                <div>
                  <FieldLabel
                    title="Seed"
                    help="Fixed value for deterministic output. Empty = random."
                  />
                  <div className="flex items-stretch gap-1.5">
                    <input
                      type="number"
                      step={1}
                      value={seedDisplay}
                      onChange={(event) => {
                        const raw = event.target.value;
                        if (raw === '') {
                          setMeta('seed', null);
                        } else {
                          const parsed = Number(raw);
                          setMeta('seed', Number.isFinite(parsed) ? Math.trunc(parsed) : null);
                        }
                      }}
                      placeholder="random"
                      className={`flex-1 min-w-0 ${inputClass} font-mono`}
                    />
                    {seedDisplay !== '' && (
                      <button
                        type="button"
                        onClick={() => setMeta('seed', null)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-500 transition hover:border-amber-300 hover:text-amber-700"
                        title="Random seed"
                      >
                        <X size={10} />
                        Random
                      </button>
                    )}
                  </div>
                </div>

                {/* Context overflow strategy — what to do when prompt+chunks
                    exceed the model's context window. Default `strict` so
                    silent truncation never happens by accident. */}
                <div>
                  <FieldLabel
                    title="Context Overflow Strategy"
                    help="What should happen if incoming data (chunks) exceeds the model context limit?"
                  />
                  <select
                    value={metadata.context_overflow_strategy || 'strict'}
                    onChange={(event) => setMeta('context_overflow_strategy', event.target.value)}
                    className={inputClass}
                  >
                    <option value="strict">Strict (Halt pipeline with error)</option>
                    <option value="truncate_middle">Truncate Middle (Drop middle documents)</option>
                    <option value="truncate_end">Truncate End (Drop last documents)</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Inline system prompt fallback ───────────────────────────────── */}
      {!hasSystemPromptUpstream && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <SectionHeading>
            <span className="inline-flex items-center gap-1">
              <ScrollText size={11} /> Inline system prompt (fallback)
            </span>
          </SectionHeading>
          <p className="text-[10px] leading-relaxed text-slate-500">
            💡 Connect a <span className="font-mono">System Prompt</span> node
            for clarity — otherwise this inline text will be used.
          </p>
          <textarea
            rows={4}
            value={value.systemPrompt || ''}
            onChange={(event) => onChange?.('systemPrompt', event.target.value)}
            className={inputClass}
            placeholder="You are a grounded enterprise RAG assistant. Cite [n] for each claim."
          />
        </div>
      )}

      {/* ── Citation toggle ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
        <p className="text-[11px] font-bold text-slate-700">Citation mode</p>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(value.citationMode ?? true)}
          onClick={() => onChange?.('citationMode', !(value.citationMode ?? true))}
          className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${
            (value.citationMode ?? true) ? 'bg-amber-600' : 'bg-slate-300'
          }`}
        >
          <span
            className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-[left] duration-200"
            style={{ left: (value.citationMode ?? true) ? '18px' : '2px' }}
          />
        </button>
      </div>

      {/* ── Read-only payload ───────────────────────────────────────────── */}
      <div>
        <SectionHeading>Output payload (read-only)</SectionHeading>
        <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-emerald-300">
{JSON.stringify(buildLlmPayload(value), null, 2)}
        </pre>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-amber-500" />
        Inputs: <span className="font-mono">text</span> +{' '}
        <span className="font-mono">chunks</span> +{' '}
        <span className="font-mono">system_prompt</span>
      </div>
    </div>
  );
}
