/**
 * LLMSettingsPanel — OpenRouter / HuggingFace-backed chat-completion node.
 *
 * Visual language: same modern atoms as User / Question / Response panels
 * (hero card, upstream contract pills, quick-preset grid, sectioned cards,
 * ToggleChip pills, range sliders, validation strip, payload preview),
 * AMBER / YELLOW palette to mirror the brain-llm node colour
 * (`bg-amber-50 border-amber-200 text-amber-700`).
 *
 * RICH MODEL BROWSER (restored)
 *   • Loads the curated Top-1000 HuggingFace text-generation models from
 *     the server proxy (`GET /api/models/hf-chat?limit=1000`).
 *   • Virtualised scroller (52 px row height) so 1 000 entries render
 *     without lagging React.
 *   • Search + sort (downloads / likes / recent / name) + provider filter
 *     dropdown (OpenAI, Anthropic, Meta, Mistral, …).
 *   • Custom HF model import (`POST /api/models/hf-model?model_id=…`)
 *     persisted to localStorage; flagged with a Sparkles badge in the list.
 *   • Hides ids the Health Dashboard has marked as unsupported (via the
 *     `xrag.health.unsupported` localStorage key + `xrag:unsupported-models`
 *     same-tab event), but never hides the currently selected one.
 *   • Fallback model picker (silent retry on 429 / 5xx).
 *
 * BACKEND CONTRACT (UNCHANGED — backend canvas runner depends on it)
 *   step_type = "llm"
 *   gateway   = "backend_proxy"
 *   metadata  = {
 *     model_id, fallback_model_id, temperature, max_tokens, top_p,
 *     response_format, streaming, stop_sequences, frequency_penalty,
 *     presence_penalty, seed, context_overflow_strategy, structured_config?
 *   }
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Cloud,
  Compass,
  Database,
  Download,
  ExternalLink,
  Flame,
  Heart,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Star,
  Target,
  Type,
  Wand2,
  X,
  Zap,
} from 'lucide-react';

import { xragApi } from '../../services/xragApi';
import { getProviderLogo, hasProviderLogo } from '../../data/providerLogos';

// ─── Curated fallback (only used when the proxy is unreachable) ─────────
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

// ─── Sort options for the model picker ──────────────────────────────────
const SORT_OPTIONS = [
  { key: 'downloads', label: 'Most downloaded', short: 'Downloads', accent: 'amber',  Icon: Download },
  { key: 'likes',     label: 'Most liked',      short: 'Likes',     accent: 'rose',   Icon: Heart    },
  { key: 'recent',    label: 'Recently updated',short: 'Recent',    accent: 'sky',    Icon: Calendar },
  { key: 'name',      label: 'Name (A → Z)',    short: 'Name',      accent: 'slate',  Icon: Type     },
];

const SORT_ACCENTS = {
  amber:  { ring: 'border-amber-300 bg-amber-50 text-amber-800',     dot: 'bg-amber-500',   soft: 'text-amber-600'  },
  rose:   { ring: 'border-rose-300 bg-rose-50 text-rose-800',         dot: 'bg-rose-500',    soft: 'text-rose-600'   },
  sky:    { ring: 'border-sky-300 bg-sky-50 text-sky-800',            dot: 'bg-sky-500',     soft: 'text-sky-600'    },
  slate:  { ring: 'border-slate-300 bg-slate-100 text-slate-800',     dot: 'bg-slate-500',   soft: 'text-slate-600'  },
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

// ─── Provider visual identity ───────────────────────────────────────────
const PROVIDER_STYLE = {
  openai:        { label: 'OpenAI',         dot: 'bg-emerald-500', solid: 'bg-emerald-600 text-white border-emerald-600' },
  anthropic:     { label: 'Anthropic',      dot: 'bg-orange-500',  solid: 'bg-orange-500 text-white border-orange-500'   },
  google:        { label: 'Google',         dot: 'bg-sky-500',     solid: 'bg-sky-600 text-white border-sky-600'         },
  'meta-llama':  { label: 'Meta Llama',     dot: 'bg-blue-600',    solid: 'bg-blue-600 text-white border-blue-600'       },
  mistralai:     { label: 'Mistral',        dot: 'bg-orange-600',  solid: 'bg-orange-600 text-white border-orange-600'   },
  Qwen:          { label: 'Qwen',           dot: 'bg-purple-500',  solid: 'bg-purple-600 text-white border-purple-600'   },
  'deepseek-ai': { label: 'DeepSeek',       dot: 'bg-indigo-500',  solid: 'bg-indigo-600 text-white border-indigo-600'   },
  deepseek:      { label: 'DeepSeek',       dot: 'bg-indigo-500',  solid: 'bg-indigo-600 text-white border-indigo-600'   },
  'x-ai':        { label: 'xAI Grok',       dot: 'bg-slate-700',   solid: 'bg-slate-700 text-white border-slate-700'     },
  cohere:        { label: 'Cohere',         dot: 'bg-pink-500',    solid: 'bg-pink-600 text-white border-pink-600'       },
  perplexity:    { label: 'Perplexity',     dot: 'bg-teal-500',    solid: 'bg-teal-600 text-white border-teal-600'       },
  microsoft:     { label: 'Microsoft',      dot: 'bg-blue-500',    solid: 'bg-blue-500 text-white border-blue-500'       },
  nvidia:        { label: 'NVIDIA',         dot: 'bg-lime-500',    solid: 'bg-lime-600 text-white border-lime-600'       },
  nousresearch:  { label: 'Nous Research',  dot: 'bg-fuchsia-500', solid: 'bg-fuchsia-600 text-white border-fuchsia-600' },
  HuggingFaceH4: { label: 'HuggingFace H4', dot: 'bg-amber-500',   solid: 'bg-amber-600 text-white border-amber-600'     },
};

const DEFAULT_PROVIDER_STYLE = {
  label: null,
  dot: 'bg-slate-400',
  solid: 'bg-slate-500 text-white border-slate-500',
};

const providerStyle = (id) => PROVIDER_STYLE[id] || DEFAULT_PROVIDER_STYLE;
const providerLabel = (id) => providerStyle(id).label || id;

const formatCount = (n) => {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
};

const stripProvider = (id) => String(id || '').split('/').slice(1).join('/') || id;

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
  { value: 'text',        label: 'Plain text',  hint: 'Free-form natural language.' },
  { value: 'markdown',    label: 'Markdown',    hint: 'Hint the LLM to emit Markdown.' },
  { value: 'json_object', label: 'JSON object', hint: 'Strict valid JSON (free schema).' },
  { value: 'json_schema', label: 'JSON schema', hint: 'JSON validated against a schema.' },
  { value: 'latex',       label: 'LaTeX',       hint: 'Equations / scientific output.' },
];

const OVERFLOW_STRATEGIES = [
  { value: 'strict',          label: 'Strict — fail on overflow' },
  { value: 'truncate_middle', label: 'Truncate middle of context' },
  { value: 'truncate_end',    label: 'Truncate end of context' },
];

const LLM_PRESETS = [
  {
    id: 'precise',
    label: 'Precise',
    description: 'Low temperature, factual.',
    icon: Target,
    overrides: {
      temperature: 0.05, top_p: 1.0, max_tokens: 1024,
      response_format: 'text', streaming: true,
      frequency_penalty: 0.0, presence_penalty: 0.0,
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Default RAG settings.',
    icon: Compass,
    overrides: {
      temperature: 0.2, top_p: 1.0, max_tokens: 1024,
      response_format: 'text', streaming: true,
      frequency_penalty: 0.0, presence_penalty: 0.0,
    },
  },
  {
    id: 'creative',
    label: 'Creative',
    description: 'Higher temperature, longer.',
    icon: Wand2,
    overrides: {
      temperature: 0.8, top_p: 0.95, max_tokens: 2048,
      response_format: 'markdown', streaming: true,
      frequency_penalty: 0.2, presence_penalty: 0.2,
    },
  },
  {
    id: 'json',
    label: 'JSON Tool',
    description: 'Structured JSON output.',
    icon: Sliders,
    overrides: {
      temperature: 0.0, top_p: 1.0, max_tokens: 1024,
      response_format: 'json_object', streaming: false,
      frequency_penalty: 0.0, presence_penalty: 0.0,
    },
  },
];

// ─── Public payload builder (UNCHANGED — backend depends on it) ──────────
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
  // ── Catalogue / browser state ──────────────────────────────────────────
  const [models, setModels] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [providerOpen, setProviderOpen] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [sortBy, setSortBy] = useState('downloads');
  const [sortOpen, setSortOpen] = useState(false);

  // Custom HF model imports persisted to localStorage.
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

  // Health dashboard — unsupported model ids to hide from the picker.
  const [unsupportedSet, setUnsupportedSet] = useState(() => {
    try {
      const raw = localStorage.getItem('xrag.health.unsupported');
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  });

  // Advanced section + stop-sequences tag editor.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [stopInput, setStopInput] = useState('');

  // Virtualisation — fixed row height, small overscan.
  const ROW_HEIGHT = 52;
  const VIEWPORT_HEIGHT = 360;
  const OVERSCAN = 4;
  const listRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const providerMenuRef = useRef(null);
  const sortMenuRef = useRef(null);

  const metadata = value.metadata || {};
  const modelId = metadata.model_id || 'openai/gpt-4o';

  // ── Effects ────────────────────────────────────────────────────────────
  // Debounce search (1 000-row dataset → re-filter on every keystroke is wasteful).
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery), 150);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  // Persist custom models.
  useEffect(() => {
    try {
      localStorage.setItem('xrag.llm.customModels', JSON.stringify(customModels));
    } catch { /* quota / disabled — fail silently */ }
  }, [customModels]);

  // Live-sync unsupported model list (Health Dashboard updates it).
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
      } catch { /* malformed — keep previous */ }
    };
    window.addEventListener('xrag:unsupported-models', onSameTab);
    window.addEventListener('storage', onCrossTab);
    return () => {
      window.removeEventListener('xrag:unsupported-models', onSameTab);
      window.removeEventListener('storage', onCrossTab);
    };
  }, []);

  // Outside-click for the provider dropdown.
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

  // Outside-click for the sort dropdown.
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

  // ── Catalogue refresh ──────────────────────────────────────────────────
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
  useEffect(() => { refresh(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // ── Custom HF model import ─────────────────────────────────────────────
  const setMeta = (key, next) => {
    onChange?.('metadata', { ...metadata, [key]: next });
    if (value.preset && value.preset !== 'custom') onChange?.('preset', 'custom');
  };

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
      setMeta('model_id', projected.id);
      setCustomId('');
    } catch (err) {
      let detail = err?.message || 'Failed to fetch model.';
      try {
        const parsed = JSON.parse(detail);
        if (parsed?.detail) detail = parsed.detail;
      } catch { /* not JSON */ }
      setCustomError(String(detail));
    } finally {
      setCustomLoading(false);
    }
  };
  const removeCustomModel = (id) =>
    setCustomModels((prev) => prev.filter((m) => m.id !== id));

  const applyPreset = (presetId) => {
    const preset = LLM_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onChange?.('preset', preset.id);
    onChange?.('metadata', { ...metadata, ...preset.overrides });
  };

  // ── Catalogue + filtering ──────────────────────────────────────────────
  const catalogue = models || FALLBACK_MODELS;

  // Merge custom models in front of the catalogue. Hide unsupported ids,
  // but never hide the currently selected model (otherwise the picker
  // would silently contradict the saved config).
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
    if (modelId && !seen.has(modelId)) {
      out.unshift({ id: modelId, name: modelId, __custom: true, downloads: 0, likes: 0 });
    }
    return out;
  }, [catalogue, customModels, unsupportedSet, modelId]);

  const selectedModel = list.find((m) => m.id === modelId);

  const providers = useMemo(() => {
    const counts = new Map();
    for (const m of list) {
      const provider = String(m.id || '').split('/')[0] || 'unknown';
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

  // Reset scroll when the filter narrows the list.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [providerFilter, debouncedSearch, sortBy]);

  const totalHeight = filteredList.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    filteredList.length,
    Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN,
  );
  const visibleSlice = filteredList.slice(startIndex, endIndex);
  const offsetY = startIndex * ROW_HEIGHT;

  // Stop-sequences --------------------------------------------------------
  const stopSeqs = Array.isArray(metadata.stop_sequences) ? metadata.stop_sequences : [];
  const addStopSeq = () => {
    const v = stopInput.trim();
    if (!v || stopSeqs.includes(v) || stopSeqs.length >= 4) return;
    setMeta('stop_sequences', [...stopSeqs, v]);
    setStopInput('');
  };
  const removeStopSeq = (s) =>
    setMeta('stop_sequences', stopSeqs.filter((x) => x !== s));

  // Validation ------------------------------------------------------------
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
  const provider = String(modelId).split('/')[0] || 'unknown';
  const displayName = selectedModel?.name || stripProvider(modelId);

  // ─── Sleeping state (no query upstream) ────────────────────────────────
  if (!hasQuerySource) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/40 p-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-amber-200">
              <Lock size={18} className="text-amber-600" />
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
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
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
          consumed by downstream nodes.
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
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <UpstreamPill label="Query" ok={hasQuerySource} hint={hasQuerySource ? 'connected' : 'missing'} Icon={Search} />
              <UpstreamPill label="Chunks" ok={hasChunksUpstream} hint={hasChunksUpstream ? `${upstreamChunkCount || '?'} found` : 'optional'} Icon={Database} />
              <UpstreamPill label="Sys-Prompt" ok={hasSystemPromptUpstream} hint={hasSystemPromptUpstream ? 'wired' : 'inline only'} Icon={Sparkles} />
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
                  <span className={`text-[11px] font-bold ${active ? 'text-amber-800' : 'text-slate-700'}`}>
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

      {/* ── Rich Model Browser ──────────────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3 shadow-sm">
        {/* HF Top-1000 banner */}
        <div className="relative overflow-hidden rounded-xl border border-amber-200/70 bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 px-3 py-2 shadow-inner">
          <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br from-amber-300/40 to-yellow-300/30 blur-xl" />
          <div className="relative flex items-center gap-2.5">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 text-white shadow-md ring-1 ring-amber-300/60">
              <Flame size={14} className="drop-shadow-sm" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-amber-800">
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

        {/* Section header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Brain size={12} className="text-amber-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Model
            </h4>
            <span className="rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-bold text-amber-700">
              {filteredList.length}/{list.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => refresh(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
          >
            <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {loadError && (
          <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
            <AlertTriangle size={10} className="mt-0.5 shrink-0" />
            {loadError}
          </p>
        )}

        {/* Toolbar: search + sort */}
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
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
                                onClick={() => { setSortBy(opt.key); setSortOpen(false); }}
                                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                                  isActive ? `${optAccent.ring} font-semibold` : 'text-slate-700 hover:bg-slate-50'
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

        {/* Provider dropdown */}
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
              <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-500">
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
                  {isAll ? <span className="text-[9px] font-black">∀</span> : <Check size={11} />}
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
                    <button
                      type="button"
                      role="option"
                      aria-selected={isAll}
                      onClick={() => { setProviderFilter('all'); setProviderOpen(false); setProviderSearch(''); }}
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition ${
                        isAll ? 'bg-amber-50 text-amber-900' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-amber-100 text-[9px] font-black text-amber-700">∀</span>
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
                    {visibleProviders.map((p) => {
                      const style = providerStyle(p.id);
                      const active = providerFilter === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => { setProviderFilter(p.id); setProviderOpen(false); setProviderSearch(''); }}
                          className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition ${
                            active ? 'bg-amber-50 text-amber-900' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} aria-hidden />
                          <span className="flex-1 truncate">
                            <span className="font-bold">{providerLabel(p.id)}</span>
                            {providerLabel(p.id) !== p.id && (
                              <span className="ml-1.5 font-mono text-[9px] text-slate-400">
                                {p.id}
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-[9px] text-slate-500">{p.count}</span>
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

        {/* Virtualised model list */}
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
                  const prov = String(model.id || '').split('/')[0];
                  const style = providerStyle(prov);
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
                          hasProviderLogo(prov)
                            ? 'bg-white ring-1 ring-slate-200'
                            : `text-white ${style.dot}`
                        }`}
                        aria-hidden
                      >
                        {hasProviderLogo(prov) ? (
                          getProviderLogo(prov, 18)
                        ) : (
                          <span className="text-[9px] font-black">
                            {providerLabel(prov).slice(0, 2).toUpperCase()}
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
                      <div className="flex shrink-0 flex-col items-end gap-0.5 font-mono text-[9px] text-slate-500">
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

        {selectedModel && !filteredList.find((m) => m.id === modelId) && (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">
            <Check size={11} />
            <span>Active: <span className="font-mono font-bold">{modelId}</span></span>
            <span className="ml-auto text-[9px] opacity-70">(filtered out)</span>
          </div>
        )}

        {/* Custom HF model importer */}
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
                if (event.key === 'Enter') { event.preventDefault(); addCustomModel(); }
              }}
              placeholder="org/model-name (e.g. meta-llama/Llama-3.1-8B-Instruct)"
              className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-700 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200"
            />
            <button
              type="button"
              onClick={addCustomModel}
              disabled={customLoading || !customId.trim()}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-gradient-to-br from-amber-500 to-amber-600 px-2.5 text-[11px] font-bold text-white shadow-sm transition hover:from-amber-600 hover:to-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {customLoading ? <RefreshCw size={11} className="animate-spin" /> : <Plus size={11} />}
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

        {/* Fallback model picker */}
        {(() => {
          const fallbackId = metadata.fallback_model_id || '';
          const fallbackOptions = list.filter((m) => m.id !== modelId);
          const customIds = new Set(customModels.map((m) => m.id));
          const customOpts = fallbackOptions.filter((m) => customIds.has(m.id));
          const hfOpts = fallbackOptions.filter((m) => !customIds.has(m.id));
          const fallbackMeta = list.find((m) => m.id === fallbackId);
          const fallbackUnknown = fallbackId && !fallbackMeta;
          return (
            <div className="space-y-1.5 rounded-lg border border-dashed border-amber-200 bg-gradient-to-br from-amber-50/60 via-white to-yellow-50/40 p-2.5">
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
                If the primary model returns a network error or rate-limit response, the
                gateway silently retries the prompt against this fallback model.
              </p>
              <select
                value={fallbackId}
                onChange={(event) => setMeta('fallback_model_id', event.target.value || null)}
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-700 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200"
              >
                <option value="">— No fallback (fail loud) —</option>
                {fallbackUnknown && (
                  <option value={fallbackId}>{fallbackId} (not in catalogue)</option>
                )}
                {customOpts.length > 0 && (
                  <optgroup label="Custom imports">
                    {customOpts.map((m) => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </optgroup>
                )}
                {hfOpts.length > 0 && (
                  <optgroup label="Hugging Face — Top 1000">
                    {hfOpts.map((m) => (
                      <option key={m.id} value={m.id}>{m.id}</option>
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
          min={0} max={2} step={0.05}
          onChange={(v) => setMeta('temperature', v)}
          format={(v) => v.toFixed(2)}
        />
        <SliderRow
          label="Top-p (nucleus)"
          help="Sample from the smallest set whose total probability ≥ p."
          value={Number(metadata.top_p ?? 1.0)}
          min={0} max={1} step={0.05}
          onChange={(v) => setMeta('top_p', v)}
          format={(v) => v.toFixed(2)}
        />
        <SliderRow
          label="Max tokens"
          help="Hard cap on completion length."
          value={Number(metadata.max_tokens ?? 1024)}
          min={64} max={8192} step={64}
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
              min={-2} max={2} step={0.1}
              onChange={(v) => setMeta('frequency_penalty', v)}
              format={(v) => v.toFixed(1)}
            />
            <SliderRow
              label="Presence penalty"
              help="Penalises tokens already in the text (-2 .. 2)."
              value={Number(metadata.presence_penalty ?? 0)}
              min={-2} max={2} step={0.1}
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
                    if (event.key === 'Enter') { event.preventDefault(); addStopSeq(); }
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
              <FieldLabel title="Context overflow strategy" />
              <select
                value={metadata.context_overflow_strategy || 'strict'}
                onChange={(event) => setMeta('context_overflow_strategy', event.target.value)}
                className={inputClass}
              >
                {OVERFLOW_STRATEGIES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
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
