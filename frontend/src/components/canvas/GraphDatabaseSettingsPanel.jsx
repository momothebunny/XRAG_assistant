/**
 * GraphDatabaseSettingsPanel — knowledge-graph store inspector, designed
 * symmetric to VectorDatabaseSettingsPanel.
 *
 * UX contract:
 *   • SLEEPING: when no upstream "chunks producer" (Chunking, Document
 *     Upload, Embedding pass-through, Cleaning) is connected, the panel
 *     shows a dashed lock card and refuses input. A graph store with
 *     nothing to ingest is misconfigured by definition.
 *   • AWAKE: when an upstream producer is wired in, the full provider
 *     catalog and extractor strategies become available. The query
 *     language is locked to the chosen provider (Cypher / nGQL / AQL /
 *     SPARQL / Gremlin / Python-API) — same "lock to upstream" pattern
 *     as the Vector panel locks dimension to the embedding model.
 *
 * SECURITY:
 *   We never collect or store credentials in the browser. The user only
 *   picks env-var NAMES (e.g. NEO4J_PASSWORD) and the backend reads the
 *   actual secret from its own environment.
 *
 * Output payload mirrors `default_config` of `storage-graph` in
 * `backend/app/canvas/nodes.py`.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  CircleHelp,
  GitBranch,
  Lock,
  Network,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react';

import { xragApi } from '../../services/xragApi';

// ─────────────────────────────────────────────────────────────────────────
// FALLBACK provider catalog. Real source of truth lives in
// `backend/data/graph_providers_registry.json` and is fetched at mount
// time via `xragApi.fetchGraphProvidersRegistry()`. This baked-in copy
// only kicks in when the backend is unreachable so the panel never
// renders empty.
// ─────────────────────────────────────────────────────────────────────────
const FALLBACK_REGISTRY = {
  providers: [
    { id: 'neo4j', label: 'Neo4j', badge: 'Industry standard', description: 'Cypher-based property graph. AuraDB managed or self-hosted.', fields: ['url', 'database', 'usernameEnvVar', 'passwordEnvVar', 'encrypted'], supportedModes: ['property-graph'], defaultPasswordEnvVar: 'NEO4J_PASSWORD', defaultUsernameEnvVar: 'NEO4J_USERNAME', defaultUrl: 'bolt://localhost:7687', queryLanguage: 'cypher' },
    { id: 'memgraph', label: 'Memgraph', badge: 'In-memory · OSS', description: 'Cypher-compatible, in-memory graph store with streaming.', fields: ['url', 'usernameEnvVar', 'passwordEnvVar', 'encrypted'], supportedModes: ['property-graph'], defaultPasswordEnvVar: 'MEMGRAPH_PASSWORD', defaultUsernameEnvVar: 'MEMGRAPH_USERNAME', defaultUrl: 'bolt://localhost:7687', queryLanguage: 'cypher' },
    { id: 'nebula', label: 'NebulaGraph', badge: 'OSS · Scale', description: 'Distributed billion-edge graph DB with nGQL.', fields: ['url', 'space', 'usernameEnvVar', 'passwordEnvVar'], supportedModes: ['property-graph'], defaultPasswordEnvVar: 'NEBULA_PASSWORD', defaultUsernameEnvVar: 'NEBULA_USERNAME', defaultUrl: 'graphd://localhost:9669', queryLanguage: 'ngql' },
    { id: 'arangodb', label: 'ArangoDB', badge: 'Multi-model', description: 'Document + graph + key-value in one engine, AQL queries.', fields: ['url', 'database', 'usernameEnvVar', 'passwordEnvVar'], supportedModes: ['property-graph'], defaultPasswordEnvVar: 'ARANGO_PASSWORD', defaultUsernameEnvVar: 'ARANGO_USERNAME', defaultUrl: 'http://localhost:8529', queryLanguage: 'aql' },
    { id: 'neptune', label: 'AWS Neptune', badge: 'Managed · AWS', description: 'Managed graph DB supporting both Gremlin and SPARQL.', fields: ['url', 'iamRole', 'region'], supportedModes: ['property-graph', 'rdf-triplestore'], defaultPasswordEnvVar: null, defaultUsernameEnvVar: null, defaultUrl: 'wss://neptune.cluster.region.amazonaws.com:8182/gremlin', queryLanguage: 'gremlin' },
    { id: 'kuzu', label: 'Kùzu', badge: 'Embedded · OSS', description: 'Embeddable analytical graph DB, runs in-process.', fields: ['persistDirectory'], supportedModes: ['property-graph'], defaultPasswordEnvVar: null, defaultUsernameEnvVar: null, defaultUrl: null, queryLanguage: 'cypher' },
    { id: 'networkx', label: 'NetworkX', badge: 'In-memory · Dev', description: 'Pure-Python in-memory graph. Great for prototyping.', fields: ['persistDirectory'], supportedModes: ['property-graph'], defaultPasswordEnvVar: null, defaultUsernameEnvVar: null, defaultUrl: null, queryLanguage: 'python-api' },
    { id: 'blazegraph', label: 'Blazegraph', badge: 'RDF · SPARQL', description: 'RDF triplestore with SPARQL endpoint.', fields: ['url'], supportedModes: ['rdf-triplestore'], defaultPasswordEnvVar: null, defaultUsernameEnvVar: null, defaultUrl: 'http://localhost:9999/blazegraph/sparql', queryLanguage: 'sparql' },
  ],
  modeLabels: {
    'property-graph': 'Property graph (nodes + edges + props)',
    'rdf-triplestore': 'RDF triplestore (subject-predicate-object)',
    hypergraph: 'Hypergraph (multi-node edges)',
  },
  extractorStrategies: [
    { id: 'llm-extraction', label: 'LLM-based entity & relation extraction', description: 'Uses the connected LLM to extract (subject, predicate, object) triples from each chunk. Highest quality, highest cost.' },
    { id: 'spacy-ner', label: 'spaCy NER + dependency parse', description: 'Local statistical NER + verb-based relation heuristics. Fast and cheap.' },
    { id: 'rebel', label: 'REBEL (end-to-end relation extraction)', description: 'BART-based seq2seq relation extractor. Good middle ground.' },
    { id: 'manual', label: 'Pre-extracted (chunks contain triples)', description: 'Skip extraction — assumes upstream node already produced graph triples.' },
  ],
};

// In-module memoisation — same pattern as the Vector panel.
let _registryPromise = null;
const loadRegistry = () => {
  if (!_registryPromise) {
    _registryPromise = xragApi
      .fetchGraphProvidersRegistry()
      .catch(() => FALLBACK_REGISTRY);
  }
  return _registryPromise;
};

// ─────────────────────────────────────────────────────────────────────────
// UI primitives — mirror the Vector panel's style for visual symmetry.
// Distinguishing accent: violet (graph) vs. emerald (vector).
// ─────────────────────────────────────────────────────────────────────────
const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-violet-400';

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
        value ? 'bg-violet-600' : 'bg-slate-300'
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
// Pure payload builder — mirrors `_exec_graph_store` output keys so the
// canvas runtime sees the same shape the inspector renders.
// ─────────────────────────────────────────────────────────────────────────
export const buildGraphDatabasePayload = (config, upstreamProfile) => {
  if (!upstreamProfile) {
    return { ...config, upstreamProfile: null };
  }
  return {
    ...config,
    upstreamProfile: {
      sourceTemplate: upstreamProfile.sourceTemplate,
      hasChunks: Boolean(upstreamProfile.hasChunks),
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────
export default function GraphDatabaseSettingsPanel({ value = {}, onChange, upstreamProfile }) {
  const isAwake = Boolean(upstreamProfile?.hasChunks);

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
  const modeLabels = registry.modeLabels || FALLBACK_REGISTRY.modeLabels;
  const extractorStrategies = registry.extractorStrategies || FALLBACK_REGISTRY.extractorStrategies;

  const provider = useMemo(
    () => providers.find((entry) => entry.id === value.provider) || providers[0],
    [providers, value.provider],
  );

  const setField = (field, fieldValue) => onChange?.(field, fieldValue);

  // ── Auto-sync the storage mode + suggested defaults whenever the user
  //    switches provider. Mode is constrained to what the provider supports
  //    so the user can never persist an invalid combo.
  useEffect(() => {
    if (!provider) return;
    const supported = provider.supportedModes || ['property-graph'];
    if (!supported.includes(value.mode)) {
      setField('mode', supported[0]);
    }
    // Snap connection URL to the provider's suggested default when empty.
    if (!value.url && provider.defaultUrl) {
      setField('url', provider.defaultUrl);
    }
    // Sync env-var names with provider suggestions when user hasn't customised.
    if (provider.defaultPasswordEnvVar && !value.passwordEnvVar) {
      setField('passwordEnvVar', provider.defaultPasswordEnvVar);
    }
    if (provider.defaultUsernameEnvVar && !value.usernameEnvVar) {
      setField('usernameEnvVar', provider.defaultUsernameEnvVar);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider?.id]);

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
              Graph DB · alvó állapot
            </p>
            <p className="text-xs font-semibold text-slate-700">
              Csatlakoztass egy chunks-forrást a folytatáshoz.
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
          A knowledge graph entitásokat és relációkat épít a bejövő chunkokból.
          Húzz be egy <span className="font-bold text-amber-700">Chunking</span>,
          {' '}<span className="font-bold text-amber-700">Document Upload</span>
          {' '}vagy <span className="font-bold text-amber-700">Cleaning</span>
          {' '}node-ot, kösd hozzá ehhez a tárolóhoz, és a panel automatikusan felébred.
        </p>
        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <Sparkles size={11} />
          Csak <span className="font-mono">chunks</span> bemenet engedélyezett
        </div>
      </div>
    );
  }

  // ─── AWAKE STATE ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* ── Upstream handshake card ─────────────────────────────────────── */}
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-violet-700" />
          <p className="text-[11px] font-black uppercase tracking-wider text-violet-800">
            Upstream forrás · csatlakozva
          </p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg bg-white/70 px-2 py-1.5">
            <p className="text-[9px] font-black uppercase tracking-wider text-violet-600">Source node</p>
            <p className="truncate font-mono text-[11px] font-bold text-slate-800" title={upstreamProfile.sourceTemplate}>
              {upstreamProfile.sourceTemplate || 'chunks'}
            </p>
          </div>
          <div className="rounded-lg bg-white/70 px-2 py-1.5">
            <p className="text-[9px] font-black uppercase tracking-wider text-violet-600">Query language</p>
            <p className="font-mono text-[11px] font-bold text-slate-800">
              {provider?.queryLanguage || '—'}
            </p>
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-violet-900/80">
          A query nyelv a választott providerhez van kötve — Neo4j/Memgraph/Kùzu →
          Cypher, Nebula → nGQL, Arango → AQL, Neptune → Gremlin/SPARQL, Blazegraph → SPARQL.
        </p>
      </div>

      {/* ── Provider picker ─────────────────────────────────────────────── */}
      <div>
        <SectionHeading color="text-violet-700">Provider</SectionHeading>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {providers.map((entry) => {
            const selected = entry.id === provider?.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setField('provider', entry.id)}
                className={`flex flex-col items-start gap-0.5 rounded-lg border px-2 py-1.5 text-left transition ${
                  selected
                    ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-300'
                    : 'border-slate-200 bg-white hover:border-violet-300'
                }`}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="text-[11px] font-bold text-slate-800">{entry.label}</span>
                  <Network size={11} className="text-slate-400" />
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-violet-600">
                  {entry.badge}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">{provider?.description}</p>
      </div>

      {/* ── Storage mode (constrained to provider) ──────────────────────── */}
      <div>
        <FieldLabel title="Storage mode" help="Constrained to modes the chosen provider supports." />
        <div className="grid grid-cols-1 gap-1.5">
          {(provider?.supportedModes || ['property-graph']).map((mode) => {
            const selected = value.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setField('mode', mode)}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[11px] font-bold transition ${
                  selected
                    ? 'border-violet-500 bg-violet-50 text-violet-800 ring-2 ring-violet-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300'
                }`}
              >
                <Workflow size={12} className={selected ? 'text-violet-600' : 'text-slate-400'} />
                <span className="truncate">{modeLabels[mode] || mode}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Provider-specific connection fields ─────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <SectionHeading>Connection</SectionHeading>

        {provider?.fields.includes('url') && (
          <div>
            <FieldLabel title="Endpoint URL" help="Bolt / HTTP / WebSocket URL of the graph database." />
            <input
              type="text"
              value={value.url || ''}
              onChange={(event) => setField('url', event.target.value)}
              className={`${inputClass} font-mono`}
              placeholder={provider.defaultUrl || ''}
            />
          </div>
        )}

        {provider?.fields.includes('database') && (
          <div>
            <FieldLabel title="Database" help="Logical database inside the cluster (Neo4j multi-DB, ArangoDB)." />
            <input
              type="text"
              value={value.database || ''}
              onChange={(event) => setField('database', event.target.value)}
              className={inputClass}
              placeholder="neo4j"
            />
          </div>
        )}

        {provider?.fields.includes('space') && (
          <div>
            <FieldLabel title="Graph space" help="Nebula's tenant boundary, similar to a database schema." />
            <input
              type="text"
              value={value.space || ''}
              onChange={(event) => setField('space', event.target.value)}
              className={inputClass}
              placeholder="default_space"
            />
          </div>
        )}

        {provider?.fields.includes('persistDirectory') && (
          <div>
            <FieldLabel title="Persist directory" help="Local filesystem path for embedded mode." />
            <input
              type="text"
              value={value.persistDirectory || ''}
              onChange={(event) => setField('persistDirectory', event.target.value)}
              className={inputClass}
              placeholder="./graph_db"
            />
          </div>
        )}

        {provider?.fields.includes('region') && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel title="AWS region" />
              <input
                type="text"
                value={value.region || ''}
                onChange={(event) => setField('region', event.target.value)}
                className={inputClass}
                placeholder="us-east-1"
              />
            </div>
            <div>
              <FieldLabel title="IAM role ARN" help="Optional. Use IAM auth instead of static credentials." />
              <input
                type="text"
                value={value.iamRole || ''}
                onChange={(event) => setField('iamRole', event.target.value)}
                className={inputClass}
                placeholder="arn:aws:iam::…"
              />
            </div>
          </div>
        )}

        {provider?.fields.includes('encrypted') && (
          <Toggle
            value={Boolean(value.encrypted)}
            onChange={(next) => setField('encrypted', next)}
            label="TLS encryption"
            help="Force encrypted Bolt connection (recommended for managed instances)."
          />
        )}
      </div>

      {/* ── Knowledge-graph extraction ──────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <SectionHeading>
          <span className="inline-flex items-center gap-1">
            <GitBranch size={11} /> Knowledge-graph extraction
          </span>
        </SectionHeading>

        <div>
          <FieldLabel
            title="Extractor strategy"
            help="How (subject, predicate, object) triples are extracted from incoming chunks."
          />
          <div className="grid grid-cols-1 gap-1">
            {extractorStrategies.map((strategy) => {
              const selected = value.extractorStrategy === strategy.id;
              return (
                <button
                  key={strategy.id}
                  type="button"
                  onClick={() => setField('extractorStrategy', strategy.id)}
                  className={`flex flex-col items-start rounded-lg border px-2 py-1.5 text-left transition ${
                    selected
                      ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-300'
                      : 'border-slate-200 bg-white hover:border-violet-300'
                  }`}
                  title={strategy.description}
                >
                  <span className="text-[11px] font-bold text-slate-800">{strategy.label}</span>
                  <span className="text-[9.5px] leading-snug text-slate-500">{strategy.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <FieldLabel
            title="Entity types (comma-separated)"
            help="Whitelist of entity labels the extractor is allowed to emit."
          />
          <input
            type="text"
            value={value.entityTypes || ''}
            onChange={(event) => setField('entityTypes', event.target.value)}
            className={inputClass}
            placeholder="Person,Organization,Location,Concept,Event"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Min confidence" help="Drop triples below this extractor confidence (0–1)." />
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={value.minConfidence ?? 0.6}
              onChange={(event) => setField('minConfidence', Number(event.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel title="Avg triples / chunk" help="Used for the upfront cost & density estimate." />
            <input
              type="number"
              min={1}
              max={100}
              value={value.avgTriplesPerChunk ?? 6}
              onChange={(event) => setField('avgTriplesPerChunk', Number(event.target.value))}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <FieldLabel title="Upsert batch size" help="How many triples to send per write transaction." />
          <input
            type="number"
            min={1}
            max={1000}
            value={value.upsertBatchSize ?? 100}
            onChange={(event) => setField('upsertBatchSize', Number(event.target.value))}
            className={inputClass}
          />
        </div>
      </div>

      {/* ── Credentials (env-var names only) ────────────────────────────── */}
      {(provider?.fields.includes('passwordEnvVar') || provider?.fields.includes('usernameEnvVar')) && (
        <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-violet-700" />
            <SectionHeading color="text-violet-700">Credentials</SectionHeading>
          </div>
          {provider.fields.includes('usernameEnvVar') && (
            <div>
              <FieldLabel title="Username env-var name" />
              <input
                type="text"
                value={value.usernameEnvVar || ''}
                onChange={(event) => setField('usernameEnvVar', event.target.value)}
                className={`${inputClass} font-mono`}
                placeholder={provider.defaultUsernameEnvVar || 'GRAPH_USERNAME'}
                spellCheck={false}
              />
            </div>
          )}
          {provider.fields.includes('passwordEnvVar') && (
            <div>
              <FieldLabel
                title="Password env-var name"
                help="The actual secret stays on the backend. We only store the env-var name here."
              />
              <input
                type="text"
                value={value.passwordEnvVar || ''}
                onChange={(event) => setField('passwordEnvVar', event.target.value)}
                className={`${inputClass} font-mono`}
                placeholder={provider.defaultPasswordEnvVar || 'GRAPH_PASSWORD'}
                spellCheck={false}
              />
            </div>
          )}
          <p className="text-[10px] leading-relaxed text-violet-900/80">
            Add a titkos kulcsokat a <span className="font-mono font-bold">backend/.env</span> fájlhoz —
            a böngésző soha nem fogja látni.
          </p>
        </div>
      )}

      {/* ── Footer hint ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-amber-500" />
        Engedélyezett bemenet: <span className="font-mono">chunks</span>
      </div>
    </div>
  );
}
