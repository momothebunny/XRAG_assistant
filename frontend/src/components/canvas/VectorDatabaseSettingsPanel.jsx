/**
 * VectorDatabaseSettingsPanel — LangFlow-inspired vector store inspector,
 * extra'd with smart awakening.
 *
 * UX contract (mirrors ChunkingSettingsPanel):
 *   • SLEEPING: when no upstream Embedding node is connected, the panel
 *     shows a dashed lock card asking the user to wire one up. We refuse to
 *     accept any data so the user can't ship a misconfigured vector index.
 *   • AWAKE: when an Embedding profile is provided, the panel reveals the
 *     full provider catalog. The output dimension and (suggested) metric
 *     are LOCKED to the upstream model — the canonical RAG mistake of
 *     mixing dimensions across embedders is impossible by construction.
 *
 * SECURITY:
 *   We never collect or store provider API keys in the browser. The user
 *   only picks an environment variable NAME (e.g. PINECONE_API_KEY) and
 *   the backend reads the secret from its own environment.
 *
 * Output payload mirrors `default_config` of `storage-vector` in
 * `backend/app/canvas/nodes.py`.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  CircleHelp,
  Database,
  Layers,
  Lock,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

import { xragApi } from '../../services/xragApi';

// ─────────────────────────────────────────────────────────────────────────
// FALLBACK provider catalog. The real source of truth lives in
// `backend/data/vector_providers_registry.json` and is fetched at mount
// time via `xragApi.fetchVectorProvidersRegistry()`. This baked-in copy is
// only used when the backend is unreachable (offline dev, slow network)
// so the panel never renders empty.
// ─────────────────────────────────────────────────────────────────────────
const FALLBACK_REGISTRY = {
  providers: [
    { id: 'pinecone', label: 'Pinecone', badge: 'Managed', description: 'Serverless or pod-based managed vector DB.', fields: ['indexName', 'namespace', 'cloud', 'region', 'environment', 'apiKeyEnvVar', 'hybridSearch'], supportedMetrics: ['cosine', 'dotproduct', 'euclidean'], defaultApiKeyEnvVar: 'PINECONE_API_KEY' },
    { id: 'chroma', label: 'Chroma', badge: 'Local · OSS', description: 'Embeddable, runs in-process or via local server.', fields: ['collection', 'persistDirectory', 'url'], supportedMetrics: ['cosine', 'l2', 'ip'], defaultApiKeyEnvVar: null },
    { id: 'qdrant', label: 'Qdrant', badge: 'OSS · Hybrid', description: 'High-perf Rust DB with native sparse + dense hybrid.', fields: ['collection', 'url', 'apiKeyEnvVar', 'shards', 'replicas', 'hybridSearch'], supportedMetrics: ['cosine', 'euclidean', 'dot'], defaultApiKeyEnvVar: 'QDRANT_API_KEY' },
    { id: 'weaviate', label: 'Weaviate', badge: 'Hybrid · OSS', description: 'GraphQL-native, hybrid search with BM25 baked in.', fields: ['collection', 'url', 'apiKeyEnvVar', 'hybridSearch'], supportedMetrics: ['cosine', 'l2-squared', 'dot'], defaultApiKeyEnvVar: 'WEAVIATE_API_KEY' },
    { id: 'milvus', label: 'Milvus', badge: 'OSS · Scale', description: 'Distributed billion-scale vector store.', fields: ['collection', 'url', 'shards', 'replicas'], supportedMetrics: ['cosine', 'l2', 'ip'], defaultApiKeyEnvVar: null },
    { id: 'pgvector', label: 'pgvector', badge: 'Postgres', description: 'Bring vector search to existing Postgres.', fields: ['indexName', 'url', 'apiKeyEnvVar'], supportedMetrics: ['cosine', 'l2', 'ip'], defaultApiKeyEnvVar: 'POSTGRES_URL' },
    { id: 'faiss', label: 'FAISS', badge: 'In-memory', description: 'Local Facebook AI similarity search index.', fields: ['persistDirectory'], supportedMetrics: ['cosine', 'l2', 'ip'], defaultApiKeyEnvVar: null },
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

// In-module memoisation so we only hit the backend once per page load even
// if multiple Vector DB nodes are open in sequence.
let _registryPromise = null;
const loadRegistry = () => {
  if (!_registryPromise) {
    _registryPromise = xragApi
      .fetchVectorProvidersRegistry()
      .catch(() => FALLBACK_REGISTRY);
  }
  return _registryPromise;
};

// ─────────────────────────────────────────────────────────────────────────
// UI primitives — mirror Chunking/Embedding panel style.
// ─────────────────────────────────────────────────────────────────────────
const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400';

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
        value ? 'bg-emerald-600' : 'bg-slate-300'
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
// Pure payload builder. Reused by canvas runtime so downstream nodes see
// the same shape as the inspector.
// ─────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────
export default function VectorDatabaseSettingsPanel({ value = {}, onChange, embeddingProfile }) {
  const isAwake = Boolean(embeddingProfile?.modelId);

  // Single source of truth lives on the backend. We fetch it once, fall back
  // to the baked-in copy if the network fails.
  const [registry, setRegistry] = useState(FALLBACK_REGISTRY);
  useEffect(() => {
    let cancelled = false;
    loadRegistry().then((data) => {
      if (!cancelled && data) setRegistry(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    // Snap metric to a value the provider actually supports. We respect the
    // embedding's preferred metric when possible, otherwise fall back to the
    // provider's first supported one.
    const preferred = embeddingProfile.metric || 'cosine';
    const normalized = preferred === 'dot_product' ? 'dotproduct' : preferred;
    const supported = provider.supportedMetrics;
    const next = supported.includes(normalized) ? normalized : supported[0];
    if (value.metric !== next) {
      setField('metric', next);
    }
    // Keep the apiKeyEnvVar in sync with the provider's suggested env name
    // when the user hasn't customised it.
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
              Vector DB · idle / sleeping
            </p>
            <p className="text-xs font-semibold text-slate-700">
              Connect an Embedding model to continue.
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
          The vector database's dimension and metric depend on the upstream
          embedding model. Drop in an <span className="font-bold text-amber-700">Embedding</span>
          {' '}node, wire it to this store, and the panel will auto-wake.
        </p>
        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <Sparkles size={11} />
          Only <span className="font-mono">embedded_chunks</span> input is allowed
        </div>
      </div>
    );
  }

  // ─── AWAKE STATE ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* ── Embedding handshake card ────────────────────────────────────── */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-emerald-700" />
          <p className="text-[11px] font-black uppercase tracking-wider text-emerald-800">
            Vector space · auto-synced
          </p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg bg-white/70 px-2 py-1.5">
            <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Upstream model</p>
            <p className="truncate font-mono text-[11px] font-bold text-slate-800" title={embeddingProfile.modelId}>
              {embeddingProfile.modelId}
            </p>
          </div>
          <div className="rounded-lg bg-white/70 px-2 py-1.5">
            <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Dimension</p>
            <p className="font-mono text-[11px] font-bold text-slate-800">
              {embeddingProfile.nativeDimension || '—'}
            </p>
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-emerald-900/80">
          The dimension and suggested metric come from the upstream model —
          not editable, to prevent an incompatible index.
        </p>
      </div>

      {/* ── Provider picker ─────────────────────────────────────────────── */}
      <div>
        <SectionHeading color="text-emerald-700">Provider</SectionHeading>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {providers.map((entry) => {
            const selected = entry.id === provider.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setField('provider', entry.id)}
                className={`flex flex-col items-start gap-0.5 rounded-lg border px-2 py-1.5 text-left transition ${
                  selected
                    ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300'
                    : 'border-slate-200 bg-white hover:border-emerald-300'
                }`}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="text-[11px] font-bold text-slate-800">{entry.label}</span>
                  <Database size={11} className="text-slate-400" />
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">
                  {entry.badge}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">{provider.description}</p>
      </div>

      {/* ── Locked dimension + metric ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel title="Dimensions" help="Locked to the upstream embedding's native vector size." />
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
            <Lock size={11} className="text-slate-400" />
            <span className="font-mono text-xs font-bold text-slate-700">
              {value.dimensions || embeddingProfile.nativeDimension || '—'}
            </span>
          </div>
        </div>
        <div>
          <FieldLabel title="Distance metric" help="Constrained to metrics the chosen provider supports." />
          <div className="relative">
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
      </div>

      {/* ── Provider-specific fields ─────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <SectionHeading>Index / Collection</SectionHeading>

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
                  <option key={cloud.id} value={cloud.id}>{cloud.label}</option>
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
                {(pineconeRegionsByCloud[value.cloud] || pineconeRegionsByCloud.aws || []).map((region) => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {provider.fields.includes('environment') && provider.id === 'pinecone' && (
          <div>
            <FieldLabel title="Pod environment (legacy)" help="Optional. Leave blank for serverless." />
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
      </div>

      {/* ── Indexing behaviour ──────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <SectionHeading>
          <span className="inline-flex items-center gap-1">
            <Layers size={11} /> Indexing behaviour
          </span>
        </SectionHeading>

        <div>
          <FieldLabel title="Metadata fields" help="Comma-separated chunk metadata keys to index alongside vectors." />
          <input
            type="text"
            value={value.metadataFields || ''}
            onChange={(event) => setField('metadataFields', event.target.value)}
            className={inputClass}
            placeholder="source,title,page"
          />
        </div>

        <div>
          <FieldLabel title="Upsert batch size" help="How many vectors to send per write request." />
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
          <Toggle
            value={Boolean(value.hybridSearch)}
            onChange={(next) => setField('hybridSearch', next)}
            label="Hybrid search (sparse + dense)"
            help="Combine BM25/sparse vectors with dense embeddings at query time."
          />
        )}
      </div>

      {/* ── Credentials (env-var name only) ─────────────────────────────── */}
      {provider.fields.includes('apiKeyEnvVar') && (
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-emerald-700" />
            <SectionHeading color="text-emerald-700">Credentials</SectionHeading>
          </div>
          <div>
            <FieldLabel
              title="API key env-var name"
              help="The actual secret stays on the backend. We only store the env-var name here."
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
          <p className="text-[10px] leading-relaxed text-emerald-900/80">
            Add the secret to <span className="font-mono font-bold">backend/.env</span> —
            the browser will never see it.
          </p>
        </div>
      )}

      {/* ── Footer hint ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-amber-500" />
        Allowed input: <span className="font-mono">embedded_chunks</span>
      </div>
    </div>
  );
}
