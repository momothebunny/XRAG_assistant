/**
 * EmbeddingSettingsPanel — provider-first embedding model picker.
 *
 * Architecture: registry-driven.  Provider dropdown → Model dropdown → params.
 * Same visual language as the Retriever panel (dropdowns, credential block,
 * API-key modal via createPortal). SKY palette mirrors the `process-embedding`
 * node colour (`bg-sky-900/20 border-sky-700/40 text-sky-400`).
 *
 * BACKEND CONTRACT (canvas nodes depend on these field names):
 *   { gateway, model_id, max_token_capacity, output_dimensions,
 *     is_cached, batch_size, metadata }
 */

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Database,
  Key,
  Layers,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';

import { xragApi } from '../../services/xragApi';

// ─── Provider keys that are handled by shared UI (model dropdown / advanced) ──
const SHARED_EMBEDDING_KEYS = new Set([
  'model_id', 'model', 'batch_size', 'is_cached',
  'output_dimensions', 'max_token_capacity',
]);

// ─── Fallback provider catalog (used when the registry endpoint is down) ──────
const FALLBACK_PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI Embedding',
    badge: 'OpenAI',
    description: 'OpenAI API to generate embeddings for a given text.',
    credentialFields: [
      { env_var: 'OPENAI_API_KEY', label: 'OpenAI API Key', placeholder: 'sk-...', required: true, secret: true },
    ],
    additionalFields: [],
    models: [
      { id: 'text-embedding-3-large', label: 'text-embedding-3-large', dimensions: 3072, maxTokens: 8191 },
      { id: 'text-embedding-3-small', label: 'text-embedding-3-small', dimensions: 1536, maxTokens: 8191 },
      { id: 'text-embedding-ada-002', label: 'text-embedding-ada-002 (Legacy)', dimensions: 1536, maxTokens: 8191 },
    ],
  },
  {
    id: 'cohere',
    label: 'Cohere Embedding',
    badge: 'Cohere',
    description: 'Cohere API to generate embeddings for a given text.',
    credentialFields: [
      { env_var: 'COHERE_API_KEY', label: 'Cohere API Key', placeholder: 'co-...', required: true, secret: true },
    ],
    additionalFields: [
      { key: 'cohereInputType', label: 'Input type', type: 'select',
        options: ['search_document','search_query','classification','clustering'], required: true },
    ],
    models: [
      { id: 'embed-english-v3.0',      label: 'embed-english-v3.0',      dimensions: 1024, maxTokens: 512 },
      { id: 'embed-multilingual-v3.0', label: 'embed-multilingual-v3.0', dimensions: 1024, maxTokens: 512 },
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama Embedding',
    badge: 'Ollama',
    description: 'Generate embeddings using open source model on Ollama.',
    credentialFields: [],
    additionalFields: [
      { key: 'ollamaBaseUrl', label: 'Ollama base URL', type: 'text', placeholder: 'http://localhost:11434', required: true },
    ],
    models: [
      { id: 'nomic-embed-text', label: 'nomic-embed-text', dimensions: 768, maxTokens: 8192 },
      { id: 'mxbai-embed-large', label: 'mxbai-embed-large', dimensions: 1024, maxTokens: 512 },
    ],
  },
];

// ─── Registry loader (singleton promise) ─────────────────────────────────────
let embeddingRegistryPromise = null;
const loadEmbeddingRegistry = (force = false) => {
  if (force || !embeddingRegistryPromise) {
    embeddingRegistryPromise = xragApi
      .fetchEmbeddingProvidersRegistry()
      .then((data) =>
        Array.isArray(data?.providers) && data.providers.length
          ? data.providers
          : FALLBACK_PROVIDERS,
      )
      .catch(() => FALLBACK_PROVIDERS);
  }
  return embeddingRegistryPromise;
};

// ─── Credential helpers ───────────────────────────────────────────────────────
const getCredentialFields = (provider) =>
  Array.isArray(provider?.credentialFields) ? provider.credentialFields : [];

const getRequiredCredentialFields = (provider) =>
  getCredentialFields(provider).filter((f) => f.required !== false);

const getRelevantCredentialKeys = (provider, keys) => {
  const envVars = new Set(getCredentialFields(provider).map((f) => f.env_var));
  return Array.isArray(keys)
    ? keys.filter((k) => k.provider === provider?.id || envVars.has(k.env_var))
    : [];
};

const summarizeCredentialState = (provider, keys) => {
  const fields = getCredentialFields(provider);
  const required = getRequiredCredentialFields(provider);
  const active = new Set(
    getRelevantCredentialKeys(provider, keys)
      .filter((k) => k.is_active !== false)
      .map((k) => k.env_var),
  );
  const requiredReady = required.filter((f) => active.has(f.env_var)).length;
  return {
    hasFields: fields.length > 0,
    requiredCount: required.length,
    requiredReady,
    configured: required.length === 0 || requiredReady === required.length,
  };
};

// ─── Payload builder (exported — canvas runtime depends on shape) ─────────────
export const buildOmniEmbeddingPayload = (config) => {
  const modelId = String(config?.model_id ?? '');
  const ctx  = Number(config?.max_token_capacity ?? 0);
  const dims = Number(config?.output_dimensions ?? 0);
  return {
    gateway: config?.embeddingProvider || 'openai',
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

// ─── Shared atoms (sky palette) ───────────────────────────────────────────────
const inputClass =
  'w-full rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-sky-600/60 focus:ring-2 focus:ring-sky-200/50';
const selectClass =
  'w-full appearance-none rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 pr-7 text-xs text-slate-200 outline-none transition focus:border-sky-600/60 focus:ring-2 focus:ring-sky-200/50';
const modalInputClass =
  'min-w-0 flex-1 rounded-xl border border-slate-700/50 bg-[#161b22] px-3 py-2 font-mono text-xs text-slate-200 outline-none transition focus:border-sky-600/60 focus:ring-1 focus:ring-sky-600/30';

const FieldLabel = ({ title, help, required }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
      {title}{required && <span className="ml-1 text-rose-500">*</span>}
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
        ? 'border-sky-600/60 bg-sky-900/20 text-sky-300 shadow-sm shadow-sky-200/40'
        : 'border-slate-700/50 bg-[#0d1117] text-slate-400 hover:border-sky-700/40 hover:text-sky-400'
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

// ─── Component ────────────────────────────────────────────────────────────────
const EmbeddingSettingsPanel = ({ value = {}, onChange }) => {
  const [providers, setProviders] = useState(FALLBACK_PROVIDERS);
  const [registryLoading, setRegistryLoading] = useState(true);

  const [apiKeys, setApiKeys] = useState([]);
  const [apiModal, setApiModal] = useState(false);
  const [apiError, setApiError] = useState('');
  const [apiSaving, setApiSaving] = useState(false);
  const [selectedExistingKeyId, setSelectedExistingKeyId] = useState('');
  const [apiKeyFields, setApiKeyFields] = useState({});
  const [keyListLoading, setKeyListLoading] = useState(false);
  const keyInputRef = useRef(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRegistryLoading(true);
    loadEmbeddingRegistry()
      .then((list) => { if (!cancelled) setProviders(list); })
      .finally(() => { if (!cancelled) setRegistryLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const provider = useMemo(() => {
    const sel = String(value.embeddingProvider || '').toLowerCase();
    return providers.find((p) => p.id === sel) || providers[0] || null;
  }, [providers, value.embeddingProvider]);

  const providerModels = useMemo(
    () => (Array.isArray(provider?.models) ? provider.models : []),
    [provider],
  );

  const selectedModel = useMemo(
    () => providerModels.find((m) => m.id === value.model_id) || null,
    [providerModels, value.model_id],
  );

  const credentialFields = useMemo(() => getCredentialFields(provider), [provider]);
  const credentialState  = useMemo(() => summarizeCredentialState(provider, apiKeys), [provider, apiKeys]);

  const providerSpecificFields = useMemo(
    () => (Array.isArray(provider?.additionalFields) ? provider.additionalFields : [])
      .filter((f) => !SHARED_EMBEDDING_KEYS.has(f.key)),
    [provider],
  );

  const missingProviderRequired = useMemo(
    () => providerSpecificFields
      .filter((f) => f.required)
      .filter((f) => {
        const raw = value[f.key];
        if (f.type === 'boolean') return raw === undefined || raw === null;
        return raw === undefined || raw === null || String(raw).trim() === '';
      })
      .map((f) => f.label || f.key),
    [providerSpecificFields, value],
  );

  const dims      = (selectedModel?.dimensions ?? Number(value.output_dimensions || 0)) || null;
  const ctx       = (selectedModel?.maxTokens  ?? Number(value.max_token_capacity  || 0)) || null;
  const batchSize = Number(value.batch_size ?? 100);

  useEffect(() => {
    if (!provider || value.embeddingProvider === provider.id) return;
    onChange?.('embeddingProvider', provider.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider?.id]);

  useEffect(() => {
    if (!selectedModel) return;
    if (Number(value.max_token_capacity || 0) !== selectedModel.maxTokens)
      onChange?.('max_token_capacity', selectedModel.maxTokens);
    if (Number(value.output_dimensions || 0) !== selectedModel.dimensions)
      onChange?.('output_dimensions', selectedModel.dimensions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel?.id]);

  const payload = useMemo(() => buildOmniEmbeddingPayload(value), [value]);
  useEffect(() => {
    const nextMeta = JSON.stringify(payload.metadata);
    if (JSON.stringify(value.metadata || null) !== nextMeta)
      onChange?.('metadata', payload.metadata);
    if (value.gateway !== payload.gateway)
      onChange?.('gateway', payload.gateway);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  const setField = (field, val) => onChange?.(field, val);

  const handleProviderChange = (nextId) => {
    const next = providers.find((p) => p.id === nextId);
    setField('embeddingProvider', nextId);
    setField('model_id', next?.models?.[0]?.id || '');
    setField('output_dimensions', next?.models?.[0]?.dimensions ?? null);
    setField('max_token_capacity', next?.models?.[0]?.maxTokens ?? 0);
  };

  const handleModelChange = (nextModelId) => {
    const model = providerModels.find((m) => m.id === nextModelId);
    setField('model_id', nextModelId);
    setField('output_dimensions', model?.dimensions ?? null);
    setField('max_token_capacity', model?.maxTokens ?? 0);
  };

  const refreshKeys = async () => {
    try {
      setKeyListLoading(true);
      const keys = await xragApi.listApiKeys();
      setApiKeys(Array.isArray(keys) ? keys : []);
    } catch {
      setApiKeys([]);
    } finally {
      setKeyListLoading(false);
    }
  };

  const openApiModal = async () => {
    if (!credentialFields.length) return;
    setApiError('');
    setSelectedExistingKeyId('');
    setApiKeyFields(Object.fromEntries(credentialFields.map((f) => [f.env_var, ''])));
    setApiModal(true);
    await refreshKeys();
    setTimeout(() => keyInputRef.current?.focus(), 0);
  };

  const saveApiKeys = async () => {
    try {
      setApiError('');
      setApiSaving(true);
      if (selectedExistingKeyId) {
        await xragApi.activateApiKey(selectedExistingKeyId);
        await refreshKeys();
        setApiModal(false);
        return;
      }
      const toSave = credentialFields.filter((f) => {
        const raw = apiKeyFields[f.env_var];
        return raw !== undefined && raw !== null && String(raw).trim() !== '';
      });
      if (!toSave.length) throw new Error('Please provide at least one credential value.');
      await Promise.all(
        toSave.map((f) =>
          xragApi.upsertApiKey({
            provider: provider?.id,
            env_var: f.env_var,
            value: String(apiKeyFields[f.env_var]).trim(),
            label: `${provider?.label || 'Embedding'} · ${f.label || f.env_var}`,
            is_active: true,
          }),
        ),
      );
      await refreshKeys();
      setApiModal(false);
    } catch (err) {
      setApiError(err?.message || 'Failed to save credentials.');
    } finally {
      setApiSaving(false);
    }
  };

  const warnings = [];
  if (!value.model_id) warnings.push('Pick an embedding model to activate this node.');
  if (!dims && value.model_id) warnings.push('Output dimension unknown — check the model registry or set it in Advanced.');
  if (batchSize < 1 || batchSize > 1024) warnings.push('Batch size should be between 1 and 1024.');
  if (missingProviderRequired.length > 0)
    warnings.push(`Missing required provider settings: ${missingProviderRequired.join(', ')}.`);
  if (credentialState.hasFields && !credentialState.configured)
    warnings.push(`Missing required credentials (${credentialState.requiredReady}/${credentialState.requiredCount}).`);

  return (
    <div className="space-y-3">

      {/* ── Hero card ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-800/50 to-sky-900/70 text-sky-200 ring-1 ring-sky-600/30">
            <Sparkles size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-100">
              {provider?.label || 'No provider selected'}
            </p>
            <p className="truncate font-mono text-[10.5px] text-slate-400">
              {value.model_id || '—'}{dims ? ` · ${dims}d` : ''}{ctx ? ` · ${ctx} ctx` : ''}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            {provider?.badge && (
              <span className="rounded-full border border-sky-700/50 bg-sky-900/30 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-sky-300">
                {provider.badge}
              </span>
            )}
            {dims && <span className="font-mono text-[10px] text-slate-400">{dims}d</span>}
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-400">
          The <span className="font-semibold text-slate-200">vectorisation hop</span> — turns chunks
          into dense vectors. The downstream Vector DB locks its dimension and metric to whatever you
          pick here.
        </p>
      </div>

      {/* ── Provider + Model ──────────────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Database size={12} className="text-sky-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Provider &amp; Model
            </h4>
          </div>
          {registryLoading ? (
            <span className="text-[10px] text-slate-400">loading…</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setRegistryLoading(true);
                loadEmbeddingRegistry(true)
                  .then((list) => setProviders(list))
                  .finally(() => setRegistryLoading(false));
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2 py-1 text-[10px] font-semibold text-slate-300 transition hover:border-sky-600/60 hover:text-sky-300"
            >
              <RefreshCw size={10} />
              Reload
            </button>
          )}
        </header>

        {/* Provider dropdown */}
        <div>
          <FieldLabel title="Provider" help="Select the embedding API provider." />
          <div className="relative">
            <select
              value={provider?.id || ''}
              onChange={(e) => handleProviderChange(e.target.value)}
              className={selectClass}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}{p.badge ? ` (${p.badge})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <p className="mt-1 text-[10px] text-slate-400">{provider?.description || ''}</p>
        </div>

        {/* Model dropdown or free text for custom providers */}
        <div>
          <FieldLabel title="Model" required help="Embedding model for this provider." />
          {providerModels.length > 0 ? (
            <div className="relative">
              <select
                value={value.model_id || ''}
                onChange={(e) => handleModelChange(e.target.value)}
                className={selectClass}
              >
                <option value="">Choose a model…</option>
                {providerModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}{m.dimensions ? ` · ${m.dimensions}d` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          ) : (
            <input
              type="text"
              value={value.model_id || ''}
              onChange={(e) => setField('model_id', e.target.value)}
              placeholder="Enter model name…"
              className={inputClass}
            />
          )}
          {selectedModel && (
            <p className="mt-1 text-[10px] text-slate-400">
              {selectedModel.dimensions ? `${selectedModel.dimensions}d · ` : ''}
              {selectedModel.maxTokens ? `${selectedModel.maxTokens} max tokens` : ''}
            </p>
          )}
        </div>

        {/* Credentials block — always visible */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Provider credentials
              </p>
              {credentialState.hasFields ? (
                <p className={`text-[10px] ${credentialState.configured ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {credentialState.configured
                    ? 'Configured'
                    : `Missing required (${credentialState.requiredReady}/${credentialState.requiredCount})`}
                </p>
              ) : (
                <p className="text-[10px] text-slate-500">No credentials required.</p>
              )}
            </div>
            <button
              type="button"
              onClick={openApiModal}
              disabled={!credentialState.hasFields}
              className="inline-flex items-center gap-1 rounded-lg border border-sky-700/50 bg-sky-900/20 px-2 py-1 text-[10px] font-semibold text-sky-300 transition hover:bg-sky-900/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Key size={10} />
              Manage API Keys
            </button>
          </div>
        </div>

        {/* Provider-specific parameters */}
        {providerSpecificFields.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Provider-specific parameters
            </p>
            <div className="grid grid-cols-1 gap-2 @[280px]:grid-cols-2">
              {providerSpecificFields.map((field) => {
                const raw  = value[field.key];
                const type = field.type || 'text';
                return (
                  <div key={field.key} className={type === 'boolean' ? 'col-span-full' : ''}>
                    {type === 'boolean' ? (
                      <ToggleChip
                        checked={Boolean(raw)}
                        onChange={(next) => setField(field.key, next)}
                        label={field.label || field.key}
                        help={field.help}
                      />
                    ) : (
                      <>
                        <FieldLabel title={field.label || field.key} help={field.help} required={field.required} />
                        {type === 'select' ? (
                          <div className="relative">
                            <select
                              value={raw ?? ''}
                              onChange={(e) => setField(field.key, e.target.value)}
                              className={selectClass}
                            >
                              <option value="">Select…</option>
                              {(field.options || []).map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                            <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                          </div>
                        ) : (
                          <input
                            type={type === 'number' ? 'number' : 'text'}
                            value={raw ?? ''}
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            onChange={(e) => {
                              const next = e.target.value;
                              setField(field.key, type === 'number' && next !== '' ? Number(next) : next);
                            }}
                            placeholder={field.placeholder || ''}
                            className={inputClass}
                          />
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── Snapshot stats ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-sky-700/40 bg-sky-900/15 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck size={14} className="text-sky-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
              Configuration snapshot
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <div className={`rounded-lg border px-2 py-1.5 text-[10px] ${dims ? 'border-sky-700/40 bg-sky-900/20 text-sky-300' : 'border-slate-700/50 bg-[#0d1117] text-slate-400'}`}>
                <div className="flex items-center gap-1"><Sparkles size={10} /><p className="font-bold">Dims</p></div>
                <p className="mt-0.5 font-mono text-[9px]">{dims ? `${dims}d` : '—'}</p>
              </div>
              <div className={`rounded-lg border px-2 py-1.5 text-[10px] ${ctx ? 'border-sky-700/40 bg-sky-900/20 text-sky-300' : 'border-slate-700/50 bg-[#0d1117] text-slate-400'}`}>
                <div className="flex items-center gap-1"><Layers size={10} /><p className="font-bold">Context</p></div>
                <p className="mt-0.5 font-mono text-[9px]">{ctx || '—'}</p>
              </div>
              <div className="rounded-lg border border-slate-700/50 bg-[#0d1117] px-2 py-1.5 text-[10px] text-slate-400">
                <div className="flex items-center gap-1"><Database size={10} /><p className="font-bold">Batch</p></div>
                <p className="mt-0.5 font-mono text-[9px]">{batchSize}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Advanced ───────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300 transition hover:text-sky-400"
        >
          <span className="flex items-center gap-2">
            <Settings2 size={12} className="text-sky-500" />
            Advanced settings
          </span>
          <ChevronDown size={14} className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 rounded-xl border border-dashed border-slate-600/60 bg-slate-800/30 p-2.5">
            <div className="flex flex-wrap gap-1.5">
              <ToggleChip
                checked={Boolean(value.is_cached ?? true)}
                onChange={(next) => setField('is_cached', next)}
                label="enable_cache"
                help="Cache computed vectors — re-indexing the same text is essentially free."
              />
            </div>
            <div>
              <FieldLabel title="batch_size" help="Number of texts per embedding request." />
              <input
                type="number" min={1} max={1024} step={1}
                value={batchSize}
                onChange={(e) => setField('batch_size', Number(e.target.value || 0))}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel title="output_dimensions" help="Override auto-detected dimension (matryoshka / custom endpoints)." />
              <input
                type="number" min={1} max={8192} step={1}
                value={value.output_dimensions ?? ''}
                placeholder={dims ? String(dims) : 'e.g. 1536'}
                onChange={(e) => {
                  const next = e.target.value;
                  setField('output_dimensions', next === '' ? null : Number(next));
                }}
                className={inputClass}
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Validation strip ───────────────────────────────────────────── */}
      {warnings.length > 0 ? (
        <ul className="space-y-1">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 rounded-lg border border-amber-700/40 bg-amber-900/20 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-300">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-1.5 rounded-lg border border-sky-700/40 bg-sky-900/20 px-2.5 py-1.5 text-[10.5px] font-semibold text-sky-300">
          <CheckCircle2 size={11} />
          Configuration valid — ready to embed.
        </div>
      )}

      {/* ── Output payload preview ─────────────────────────────────────── */}
      <details className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-sky-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      {/* ── API key modal ──────────────────────────────────────────────── */}
      {apiModal && provider && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          style={{ zIndex: 2147483647 }}
        >
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-[#0d1117] shadow-2xl">
            <header className="flex items-start justify-between border-b border-slate-700/60 px-4 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">Embedding credentials</p>
                <h3 className="mt-1 text-sm font-bold text-slate-100">{provider.label}</h3>
                <p className="mt-1 text-[11px] text-slate-400">Store credentials server-side and activate them for this provider.</p>
              </div>
              <button
                type="button"
                onClick={() => setApiModal(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700/60 text-slate-300 transition hover:border-sky-600/60 hover:text-sky-300"
              >
                <X size={14} />
              </button>
            </header>

            <div className="max-h-[65vh] space-y-3 overflow-auto px-4 py-3">
              <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Use existing key</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="relative flex-1">
                    <select
                      value={selectedExistingKeyId}
                      onChange={(e) => setSelectedExistingKeyId(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">Select existing credential…</option>
                      {getRelevantCredentialKeys(provider, apiKeys).map((k) => (
                        <option key={k.id} value={k.id}>{k.label || k.env_var}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                  <button
                    type="button"
                    onClick={refreshKeys}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700/60 px-2 py-1 text-[10px] font-semibold text-slate-300 transition hover:border-sky-600/60 hover:text-sky-300"
                  >
                    <RefreshCw size={10} className={keyListLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Create or update credentials</p>
                <div className="mt-2 space-y-2">
                  {credentialFields.map((field, idx) => (
                    <label key={field.env_var} className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold text-slate-300">
                        {field.label || field.env_var}
                        {field.required !== false && <span className="ml-1 text-red-400">*</span>}
                      </span>
                      <input
                        ref={idx === 0 ? keyInputRef : undefined}
                        type={field.secret ? 'password' : 'text'}
                        value={apiKeyFields[field.env_var] ?? ''}
                        onChange={(e) =>
                          setApiKeyFields((prev) => ({ ...prev, [field.env_var]: e.target.value }))
                        }
                        placeholder={field.placeholder || ''}
                        className={modalInputClass}
                      />
                    </label>
                  ))}
                </div>
              </section>

              {apiError && (
                <div className="rounded-lg border border-red-700/50 bg-red-900/20 px-2.5 py-2 text-[11px] text-red-300">
                  {apiError}
                </div>
              )}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-slate-700/60 px-4 py-3">
              <button
                type="button"
                onClick={() => setApiModal(false)}
                className="rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-sky-600/60 hover:text-sky-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveApiKeys}
                disabled={apiSaving}
                className="rounded-lg border border-sky-700/60 bg-sky-900/30 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:bg-sky-900/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {apiSaving ? 'Saving…' : 'Save credentials'}
              </button>
            </footer>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Zap size={11} className="text-sky-400" />
        Output: <span className="font-mono text-sky-400">embedded_chunks</span> → Vector DB / Retriever
      </div>
    </div>
  );
};

export default EmbeddingSettingsPanel;
