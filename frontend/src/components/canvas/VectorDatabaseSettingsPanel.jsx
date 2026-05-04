/**
 * VectorDatabaseSettingsPanel — LangFlow-inspired vector store inspector.
 *
 * Visual language: same modern atoms as the LLM / Retriever panels
 * (hero card, upstream contract pills, quick-preset grid, sectioned cards,
 * ToggleChip pills, validation strip, payload preview, footer),
 * EMERALD palette to mirror the storage-vector node colour
 * (`bg-emerald-50 border-emerald-200 text-emerald-700`).
 *
 * UX contract:
 *   • SLEEPING when no upstream Embedding node is connected — the panel
 *     refuses any data so a misconfigured vector index can't ship.
 *   • AWAKE when an Embedding profile is provided — full provider catalog
 *     reveals; output dimension and (suggested) metric are LOCKED to the
 *     upstream model so dimension mismatches are impossible by construction.
 *
 * SECURITY:
 *   We never collect or store provider API keys in the browser. The user
 *   only picks an environment variable NAME (e.g. PINECONE_API_KEY) and the
 *   backend reads the secret from its own environment.
 *
 * BACKEND CONTRACT (UNCHANGED — `default_config` of `storage-vector` in
 * `backend/app/canvas/nodes.py` depends on these field names):
 *   { provider, indexName, namespace, collection, metric, dimensions,
 *     cloud, region, environment, persistDirectory, url,
 *     shards, replicas, hybridSearch, metadataFields, upsertBatchSize,
 *     apiKeyEnvVar, embeddingProfile }
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Cloud,
  Compass,
  Database,
  Globe,
  HardDrive,
  Layers,
  Lock,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

import { xragApi } from '../../services/xragApi';

// ─── FALLBACK provider catalog ───────────────────────────────────────────
// Real source of truth: `backend/data/vector_providers_registry.json`
// fetched via `xragApi.fetchVectorProvidersRegistry()`. This baked-in copy
// is only used when the backend is unreachable so the panel never empties.
const FALLBACK_REGISTRY = {
  providers: [
    { id: 'pinecone', label: 'Pinecone', badge: 'Managed',     description: 'Serverless or pod-based managed vector DB.',         fields: ['indexName', 'namespace', 'cloud', 'region', 'environment', 'apiKeyEnvVar', 'hybridSearch'], supportedMetrics: ['cosine', 'dotproduct', 'euclidean'], defaultApiKeyEnvVar: 'PINECONE_API_KEY' },
    { id: 'chroma',   label: 'Chroma',   badge: 'Local · OSS', description: 'Embeddable, runs in-process or via local server.',   fields: ['collection', 'persistDirectory', 'url'],                                              supportedMetrics: ['cosine', 'l2', 'ip'],               defaultApiKeyEnvVar: null },
    { id: 'qdrant',   label: 'Qdrant',   badge: 'OSS · Hybrid',description: 'High-perf Rust DB with native sparse + dense hybrid.', fields: ['collection', 'url', 'apiKeyEnvVar', 'shards', 'replicas', 'hybridSearch'],         supportedMetrics: ['cosine', 'euclidean', 'dot'],       defaultApiKeyEnvVar: 'QDRANT_API_KEY' },
    { id: 'weaviate', label: 'Weaviate', badge: 'Hybrid · OSS',description: 'GraphQL-native, hybrid search with BM25 baked in.',  fields: ['collection', 'url', 'apiKeyEnvVar', 'hybridSearch'],                                  supportedMetrics: ['cosine', 'l2-squared', 'dot'],      defaultApiKeyEnvVar: 'WEAVIATE_API_KEY' },
    { id: 'milvus',   label: 'Milvus',   badge: 'OSS · Scale', description: 'Distributed billion-scale vector store.',            fields: ['collection', 'url', 'shards', 'replicas'],                                            supportedMetrics: ['cosine', 'l2', 'ip'],               defaultApiKeyEnvVar: null },
    { id: 'pgvector', label: 'pgvector', badge: 'Postgres',    description: 'Bring vector search to existing Postgres.',          fields: ['indexName', 'url', 'apiKeyEnvVar'],                                                   supportedMetrics: ['cosine', 'l2', 'ip'],               defaultApiKeyEnvVar: 'POSTGRES_URL' },
    { id: 'faiss',    label: 'FAISS',    badge: 'In-memory',   description: 'Local Facebook AI similarity search index.',         fields: ['persistDirectory'],                                                                   supportedMetrics: ['cosine', 'l2', 'ip'],               defaultApiKeyEnvVar: null },
  ],
  metricLabels: {
    cosine: 'Cosine similarity', dotproduct: 'Dot product', dot: 'Dot product', ip: 'Inner product',
    euclidean: 'Euclidean (L2)', l2: 'L2 distance', 'l2-squared': 'L2 squared',
  },
  pineconeClouds: [
    { id: 'aws', label: 'AWS' }, { id: 'gcp', label: 'GCP' }, { id: 'azure', label: 'Azure' },
  ],
  pineconeRegionsByCloud: {
    aws: ['us-east-1', 'us-west-2', 'eu-west-1'],
    gcp: ['us-central1', 'europe-west4'],
    azure: ['eastus2'],
  },
};

// In-module memoisation so we hit the backend once per page load even if
// multiple Vector DB nodes are opened in sequence.
let _registryPromise = null;
const loadRegistry = (force = false) => {
  if (force || !_registryPromise) {
    _registryPromise = xragApi
      .fetchVectorProvidersRegistry()
      .catch(() => FALLBACK_REGISTRY);
  }
  return _registryPromise;
};

// Per-provider icon to liven up the cards.
const PROVIDER_ICONS = {
  pinecone: Cloud,
  chroma:   HardDrive,
  qdrant:   Network,
  weaviate: Globe,
  milvus:   Server,
  pgvector: Database,
  faiss:    HardDrive,
};

// ─── Shared atoms (emerald palette) ──────────────────────────────────────
const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {title}
    </label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-emerald-500">
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
        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm shadow-emerald-200/40'
        : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:text-emerald-700'
    }`}
  >
    <span
      aria-hidden
      className={`inline-block h-2 w-2 rounded-full transition ${
        checked ? 'bg-emerald-500' : 'bg-slate-300 group-hover:bg-emerald-300'
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

// ─── Pure payload builder. Reused by canvas runtime so downstream nodes
// see the same shape as the inspector. (Field names preserved.)
export const buildVectorDatabasePayload = (config, embeddingProfile) => {
  if (!embeddingProfile) {
    return { ...config, embeddingProfile: null };
  }
  return {
    ...config,
    dimensions: Number(embeddingProfile.nativeDimension) || config.dimensions || null,
    embeddingProfile: {
      modelId: embeddingProfile.modelId,
      provider: embeddingProfile.provider,
      nativeDimension: embeddingProfile.nativeDimension,
      metric: embeddingProfile.metric,
    },
  };
};

// ─── Component ───────────────────────────────────────────────────────────
export default function VectorDatabaseSettingsPanel({
  value = {},
  onChange,
  embeddingProfile,
}) {
  const isAwake = Boolean(embeddingProfile?.modelId);

  // Single source of truth lives on the backend.
  const [registry, setRegistry] = useState(FALLBACK_REGISTRY);
  const [registryError, setRegistryError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadRegistry().then((data) => {
      if (cancelled) return;
      if (data) setRegistry(data);
      if (data === FALLBACK_REGISTRY) {
        setRegistryError('Backend unreachable — using built-in catalog.');
      }
    });
    return () => { cancelled = true; };
  }, []);

  const refresh = () => {
    setRefreshing(true);
    setRegistryError(null);
    loadRegistry(true)
      .then((data) => {
        if (data) setRegistry(data);
        if (data === FALLBACK_REGISTRY) {
          setRegistryError('Backend unreachable — using built-in catalog.');
        }
      })
      .finally(() => setRefreshing(false));
  };

  const providers = registry.providers || FALLBACK_REGISTRY.providers;
  const metricLabels = registry.metricLabels || FALLBACK_REGISTRY.metricLabels;
  const pineconeClouds = registry.pineconeClouds || FALLBACK_REGISTRY.pineconeClouds;
  const pineconeRegionsByCloud =
    registry.pineconeRegionsByCloud || FALLBACK_REGISTRY.pineconeRegionsByCloud;

  const provider = useMemo(
    () => providers.find((entry) => entry.id === value.provider) || providers[0],
    [providers, value.provider],
  );

  const setField = (field, fieldValue) => onChange?.(field, fieldValue);

  // ── Auto-sync dimensions + suggested metric whenever the upstream
  //    embedding model or the chosen provider changes. The user CANNOT
  //    override the dimension — it's read-only and locked.
  useEffect(() => {
    if (!embeddingProfile) return;
    const native = Number(embeddingProfile.nativeDimension) || null;
    if (native && Number(value.dimensions) !== native) {
      setField('dimensions', native);
    }
    // Snap metric to a value the provider supports. Respect the embedding's
    // preferred metric when possible, otherwise fall back to provider's first.
    const preferred = embeddingProfile.metric || 'cosine';
    const normalized = preferred === 'dot_product' ? 'dotproduct' : preferred;
    const supported = provider.supportedMetrics;
    const next = supported.includes(normalized) ? normalized : supported[0];
    if (value.metric !== next) {
      setField('metric', next);
    }
    // Keep apiKeyEnvVar in sync with provider default when user hasn't customised.
    if (provider.defaultApiKeyEnvVar && !value.apiKeyEnvVar) {
      setField('apiKeyEnvVar', provider.defaultApiKeyEnvVar);
    }
    // Persist a snapshot of the embedding profile so the canvas runtime can
    // rebuild the payload without traversing edges again.
    if (
      !value.embeddingProfile
      || value.embeddingProfile.modelId !== embeddingProfile.modelId
      || value.embeddingProfile.nativeDimension !== embeddingProfile.nativeDimension
    ) {
      setField('embeddingProfile', {
        modelId: embeddingProfile.modelId,
        provider: embeddingProfile.provider,
        nativeDimension: embeddingProfile.nativeDimension,
        metric: embeddingProfile.metric,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embeddingProfile?.modelId, embeddingProfile?.nativeDimension, provider.id]);

  // Payload preview memo — declared BEFORE any early return so the React
  // hook order stays stable across the sleeping/awake transition.
  const payload = useMemo(
    () => buildVectorDatabasePayload(value, embeddingProfile),
    [value, embeddingProfile],
  );

  // ─── Sleeping state ────────────────────────────────────────────────────
  if (!isAwake) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-emerald-200">
              <Lock size={18} className="text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Vector DB · idle
              </p>
              <p className="text-xs font-semibold text-slate-700">
                Connect an Embedding model to wake this node.
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-500">
            <Layers size={12} />
            <span className="font-bold">Embedding profile</span>
            <span className="ml-auto font-mono text-[10px] text-emerald-600">missing</span>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
            The vector DB's dimension and metric depend on the upstream embedding
            model. Drop in an{' '}
            <span className="font-bold text-amber-700">Embedding</span> node, wire it
            here, and the panel auto-wakes.
          </p>
          <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <Sparkles size={11} className="text-emerald-500" />
            Only <span className="font-mono">embedded_chunks</span> input is allowed
          </div>
        </div>
      </div>
    );
  }

  // ─── Validation ────────────────────────────────────────────────────────
  const warnings = [];
  if (!value.indexName && provider.fields.includes('indexName')) {
    warnings.push('Index name is required for this provider.');
  }
  if (!value.collection && provider.fields.includes('collection')) {
    warnings.push('Collection name is required for this provider.');
  }
  if (provider.fields.includes('url') && !value.url && provider.id !== 'chroma') {
    warnings.push('Endpoint URL is required for this provider.');
  }
  if (provider.fields.includes('apiKeyEnvVar') && !value.apiKeyEnvVar) {
    warnings.push('API key env-var name is required for this provider.');
  }
  if (
    embeddingProfile?.metric &&
    value.metric &&
    embeddingProfile.metric !== value.metric &&
    !(embeddingProfile.metric === 'dot_product' && value.metric === 'dotproduct')
  ) {
    warnings.push(`Metric drift: embedding=${embeddingProfile.metric}, store=${value.metric}.`);
  }

  // ─── Payload preview ───────────────────────────────────────────────────
  // (memo declared earlier — before the sleeping early return)

  const ProviderIcon = PROVIDER_ICONS[provider.id] || Database;
  const metricLabel = metricLabels[value.metric] || value.metric || '—';

  // ─── Awake state ───────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* ── Hero card ───────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-300"
        />
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-600 ring-1 ring-emerald-200/60">
            <ProviderIcon size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800">{provider.label}</p>
            <p className="truncate font-mono text-[10.5px] text-slate-500">
              {value.indexName || value.collection || 'unnamed'} ·{' '}
              {value.dimensions || embeddingProfile.nativeDimension || '—'}d
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="truncate max-w-[90px] text-[10.5px] font-bold text-emerald-700">{metricLabel}</span>
            <span className="font-mono text-[10px] text-slate-500">
              {provider.badge.toLowerCase()}
            </span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-500">
          The <span className="font-semibold text-slate-700">storage hop</span> — persists
          embedded chunks for similarity search; dimension and metric are inherited from
          the upstream embedder so an incompatible index can't be built.
        </p>
      </div>

      {/* ── Upstream contract ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck size={14} className="text-emerald-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
              Upstream contract · auto-synced
            </p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <UpstreamPill
                label="Embedding"
                ok={Boolean(embeddingProfile?.modelId)}
                hint={embeddingProfile?.modelId || 'missing'}
                Icon={Layers}
              />
              <UpstreamPill
                label="Dimension"
                ok={Boolean(embeddingProfile?.nativeDimension)}
                hint={
                  embeddingProfile?.nativeDimension
                    ? `${embeddingProfile.nativeDimension}d`
                    : '—'
                }
                Icon={Compass}
              />
              <UpstreamPill
                label="Metric"
                ok={Boolean(value.metric)}
                hint={metricLabel}
                Icon={ShieldCheck}
              />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-emerald-900/80">
              Dimension &amp; suggested metric are{' '}
              <span className="font-bold">locked</span> to the upstream model — no
              dimension drift possible.
            </p>
          </div>
        </div>
      </div>

      {/* ── Provider picker ─────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database size={12} className="text-emerald-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Provider
            </h4>
            <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[9px] font-bold text-emerald-700">
              {providers.length}
            </span>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
          >
            <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </header>
        {registryError && (
          <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
            <AlertTriangle size={10} className="mt-0.5 shrink-0" />
            {registryError}
          </p>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          {providers.map((entry) => {
            const selected = entry.id === provider.id;
            const Icon = PROVIDER_ICONS[entry.id] || Database;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setField('provider', entry.id)}
                className={`group flex flex-col items-start gap-1 rounded-xl border p-2 text-left transition ${
                  selected
                    ? 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-200/60'
                    : 'border-slate-200 bg-white hover:border-emerald-200'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md transition ${
                      selected
                        ? 'bg-emerald-100 text-emerald-600'
                        : 'bg-slate-100 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-500'
                    }`}
                  >
                    <Icon size={11} />
                  </span>
                  <span
                    className={`text-[11px] font-bold ${selected ? 'text-emerald-900' : 'text-slate-800'}`}
                  >
                    {entry.label}
                  </span>
                </div>
                <span
                  className={`text-[9px] font-bold uppercase tracking-wider ${
                    selected ? 'text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  {entry.badge}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] leading-relaxed text-slate-500">{provider.description}</p>
      </section>

      {/* ── Locked dimension + metric ───────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Lock size={12} className="text-emerald-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Vector space (locked)
          </h4>
        </header>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel
              title="Dimensions"
              help="Locked to the upstream embedding's native vector size."
            />
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <Lock size={11} className="text-slate-400" />
              <span className="font-mono text-xs font-bold text-slate-700">
                {value.dimensions || embeddingProfile.nativeDimension || '—'}
              </span>
            </div>
          </div>
          <div>
            <FieldLabel
              title="Distance metric"
              help="Constrained to metrics the chosen provider supports."
            />
            <select
              value={value.metric || provider.supportedMetrics[0]}
              onChange={(event) => setField('metric', event.target.value)}
              className={`${inputClass} appearance-none pr-7`}
            >
              {provider.supportedMetrics.map((m) => (
                <option key={m} value={m}>
                  {metricLabels[m] || m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ── Index / Collection ──────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Database size={12} className="text-emerald-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Index / Collection
          </h4>
        </header>

        {provider.fields.includes('indexName') && (
          <div>
            <FieldLabel title="Index name" help="Globally unique identifier of the vector index." />
            <input
              type="text"
              value={value.indexName || ''}
              onChange={(event) => setField('indexName', event.target.value)}
              className={inputClass}
              placeholder="xrag-default"
            />
          </div>
        )}

        {provider.fields.includes('collection') && (
          <div>
            <FieldLabel title="Collection" help="Logical grouping of vectors inside the database." />
            <input
              type="text"
              value={value.collection || ''}
              onChange={(event) => setField('collection', event.target.value)}
              className={inputClass}
              placeholder="default"
            />
          </div>
        )}

        {provider.fields.includes('namespace') && (
          <div>
            <FieldLabel title="Namespace" help="Optional sub-partition inside the index (multi-tenant)." />
            <input
              type="text"
              value={value.namespace || ''}
              onChange={(event) => setField('namespace', event.target.value)}
              className={inputClass}
              placeholder="(default)"
            />
          </div>
        )}

        {provider.id === 'pinecone' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel title="Cloud" />
              <select
                value={value.cloud || 'aws'}
                onChange={(event) => setField('cloud', event.target.value)}
                className={inputClass}
              >
                {pineconeClouds.map((cloud) => (
                  <option key={cloud.id} value={cloud.id}>
                    {cloud.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel title="Region" />
              <select
                value={value.region || 'us-east-1'}
                onChange={(event) => setField('region', event.target.value)}
                className={inputClass}
              >
                {(pineconeRegionsByCloud[value.cloud] || pineconeRegionsByCloud.aws || []).map(
                  (region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>
        )}

        {provider.fields.includes('environment') && provider.id === 'pinecone' && (
          <div>
            <FieldLabel
              title="Pod environment (legacy)"
              help="Optional. Leave blank for serverless."
            />
            <input
              type="text"
              value={value.environment || ''}
              onChange={(event) => setField('environment', event.target.value)}
              className={inputClass}
              placeholder="(serverless)"
            />
          </div>
        )}

        {provider.fields.includes('url') && (
          <div>
            <FieldLabel title="Endpoint URL" help="HTTP(S) URL of your self-hosted DB." />
            <input
              type="text"
              value={value.url || ''}
              onChange={(event) => setField('url', event.target.value)}
              className={inputClass}
              placeholder="https://qdrant.example.com:6333"
            />
          </div>
        )}

        {provider.fields.includes('persistDirectory') && (
          <div>
            <FieldLabel title="Persist directory" help="Local filesystem path for embedded mode." />
            <input
              type="text"
              value={value.persistDirectory || ''}
              onChange={(event) => setField('persistDirectory', event.target.value)}
              className={inputClass}
              placeholder="./chroma_db"
            />
          </div>
        )}

        {(provider.fields.includes('shards') || provider.fields.includes('replicas')) && (
          <div className="grid grid-cols-2 gap-2">
            {provider.fields.includes('shards') && (
              <div>
                <FieldLabel title="Shards" />
                <input
                  type="number"
                  min={1}
                  value={value.shards ?? 1}
                  onChange={(event) => setField('shards', Number(event.target.value))}
                  className={inputClass}
                />
              </div>
            )}
            {provider.fields.includes('replicas') && (
              <div>
                <FieldLabel title="Replicas" />
                <input
                  type="number"
                  min={1}
                  value={value.replicas ?? 1}
                  onChange={(event) => setField('replicas', Number(event.target.value))}
                  className={inputClass}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Indexing behaviour ──────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Layers size={12} className="text-emerald-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
            Indexing behaviour
          </h4>
        </header>

        <div>
          <FieldLabel
            title="Metadata fields"
            help="Comma-separated chunk metadata keys to index alongside vectors."
          />
          <input
            type="text"
            value={value.metadataFields || ''}
            onChange={(event) => setField('metadataFields', event.target.value)}
            className={`${inputClass} font-mono`}
            placeholder="source,title,page"
          />
        </div>

        <div>
          <FieldLabel
            title="Upsert batch size"
            help="How many vectors to send per write request."
          />
          <input
            type="number"
            min={1}
            max={1000}
            value={value.upsertBatchSize ?? 100}
            onChange={(event) => setField('upsertBatchSize', Number(event.target.value))}
            className={inputClass}
          />
        </div>

        {provider.fields.includes('hybridSearch') && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <ToggleChip
              checked={Boolean(value.hybridSearch)}
              onChange={(next) => setField('hybridSearch', next)}
              label="Hybrid search (sparse + dense)"
              help="Combine BM25/sparse vectors with dense embeddings at query time."
            />
          </div>
        )}
      </section>

      {/* ── Credentials (env-var name only) ─────────────────────────────── */}
      {provider.fields.includes('apiKeyEnvVar') && (
        <section className="space-y-2 rounded-2xl border border-dashed border-emerald-200 bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/40 p-3">
          <header className="flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-emerald-600" />
            <h4 className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700">
              Credentials
            </h4>
          </header>
          <p className="text-[10px] leading-snug text-slate-600">
            The actual secret stays on the backend — we only record the env-var
            name here. Add the value to{' '}
            <span className="font-mono font-semibold text-slate-700">backend/.env</span>.
          </p>
          <div>
            <FieldLabel
              title="API key env-var name"
              help="The actual secret stays on the backend; we store only the name."
            />
            <input
              type="text"
              value={value.apiKeyEnvVar || ''}
              onChange={(event) => setField('apiKeyEnvVar', event.target.value)}
              className={`${inputClass} font-mono`}
              placeholder={provider.defaultApiKeyEnvVar || 'PROVIDER_API_KEY'}
              spellCheck={false}
            />
          </div>
        </section>
      )}

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
          Configuration valid — ready to upsert.
        </div>
      )}

      {/* ── Output payload preview ──────────────────────────────────────── */}
      <details className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-emerald-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-emerald-400" />
        Allowed input: <span className="font-mono text-emerald-700">embedded_chunks</span>
      </div>
    </div>
  );
}
