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

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import SliderRow from './SliderRow';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Compass,
  Database,
  Filter,
  GitBranch,
  Key,
  Layers,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Sliders,
  Target,
  Wand2,
  X,
  Zap,
} from 'lucide-react';

import { xragApi } from '../../services/xragApi';

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

const FALLBACK_RETRIEVER_PROVIDERS = [
  {
    id: 'vector-store',
    label: 'Vector Store Retriever',
    initials: 'VS',
    badge: 'Default',
    description: 'Search in the connected vector store and return top-k chunks.',
    defaultStrategy: 'similarity',
    allowedStrategies: ['similarity', 'similarity_with_threshold', 'mmr', 'hybrid'],
    credentialFields: [],
    additionalFields: [],
  },
  {
    id: 'aws-bedrock-kb',
    label: 'AWS Bedrock Knowledge Base Retriever',
    initials: 'BK',
    badge: 'AWS',
    description: 'Use AWS Bedrock Knowledge Base for retrieval.',
    defaultStrategy: 'similarity',
    allowedStrategies: ['similarity', 'hybrid'],
    credentialFields: [
      { env_var: 'AWS_ACCESS_KEY_ID', label: 'AWS Access Key ID', required: true, secret: false },
      { env_var: 'AWS_SECRET_ACCESS_KEY', label: 'AWS Secret Access Key', required: true, secret: true },
    ],
    additionalFields: [
      { key: 'bedrockKnowledgeBaseId', label: 'Knowledge Base ID', type: 'text', required: true, placeholder: 'kb-xxxxxxxx' },
      { key: 'bedrockRegion', label: 'AWS Region', type: 'select', required: true, options: ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1'] },
    ],
  },
  {
    id: 'cohere-rerank',
    label: 'Cohere Rerank Retriever',
    initials: 'CO',
    badge: 'Cohere',
    description: 'Rerank retrieved chunks with Cohere.',
    defaultStrategy: 'similarity',
    allowedStrategies: ['similarity', 'mmr'],
    credentialFields: [{ env_var: 'COHERE_API_KEY', label: 'Cohere API Key', required: true, secret: true }],
    additionalFields: [
      { key: 'cohereModel', label: 'Cohere model', type: 'text', required: true, placeholder: 'rerank-v3.5' },
      { key: 'cohereTopN', label: 'Top N', type: 'number', required: true, min: 1, max: 50, step: 1 },
    ],
  },
  {
    id: 'voyage-rerank',
    label: 'Voyage AI Rerank Retriever',
    initials: 'VO',
    badge: 'Voyage',
    description: 'Rerank retrieved chunks with Voyage AI.',
    defaultStrategy: 'similarity',
    allowedStrategies: ['similarity', 'mmr'],
    credentialFields: [{ env_var: 'VOYAGE_API_KEY', label: 'Voyage API Key', required: true, secret: true }],
    additionalFields: [
      { key: 'voyageModel', label: 'Voyage model', type: 'text', required: true, placeholder: 'rerank-2' },
      { key: 'voyageTopN', label: 'Top N', type: 'number', required: true, min: 1, max: 50, step: 1 },
    ],
  },
  {
    id: 'multi-query',
    label: 'Multi Query Retriever',
    initials: 'MQ',
    badge: 'LLM',
    description: 'Generate query variants and merge retrieval results.',
    defaultStrategy: 'hybrid',
    allowedStrategies: ['hybrid', 'similarity'],
    credentialFields: [{ env_var: 'OPENROUTER_API_KEY', label: 'OpenRouter API Key', required: true, secret: true }],
    additionalFields: [{ key: 'variants', label: 'Query variants', type: 'number', required: true, min: 2, max: 12, step: 1 }],
  },
  {
    id: 'hyde',
    label: 'HyDE Retriever',
    initials: 'HD',
    badge: 'LLM',
    description: 'Use hypothetical answer generation before retrieval.',
    defaultStrategy: 'similarity',
    allowedStrategies: ['similarity', 'mmr'],
    credentialFields: [{ env_var: 'OPENROUTER_API_KEY', label: 'OpenRouter API Key', required: true, secret: true }],
    additionalFields: [{ key: 'hydeModel', label: 'HyDE model', type: 'text', required: true, placeholder: 'openai/gpt-4o-mini' }],
  },
  {
    id: 'custom',
    label: 'Custom Retriever',
    initials: 'CR',
    badge: 'Bring your own',
    description: 'Custom retriever endpoint with response mapping.',
    defaultStrategy: 'similarity',
    allowedStrategies: ['similarity', 'similarity_with_threshold', 'mmr', 'hybrid'],
    credentialFields: [{ env_var: 'CUSTOM_RETRIEVER_API_KEY', label: 'Custom API Key', required: false, secret: true }],
    additionalFields: [
      { key: 'customEndpoint', label: 'Endpoint URL', type: 'text', required: true, placeholder: 'https://retriever.example.com/search' },
      { key: 'customPayloadPath', label: 'Results JSON path', type: 'text', required: true, placeholder: 'data.items' },
    ],
  },
];

let retrieverRegistryPromise = null;
const SHARED_RETRIEVER_KEYS = new Set([
  'topK',
  'similarityThreshold',
  'mmrLambda',
  'mmrFetchK',
  'hybridAlpha',
  'includeScores',
  'includeMetadata',
  'metadataFilter',
]);

const loadRetrieverRegistry = (force = false) => {
  if (force || !retrieverRegistryPromise) {
    retrieverRegistryPromise = xragApi
      .fetchRetrieverProvidersRegistry()
      .then((data) => (Array.isArray(data?.providers) && data.providers.length
        ? data.providers
        : FALLBACK_RETRIEVER_PROVIDERS))
      .catch(() => FALLBACK_RETRIEVER_PROVIDERS);
  }
  return retrieverRegistryPromise;
};
const getCredentialFields = (provider) =>
  (Array.isArray(provider?.credentialFields) ? provider.credentialFields : []);

const getRequiredCredentialFields = (provider) =>
  getCredentialFields(provider).filter((field) => field.required !== false);

const getRelevantCredentialKeys = (provider, keys) => {
  const envVars = new Set(getCredentialFields(provider).map((field) => field.env_var));
  return Array.isArray(keys)
    ? keys.filter((key) => key.provider === provider?.id || envVars.has(key.env_var))
    : [];
};

const summarizeCredentialState = (provider, keys) => {
  const fields = getCredentialFields(provider);
  const requiredFields = getRequiredCredentialFields(provider);
  const keyEnvVars = new Set(
    getRelevantCredentialKeys(provider, keys)
      .filter((key) => key.is_active !== false)
      .map((key) => key.env_var),
  );
  const requiredReady = requiredFields.filter((field) => keyEnvVars.has(field.env_var)).length;
  return {
    hasFields: fields.length > 0,
    requiredCount: requiredFields.length,
    requiredReady,
    configured: requiredFields.length === 0 || requiredReady === requiredFields.length,
  };
};

// ─── Shared atoms (cyan palette) ─────────────────────────────────────────
const inputClass =
  'w-full rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50';
const selectClass =
  'w-full appearance-none rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 pr-7 text-xs text-slate-200 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50';
const modalInputClass =
  'min-w-0 flex-1 rounded-xl border border-slate-700/50 bg-[#161b22] px-3 py-2 font-mono text-xs text-slate-200 outline-none transition focus:border-cyan-600/60 focus:ring-1 focus:ring-cyan-600/30';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
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
        ? 'border-cyan-600/60 bg-cyan-900/20 text-cyan-300 shadow-sm shadow-cyan-900/40'
        : 'border-slate-700/50 bg-[#0d1117] text-slate-400 hover:border-cyan-600/60 hover:text-cyan-400'
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
          ? 'border-emerald-700/40 bg-emerald-900/20 text-emerald-300'
          : 'border-slate-700/50 bg-[#0d1117] text-slate-400'
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

// SliderRow imported from ./SliderRow.jsx

// ─── Component ───────────────────────────────────────────────────────────
export default function RetrieverSettingsPanel({
  value = {},
  onChange,
  embeddingProfile,
  vectorStore,
  hasQuerySource,
  upstreamDocConfig,
}) {
  const [providers, setProviders] = useState(FALLBACK_RETRIEVER_PROVIDERS);
  const [registryLoading, setRegistryLoading] = useState(true);
  const [apiKeys, setApiKeys] = useState([]);
  const [apiModal, setApiModal] = useState(false);
  const [apiError, setApiError] = useState('');
  const [apiSaving, setApiSaving] = useState(false);
  const [selectedExistingKeyId, setSelectedExistingKeyId] = useState('');
  const [apiKeyFields, setApiKeyFields] = useState({});
  const [keyListLoading, setKeyListLoading] = useState(false);
  const keyInputRef = useRef(null);

  const hasIndex = Boolean(vectorStore?.provider || embeddingProfile?.modelId);
  const isAwake = hasIndex && hasQuerySource;

  useEffect(() => {
    let cancelled = false;
    setRegistryLoading(true);
    loadRetrieverRegistry()
      .then((list) => {
        if (!cancelled) setProviders(list);
      })
      .finally(() => {
        if (!cancelled) setRegistryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const provider = useMemo(() => {
    const selected = String(value.retrieverProvider || '').toLowerCase();
    return providers.find((entry) => entry.id === selected) || providers[0] || null;
  }, [providers, value.retrieverProvider]);

  const additionalFields = useMemo(
    () => (Array.isArray(provider?.additionalFields) ? provider.additionalFields : []),
    [provider],
  );

  const providerSpecificFields = useMemo(
    () => additionalFields.filter((field) => !SHARED_RETRIEVER_KEYS.has(field.key)),
    [additionalFields],
  );

  const credentialFields = useMemo(() => getCredentialFields(provider), [provider]);
  const requiredCredentialFields = useMemo(() => getRequiredCredentialFields(provider), [provider]);

  useEffect(() => {
    if (!provider || value.retrieverProvider === provider.id) return;
    onChange?.('retrieverProvider', provider.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider?.id]);

  useEffect(() => {
    if (!provider) return;
    const allowed = new Set((provider.allowedStrategies || []).map((item) => String(item).toLowerCase()));
    if (!allowed.size) return;
    if (!allowed.has(String(value.strategy || '').toLowerCase())) {
      onChange?.('strategy', provider.defaultStrategy || [...allowed][0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider?.id, value.strategy]);

  const strategy = useMemo(
    () => STRATEGIES.find((entry) => entry.id === value.strategy) || STRATEGIES[0],
    [value.strategy],
  );

  const strategyOptions = useMemo(() => {
    const allowed = new Set((provider?.allowedStrategies || []).map((item) => String(item).toLowerCase()));
    if (!allowed.size) return STRATEGIES;
    return STRATEGIES.filter((entry) => allowed.has(entry.id));
  }, [provider]);

  const credentialState = useMemo(
    () => summarizeCredentialState(provider, apiKeys),
    [provider, apiKeys],
  );

  const missingAdditionalRequired = useMemo(
    () => providerSpecificFields
      .filter((field) => field.required)
      .filter((field) => {
        const raw = value[field.key];
        if (field.type === 'boolean') return raw === undefined || raw === null;
        return raw === undefined || raw === null || String(raw).trim() === '';
      })
      .map((field) => field.label || field.key),
    [providerSpecificFields, value],
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
    setApiKeyFields(Object.fromEntries(credentialFields.map((field) => [field.env_var, ''])));
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

      const toSave = credentialFields.filter((field) => {
        const raw = apiKeyFields[field.env_var];
        return raw !== undefined && raw !== null && String(raw).trim() !== '';
      });
      if (!toSave.length) {
        throw new Error('Please provide at least one credential value.');
      }

      await Promise.all(toSave.map((field) => xragApi.upsertApiKey({
        provider: provider?.id,
        env_var: field.env_var,
        value: String(apiKeyFields[field.env_var]).trim(),
        label: `${provider?.label || 'Retriever'} · ${field.label || field.env_var}`,
        is_active: true,
      })));
      await refreshKeys();
      setApiModal(false);
    } catch (error) {
      setApiError(error?.message || 'Failed to save credentials.');
    } finally {
      setApiSaving(false);
    }
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

  useEffect(() => {
    const envVars = requiredCredentialFields.map((field) => field.env_var).filter(Boolean);
    if (JSON.stringify(value.providerCredentialEnvVars || []) !== JSON.stringify(envVars)) {
      onChange?.('providerCredentialEnvVars', envVars);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredCredentialFields.map((field) => field.env_var).join('|')]);

  // ─── Sleeping state ────────────────────────────────────────────────────
  if (!isAwake) {
    const missing = [];
    if (!hasQuerySource) missing.push('query (Question / Query Rewriter / HyDE)');
    if (!hasIndex) missing.push('vector index (Vector DB or Embedding)');

    return (
      <div className="space-y-3">
        <div className="rounded-2xl border-2 border-dashed border-cyan-700/50 bg-cyan-900/10 p-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0d1117] shadow-sm ring-1 ring-cyan-700/60">
              <Lock size={18} className="text-cyan-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                Retriever · idle
              </p>
              <p className="text-xs font-semibold text-slate-200">
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
                  ? 'border-emerald-700/40 bg-emerald-900/20 text-emerald-300'
                  : 'border-slate-700/50 bg-[#0d1117] text-slate-400'
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
                  ? 'border-emerald-700/40 bg-emerald-900/20 text-emerald-300'
                  : 'border-slate-700/50 bg-[#0d1117] text-slate-400'
              }`}
            >
              <Database size={12} />
              <span className="font-bold">Vector index</span>
              <span className="ml-auto font-mono text-[10px]">
                {hasIndex ? '✓ connected' : '— missing'}
              </span>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-300">
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
  if (missingAdditionalRequired.length > 0) {
    warnings.push(`Missing required provider settings: ${missingAdditionalRequired.join(', ')}.`);
  }
  if (requiredCredentialFields.length > 0 && !credentialState.configured) {
    warnings.push(`Missing required provider credentials (${credentialState.requiredReady}/${credentialState.requiredCount}).`);
  }

  // ─── Payload preview ───────────────────────────────────────────────────
  const payload = {
    step_type: 'retriever',
    retriever_provider: provider?.id || 'vector-store',
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
      provider_options: Object.fromEntries(
        providerSpecificFields
          .map((field) => [field.key, value[field.key]])
          .filter(([, fieldValue]) => fieldValue !== undefined && fieldValue !== null && String(fieldValue) !== ''),
      ),
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
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-800/50 to-cyan-900/70 text-cyan-200 ring-1 ring-cyan-600/30">
            <Search size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-100">{strategy.label}</p>
            <p className="truncate font-mono text-[10.5px] text-slate-400">
              top-k {value.topK ?? 8} ·{' '}
              {vectorStore?.provider || embeddingProfile?.provider || 'in-memory'}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-cyan-400">
              {value.topK ?? 8} chunks
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              {strategy.badge.toLowerCase()}
            </span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-400">
          The <span className="font-semibold text-slate-200">retrieval hop</span> — embeds
          the query, searches the upstream vector index and returns the top-k chunks for
          the LLM (or a re-ranker downstream).
        </p>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Database size={12} className="text-cyan-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Retriever provider
            </h4>
          </div>
          {registryLoading ? (
            <span className="text-[10px] text-slate-400">loading...</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setRegistryLoading(true);
                loadRetrieverRegistry(true)
                  .then((list) => setProviders(list))
                  .finally(() => setRegistryLoading(false));
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2 py-1 text-[10px] font-semibold text-slate-300 transition hover:border-cyan-600/60 hover:text-cyan-300"
            >
              <RefreshCw size={10} />
              Reload
            </button>
          )}
        </header>

        <div>
          <FieldLabel title="Retriever type" help="Choose a provider-specific retriever implementation." />
          <div className="relative">
            <select
              value={provider?.id || ''}
              onChange={(event) => setField('retrieverProvider', event.target.value)}
              className={selectClass}
            >
              {providers.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}{entry.badge ? ` (${entry.badge})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">{provider?.description || ''}</p>
        </div>

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
                <p className="text-[10px] text-slate-500">This provider does not require credentials.</p>
              )}
            </div>
            <button
              type="button"
              onClick={openApiModal}
              disabled={!credentialState.hasFields}
              className="inline-flex items-center gap-1 rounded-lg border border-cyan-700/50 bg-cyan-900/20 px-2 py-1 text-[10px] font-semibold text-cyan-300 transition hover:bg-cyan-900/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Key size={10} />
              Manage API Keys
            </button>
          </div>
        </div>

        {providerSpecificFields.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Provider-specific parameters
            </p>
            <div className="grid grid-cols-1 gap-2 @[280px]:grid-cols-2">
              {providerSpecificFields.map((field) => {
                const raw = value[field.key];
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
                        <FieldLabel title={field.label || field.key} help={field.help} />
                        {type === 'select' ? (
                          <div className="relative">
                            <select
                              value={raw ?? ''}
                              onChange={(event) => setField(field.key, event.target.value)}
                              className={selectClass}
                            >
                              <option value="">Select...</option>
                              {(field.options || []).map((option) => (
                                <option key={option} value={option}>{option}</option>
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
                            onChange={(event) => {
                              if (type === 'number') {
                                const next = event.target.value;
                                setField(field.key, next === '' ? '' : Number(next));
                              } else {
                                setField(field.key, event.target.value);
                              }
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

      {/* ── Upstream contract ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-cyan-700/40 bg-cyan-900/15 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck size={14} className="text-cyan-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
              Upstream contract · auto-synced
            </p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
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
                  <div className="rounded-lg bg-slate-900/60 px-2 py-1">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-cyan-600">
                      Index
                    </p>
                    <p className="truncate font-mono text-[10px] font-semibold text-slate-100">
                      {vectorStore.indexName}
                      {vectorStore.namespace ? ` · ${vectorStore.namespace}` : ''}
                    </p>
                  </div>
                )}
                {embeddingProfile?.modelId && (
                  <div className="rounded-lg bg-slate-900/60 px-2 py-1">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-cyan-600">
                      Embedding model
                    </p>
                    <p
                      className="truncate font-mono text-[10px] font-semibold text-slate-100"
                      title={embeddingProfile.modelId}
                    >
                      {embeddingProfile.modelId}
                    </p>
                  </div>
                )}
                {(vectorStore?.metric || embeddingProfile?.metric) && (
                  <div className="rounded-lg bg-slate-900/60 px-2 py-1">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-cyan-600">
                      Metric
                    </p>
                    <p className="font-mono text-[10px] font-semibold text-slate-100">
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
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-slate-800/40/40 p-3">
        <header className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Quick presets
          </p>
          {!RETRIEVER_PRESETS.some((p) => p.id === value.preset) && (
            <span className="rounded-full border border-cyan-700/50 bg-[#0d1117] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-400">
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
                className={`group flex flex-col gap-1 rounded-xl border bg-[#0d1117] p-2 text-left transition ${
                  active
                    ? 'border-cyan-600/60 ring-2 ring-cyan-600/60'
                    : 'border-slate-700/50 hover:border-cyan-600/60'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md transition ${
                      active
                        ? 'bg-cyan-900/40 text-cyan-300'
                        : 'bg-slate-800/60 text-slate-400 group-hover:bg-cyan-900/30 group-hover:text-cyan-400'
                    }`}
                  >
                    <Icon size={11} />
                  </span>
                  <span className={`text-[11px] font-bold ${active ? 'text-cyan-200' : 'text-slate-200'}`}>
                    {preset.label}
                  </span>
                </div>
                <span className="text-[9.5px] leading-snug text-slate-400">
                  {preset.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Strategy picker ─────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Compass size={12} className="text-cyan-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Search strategy
          </h4>
        </header>
        <div className="relative">
          <select
            value={strategy.id}
            onChange={(event) => setField('strategy', event.target.value)}
            className={selectClass}
          >
            {strategyOptions.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label} ({entry.badge})
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
        <p className="text-[10px] leading-relaxed text-slate-400">{strategy.description}</p>
      </section>

      {/* ── Strategy-specific knobs ─────────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Sliders size={12} className="text-cyan-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
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
            accentColor="#22d3ee"
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
            accentColor="#22d3ee"
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
            accentColor="#22d3ee"
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
            accentColor="#22d3ee"
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
            accentColor="#22d3ee"
          />
        )}
      </section>

      {/* ── Output shaping ──────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Filter size={12} className="text-cyan-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
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
          {upstreamDocConfig && upstreamDocConfig.scope === 'folders' && upstreamDocConfig.selectedFolders.length > 0 && (
            <div className="mb-2 rounded-lg border border-cyan-700/40 bg-cyan-900/15 px-2.5 py-2 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-cyan-300 flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="inline-block shrink-0"><path d="M2 4a1 1 0 011-1h4l1 1.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" fill="currentColor" opacity="0.8"/></svg>
                  Upstream folders detected
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const filter = JSON.stringify({
                      source_label: upstreamDocConfig.source_label,
                      folder: upstreamDocConfig.selectedFolders,
                    });
                    setField('metadataFilter', filter);
                  }}
                  className="text-[10px] font-black uppercase tracking-wider rounded-md px-2 py-0.5 bg-cyan-800/60 text-cyan-200 hover:bg-cyan-700/70 transition-colors"
                >
                  Apply
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {upstreamDocConfig.selectedFolders.map((folder) => (
                  <span key={folder} className="inline-flex items-center gap-0.5 rounded-md border border-cyan-700/50 bg-cyan-900/30 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300">
                    {folder}
                  </span>
                ))}
              </div>
              <p className="text-[9.5px] text-slate-400 leading-snug">
                Click <span className="font-bold text-cyan-400">Apply</span> to generate a metadata filter that restricts retrieval to these folders.
              </p>
            </div>
          )}
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
              className="flex items-start gap-1.5 rounded-lg border border-amber-700/40 bg-amber-900/20 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-300"
            >
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-2.5 py-1.5 text-[10.5px] font-semibold text-emerald-300">
          <CheckCircle2 size={11} />
          Configuration valid — ready to retrieve.
        </div>
      )}

      {/* ── Output payload preview ──────────────────────────────────────── */}
      <details className="rounded-2xl border border-slate-700/50 bg-slate-800/40/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-cyan-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

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
                <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400">Retriever credentials</p>
                <h3 className="mt-1 text-sm font-bold text-slate-100">{provider.label}</h3>
                <p className="mt-1 text-[11px] text-slate-400">Store credentials server-side and activate them for this provider.</p>
              </div>
              <button
                type="button"
                onClick={() => setApiModal(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700/60 text-slate-300 transition hover:border-cyan-600/60 hover:text-cyan-300"
              >
                <X size={14} />
              </button>
            </header>

            <div className="max-h-[65vh] space-y-3 overflow-auto px-4 py-3">
              <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Use existing key</p>
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={selectedExistingKeyId}
                    onChange={(event) => setSelectedExistingKeyId(event.target.value)}
                    className={selectClass}
                  >
                    <option value="">Select existing credential...</option>
                    {getRelevantCredentialKeys(provider, apiKeys).map((key) => (
                      <option key={key.id} value={key.id}>{key.label || key.env_var}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={refreshKeys}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700/60 px-2 py-1 text-[10px] font-semibold text-slate-300 transition hover:border-cyan-600/60 hover:text-cyan-300"
                  >
                    <RefreshCw size={10} className={keyListLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Create or update credentials</p>
                <div className="mt-2 space-y-2">
                  {credentialFields.map((field, index) => (
                    <label key={field.env_var} className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold text-slate-300">
                        {field.label || field.env_var} {field.required !== false ? <span className="text-red-400">*</span> : null}
                      </span>
                      <input
                        ref={index === 0 ? keyInputRef : undefined}
                        type={field.secret ? 'password' : 'text'}
                        value={apiKeyFields[field.env_var] ?? ''}
                        onChange={(event) => setApiKeyFields((prev) => ({ ...prev, [field.env_var]: event.target.value }))}
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
                className="rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-cyan-600/60 hover:text-cyan-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveApiKeys}
                disabled={apiSaving}
                className="rounded-lg border border-cyan-700/60 bg-cyan-900/30 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-900/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {apiSaving ? 'Saving...' : 'Save credentials'}
              </button>
            </footer>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Zap size={11} className="text-cyan-400" />
        Output: <span className="font-mono text-cyan-400">chunks</span> +{' '}
        <span className="font-mono text-cyan-400">scores</span> → Reranker / LLM
      </div>
    </div>
  );
}
