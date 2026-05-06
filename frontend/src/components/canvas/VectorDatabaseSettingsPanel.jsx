import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Database,
  Key,
  Layers,
  Lock,
  RefreshCw,
  Server,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';

import { xragApi } from '../../services/xragApi';

const FALLBACK_PROVIDERS = [
  { id: 'pinecone', label: 'Pinecone', initials: 'PC', badge: 'Managed', description: 'Serverless or pod-based managed vector DB.', fields: ['indexName', 'namespace', 'cloud', 'region', 'environment', 'hybridSearch'], supportedMetrics: ['cosine', 'dotproduct', 'euclidean'], defaultApiKeyEnvVar: 'PINECONE_API_KEY', credentialTitle: 'Pinecone API', credentialFields: [{ env_var: 'PINECONE_API_KEY', label: 'Pinecone API Key', placeholder: 'pcsk_...', required: true, secret: true }] },
  { id: 'chroma', label: 'Chroma', initials: 'CH', badge: 'OSS - Local', description: 'Embeddable, runs in-process or via local server.', fields: ['collection', 'persistDirectory', 'url'], supportedMetrics: ['cosine', 'l2', 'ip'], defaultApiKeyEnvVar: null, credentialTitle: 'Chroma API', credentialFields: [{ env_var: 'CHROMA_API_KEY', label: 'Chroma API Key', placeholder: 'chroma-key', required: true, secret: true }, { env_var: 'CHROMA_TENANT', label: 'Chroma Tenant', placeholder: 'default_tenant', required: true, secret: false }, { env_var: 'CHROMA_DATABASE', label: 'Chroma Database', placeholder: 'default_database', required: true, secret: false }] },
  { id: 'qdrant', label: 'Qdrant', initials: 'QD', badge: 'OSS - Hybrid', description: 'High-performance vector DB with native sparse plus dense hybrid.', fields: ['collection', 'url', 'shards', 'replicas', 'hybridSearch'], supportedMetrics: ['cosine', 'euclidean', 'dot'], defaultApiKeyEnvVar: 'QDRANT_API_KEY', credentialTitle: 'Qdrant API', credentialFields: [{ env_var: 'QDRANT_API_KEY', label: 'Qdrant API Key', placeholder: 'qdrant-key', required: true, secret: true }] },
  { id: 'weaviate', label: 'Weaviate', initials: 'WV', badge: 'Hybrid - OSS', description: 'GraphQL-native, hybrid search with BM25 baked in.', fields: ['collection', 'url', 'hybridSearch'], supportedMetrics: ['cosine', 'l2-squared', 'dot'], defaultApiKeyEnvVar: 'WEAVIATE_API_KEY', credentialTitle: 'Weaviate API', credentialFields: [{ env_var: 'WEAVIATE_API_KEY', label: 'Weaviate API Key', placeholder: 'weaviate-key', required: true, secret: true }] },
  { id: 'milvus', label: 'Milvus', initials: 'MV', badge: 'OSS - Scale', description: 'Distributed billion-scale vector store.', fields: ['collection', 'url', 'shards', 'replicas'], supportedMetrics: ['cosine', 'l2', 'ip'], defaultApiKeyEnvVar: null, credentialTitle: 'Milvus Auth', credentialNotice: { text: 'You can find the Milvus authentication values in your Milvus deployment settings.' }, credentialFields: [{ env_var: 'MILVUS_USERNAME', label: 'Milvus User', placeholder: 'root', required: true, secret: false }, { env_var: 'MILVUS_PASSWORD', label: 'Milvus Password', placeholder: 'password', required: true, secret: true }] },
  { id: 'pgvector', label: 'Postgres', initials: 'PG', badge: 'SQL - pgvector', description: 'Bring vector search to existing Postgres via pgvector.', fields: ['indexName', 'url'], supportedMetrics: ['cosine', 'l2', 'ip'], defaultApiKeyEnvVar: null, credentialTitle: 'Postgres API', credentialFields: [{ env_var: 'POSTGRES_USERNAME', label: 'User', placeholder: '<POSTGRES_USERNAME>', required: true, secret: false }, { env_var: 'POSTGRES_PASSWORD', label: 'Password', placeholder: '<POSTGRES_PASSWORD>', required: true, secret: true }] },
  { id: 'astra', label: 'Astra (DataStax)', initials: 'AS', badge: 'Managed - Cloud', description: 'DataStax Astra DB serverless Cassandra with vector support.', fields: ['collection', 'url'], supportedMetrics: ['cosine', 'dot', 'euclidean'], defaultApiKeyEnvVar: 'ASTRA_DB_APPLICATION_TOKEN', credentialTitle: 'Astra DB API', credentialFields: [{ env_var: 'ASTRA_DB_APPLICATION_TOKEN', label: 'Astra DB Application Token', placeholder: 'AstraCS:...', required: true, secret: true }, { env_var: 'ASTRA_DB_API_ENDPOINT', label: 'Astra DB API Endpoint', placeholder: 'https://...apps.astra.datastax.com', required: true, secret: false }] },
  { id: 'couchbase', label: 'Couchbase', initials: 'CB', badge: 'Multi-model', description: 'Distributed NoSQL with integrated vector search.', fields: ['indexName', 'url'], supportedMetrics: ['cosine', 'dot', 'euclidean'], defaultApiKeyEnvVar: null, credentialTitle: 'Couchbase API', credentialFields: [{ env_var: 'COUCHBASE_CONNECTION_STRING', label: 'Couchbase Connection String', placeholder: 'couchbases://cluster.example.com', required: true, secret: false }, { env_var: 'COUCHBASE_USERNAME', label: 'Couchbase Username', placeholder: 'Administrator', required: true, secret: false }, { env_var: 'COUCHBASE_PASSWORD', label: 'Couchbase Password', placeholder: 'password', required: true, secret: true }] },
  { id: 'docstore', label: 'Document Store (Vector)', initials: 'DS', badge: 'In-Process', description: 'In-memory or file-backed document store with vector search.', fields: ['persistDirectory'], supportedMetrics: ['cosine', 'l2', 'ip'], defaultApiKeyEnvVar: null, credentialFields: [] },
  { id: 'elasticsearch', label: 'Elasticsearch', initials: 'ES', badge: 'OSS - Cloud', description: 'ANN vector search built into Elasticsearch 8+.', fields: ['indexName', 'url', 'hybridSearch'], supportedMetrics: ['cosine', 'dot', 'l2'], defaultApiKeyEnvVar: 'ELASTICSEARCH_API_KEY', credentialTitle: 'Elasticsearch API', credentialNotice: { text: 'Refer to the official Elasticsearch guide to create and manage API keys.' }, credentialFields: [{ env_var: 'ELASTICSEARCH_ENDPOINT', label: 'Elasticsearch Endpoint', placeholder: 'https://cluster.example.com:9200', required: true, secret: false }, { env_var: 'ELASTICSEARCH_API_KEY', label: 'Elasticsearch API Key', placeholder: 'ApiKey ...', required: true, secret: true }] },
  { id: 'inmemory', label: 'In-Memory Vector Store', initials: 'IM', badge: 'Dev - No-persist', description: 'Ephemeral in-process store. Good for testing and prototyping.', fields: [], supportedMetrics: ['cosine', 'l2', 'ip'], defaultApiKeyEnvVar: null, credentialFields: [] },
  { id: 'kendra', label: 'AWS Kendra', initials: 'KN', badge: 'Managed - AWS', description: 'Managed ML-powered enterprise search service by AWS.', fields: ['indexName', 'region'], supportedMetrics: ['cosine'], defaultApiKeyEnvVar: null, credentialTitle: 'AWS security credentials', credentialNotice: { text: 'When unspecified, credentials can still be sourced from the runtime environment according to the default AWS SDK behavior.' }, credentialFields: [{ env_var: 'AWS_ACCESS_KEY_ID', label: 'AWS Access Key', placeholder: '<AWS_ACCESS_KEY_ID>', required: false, secret: false }, { env_var: 'AWS_SECRET_ACCESS_KEY', label: 'AWS Secret Access Key', placeholder: '<AWS_SECRET_ACCESS_KEY>', required: false, secret: true }, { env_var: 'AWS_SESSION_TOKEN', label: 'AWS Session Key', placeholder: '<AWS_SESSION_TOKEN>', required: false, secret: true }, { env_var: 'AWS_ROLE_ARN', label: 'Role ARN', placeholder: 'arn:aws:iam::123456789012:role/role-name', required: false, secret: false }, { env_var: 'AWS_EXTERNAL_ID', label: 'External ID', placeholder: 'unique-external-id', required: false, secret: false }] },
  { id: 'meilisearch', label: 'Meilisearch', initials: 'ML', badge: 'OSS - Fast', description: 'Typo-tolerant search engine with vector support.', fields: ['indexName', 'url'], supportedMetrics: ['cosine'], defaultApiKeyEnvVar: 'MEILI_SEARCH_API_KEY', credentialTitle: 'Meilisearch API', credentialNotice: { text: 'Use a search key for query-time access; an admin key is only needed for management operations.' }, credentialFields: [{ env_var: 'MEILI_SEARCH_API_KEY', label: 'Meilisearch Search API Key', placeholder: 'search-key', required: true, secret: true }, { env_var: 'MEILI_ADMIN_API_KEY', label: 'Meilisearch Admin API Key', placeholder: 'admin-key', required: false, secret: true }] },
  { id: 'mongodb', label: 'MongoDB Atlas', initials: 'MG', badge: 'Managed - Cloud', description: 'Atlas Vector Search hybrid vector plus full-text on MongoDB.', fields: ['collection', 'url'], supportedMetrics: ['cosine', 'euclidean', 'dot'], defaultApiKeyEnvVar: 'MONGODB_ATLAS_URI', credentialTitle: 'MongoDB ATLAS', credentialFields: [{ env_var: 'MONGODB_ATLAS_URI', label: 'ATLAS Connection URL', placeholder: 'mongodb+srv://<user>:<pwd>@cluster.mongodb.net/?retryWrites=true&w=majority', required: true, secret: true }] },
  { id: 'opensearch', label: 'OpenSearch', initials: 'OS', badge: 'OSS - AWS', description: 'k-NN plugin for distributed vector search.', fields: ['indexName', 'url', 'hybridSearch'], supportedMetrics: ['cosine', 'l2', 'ip'], defaultApiKeyEnvVar: null, credentialTitle: 'OpenSearch', credentialFields: [{ env_var: 'OPENSEARCH_URL', label: 'OpenSearch URL', placeholder: 'https://cluster.example.com:9200', required: true, secret: false }, { env_var: 'OPENSEARCH_USERNAME', label: 'User', placeholder: '<OPENSEARCH_USERNAME>', required: false, secret: false }, { env_var: 'OPENSEARCH_PASSWORD', label: 'Password', placeholder: '<OPENSEARCH_PASSWORD>', required: false, secret: true }] },
  { id: 'redis', label: 'Redis', initials: 'RD', badge: 'In-Memory - Fast', description: 'RediSearch module for blazing-fast vector similarity search.', fields: ['indexName', 'url'], supportedMetrics: ['cosine', 'l2', 'ip'], defaultApiKeyEnvVar: null, credentialTitle: 'Redis API', credentialFields: [{ env_var: 'REDIS_HOST', label: 'Redis Host', placeholder: '127.0.0.1', required: true, secret: false }, { env_var: 'REDIS_PORT', label: 'Port', placeholder: '6379', required: true, secret: false }, { env_var: 'REDIS_USERNAME', label: 'User', placeholder: '<REDIS_USERNAME>', required: true, secret: false }, { env_var: 'REDIS_PASSWORD', label: 'Password', placeholder: '<REDIS_PASSWORD>', required: true, secret: true }, { env_var: 'REDIS_USE_SSL', label: 'Use SSL', placeholder: 'true', required: false, secret: false }] },
  { id: 'singlestore', label: 'SingleStore', initials: 'SS', badge: 'SQL - Real-time', description: 'Distributed SQL database with native vector operations.', fields: ['collection', 'url'], supportedMetrics: ['cosine', 'dot', 'euclidean'], defaultApiKeyEnvVar: null, credentialTitle: 'SingleStore API', credentialFields: [{ env_var: 'SINGLESTORE_USERNAME', label: 'User', placeholder: '<SINGLESTORE_USERNAME>', required: true, secret: false }, { env_var: 'SINGLESTORE_PASSWORD', label: 'Password', placeholder: '<SINGLESTORE_PASSWORD>', required: true, secret: true }] },
  { id: 'supabase', label: 'Supabase', initials: 'SB', badge: 'OSS - Postgres', description: 'pgvector through Supabase, backed by Postgres.', fields: ['collection', 'url'], supportedMetrics: ['cosine', 'l2', 'ip'], defaultApiKeyEnvVar: 'SUPABASE_API_KEY', credentialTitle: 'Supabase API', credentialFields: [{ env_var: 'SUPABASE_API_KEY', label: 'Supabase API Key', placeholder: 'sbp_...', required: true, secret: true }] },
  { id: 'upstash', label: 'Upstash Vector', initials: 'UV', badge: 'Serverless', description: 'Pay-per-request serverless vector database.', fields: ['indexName', 'url'], supportedMetrics: ['cosine', 'euclidean'], defaultApiKeyEnvVar: 'UPSTASH_VECTOR_REST_TOKEN', credentialTitle: 'Upstash Vector API', credentialFields: [{ env_var: 'UPSTASH_VECTOR_REST_URL', label: 'Upstash Vector REST URL', placeholder: 'https://...upstash.io', required: true, secret: false }, { env_var: 'UPSTASH_VECTOR_REST_TOKEN', label: 'Upstash Vector REST Token', placeholder: 'token', required: true, secret: true }] },
  { id: 'vectara', label: 'Vectara', initials: 'VC', badge: 'Managed', description: 'Grounded generation platform with built-in vector store.', fields: ['collection'], supportedMetrics: ['cosine'], defaultApiKeyEnvVar: 'VECTARA_API_KEY', credentialTitle: 'Vectara API', credentialFields: [{ env_var: 'VECTARA_CUSTOMER_ID', label: 'Vectara Customer ID', placeholder: 'customer-id', required: true, secret: false }, { env_var: 'VECTARA_CORPUS_ID', label: 'Vectara Corpus ID', placeholder: 'corpus-id', required: true, secret: false }, { env_var: 'VECTARA_API_KEY', label: 'Vectara API Key', placeholder: 'api-key', required: true, secret: true }] },
  { id: 'zep-oss', label: 'Zep Collection (OSS)', initials: 'ZO', badge: 'Open Source', description: 'Self-hosted Zep memory plus vector collection store.', fields: ['collection', 'url'], supportedMetrics: ['cosine', 'l2'], defaultApiKeyEnvVar: null, credentialFields: [] },
  { id: 'zep-cloud', label: 'Zep Collection (Cloud)', initials: 'ZC', badge: 'Cloud', description: 'Managed Zep cloud with vector plus memory collections.', fields: ['collection'], supportedMetrics: ['cosine'], defaultApiKeyEnvVar: 'ZEP_API_KEY', credentialTitle: 'Zep Memory API', credentialNotice: { text: 'Refer to the official Zep guide to create an API key.' }, credentialFields: [{ env_var: 'ZEP_API_KEY', label: 'API Key', placeholder: 'zep_...', required: true, secret: true }] },
];

const METRIC_LABELS = {
  cosine: 'Cosine similarity',
  dotproduct: 'Dot product',
  dot: 'Dot product',
  ip: 'Inner product',
  euclidean: 'Euclidean (L2)',
  l2: 'L2 distance',
  'l2-squared': 'L2 squared',
};

const PINECONE_CLOUDS = [
  { id: 'aws', label: 'AWS' },
  { id: 'gcp', label: 'GCP' },
  { id: 'azure', label: 'Azure' },
];

const PINECONE_REGIONS = {
  aws: ['us-east-1', 'us-west-2', 'eu-west-1'],
  gcp: ['us-central1', 'europe-west4'],
  azure: ['eastus2'],
};

const AWS_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
];

const PROVIDER_ADDITIONAL_FIELDS = {
  pinecone: [
    { key: 'podType', label: 'Pod type', type: 'select', options: ['p1.x1', 'p1.x2', 's1.x1'], help: 'Pod family for non-serverless deployments.' },
    { key: 'deletionProtection', label: 'Deletion protection', type: 'boolean', help: 'Prevents accidental index deletion.' },
    { key: 'consistencyLevel', label: 'Consistency level', type: 'select', options: ['eventual', 'strong'], help: 'Read consistency preference.' },
  ],
  chroma: [
    { key: 'distanceFunction', label: 'Distance function', type: 'select', options: ['cosine', 'l2', 'ip'], help: 'Collection-level distance function.' },
    { key: 'tenantIsolation', label: 'Tenant isolation', type: 'boolean', help: 'Enable stricter tenant-level isolation behaviour.' },
  ],
  qdrant: [
    { key: 'onDiskPayload', label: 'On-disk payload', type: 'boolean', help: 'Store payload on disk to reduce RAM usage.' },
    { key: 'quantization', label: 'Quantization', type: 'select', options: ['none', 'scalar', 'product'], help: 'Approximation method for memory/latency tradeoff.' },
  ],
  weaviate: [
    { key: 'className', label: 'Class name', type: 'text', placeholder: 'XRAGChunk', help: 'Weaviate class for stored chunks.' },
    { key: 'consistencyLevel', label: 'Consistency level', type: 'select', options: ['ONE', 'QUORUM', 'ALL'], help: 'Replica consistency for reads/writes.' },
  ],
  milvus: [
    { key: 'indexType', label: 'Index type', type: 'select', options: ['HNSW', 'IVF_FLAT', 'IVF_SQ8'], help: 'ANN index strategy for vectors.' },
    { key: 'consistencyLevel', label: 'Consistency level', type: 'select', options: ['Strong', 'Session', 'Bounded', 'Eventually'], help: 'Consistency strategy for collection operations.' },
  ],
  pgvector: [
    { key: 'schemaName', label: 'Schema name', type: 'text', placeholder: 'public', help: 'Postgres schema containing vector table/index.' },
    { key: 'ivfflatLists', label: 'IVFFlat lists', type: 'number', min: 1, max: 4096, step: 1, help: 'Number of IVF partitions for ivfflat index.' },
  ],
  astra: [
    { key: 'keyspace', label: 'Keyspace', type: 'text', placeholder: 'default_keyspace', required: true, help: 'Astra DB keyspace for vector table.' },
    { key: 'consistencyLevel', label: 'Consistency level', type: 'select', options: ['LOCAL_QUORUM', 'QUORUM', 'ONE'], help: 'Read/write consistency setting.' },
  ],
  couchbase: [
    { key: 'bucketName', label: 'Bucket', type: 'text', placeholder: 'default', required: true, help: 'Couchbase bucket name.' },
    { key: 'scopeName', label: 'Scope', type: 'text', placeholder: '_default', help: 'Couchbase scope for vector docs.' },
    { key: 'useTLS', label: 'Use TLS', type: 'boolean', help: 'Enforce encrypted connection to cluster.' },
  ],
  docstore: [
    { key: 'flushIntervalMs', label: 'Flush interval (ms)', type: 'number', min: 100, max: 60000, step: 100, help: 'How often in-memory data is flushed to disk.' },
    { key: 'maxInMemoryVectors', label: 'Max in-memory vectors', type: 'number', min: 1000, max: 5000000, step: 1000, help: 'Upper memory cap before forced flush/eviction.' },
  ],
  elasticsearch: [
    { key: 'indexLifecyclePolicy', label: 'ILM policy', type: 'text', placeholder: 'xrag-hot-warm', help: 'Optional lifecycle policy name.' },
    { key: 'refreshInterval', label: 'Refresh interval', type: 'select', options: ['1s', '5s', '30s', '60s'], help: 'Segment refresh cadence.' },
  ],
  inmemory: [
    { key: 'maxVectors', label: 'Max vectors', type: 'number', min: 1000, max: 10000000, step: 1000, help: 'Maximum vectors kept in memory.' },
    { key: 'evictionPolicy', label: 'Eviction policy', type: 'select', options: ['none', 'fifo', 'lru'], help: 'Behaviour when max vectors is reached.' },
  ],
  kendra: [
    { key: 'edition', label: 'Kendra edition', type: 'select', options: ['developer', 'enterprise'], help: 'Kendra index edition type.' },
    { key: 'queryLanguage', label: 'Query language', type: 'select', options: ['en', 'es', 'de', 'fr', 'it', 'pt', 'ja'], help: 'Primary language for ranking/tokenisation.' },
  ],
  meilisearch: [
    { key: 'primaryKey', label: 'Primary key', type: 'text', placeholder: 'id', help: 'Document primary key field.' },
    { key: 'rankingRule', label: 'Ranking mode', type: 'select', options: ['vector', 'hybrid'], help: 'Hybrid combines lexical + vector ranking.' },
  ],
  mongodb: [
    { key: 'databaseName', label: 'Database', type: 'text', placeholder: 'xrag', required: true, help: 'MongoDB database name.' },
    { key: 'vectorIndexName', label: 'Vector index name', type: 'text', placeholder: 'xrag_vector_index', required: true, help: 'Atlas vector index identifier.' },
  ],
  opensearch: [
    { key: 'engine', label: 'k-NN engine', type: 'select', options: ['faiss', 'nmslib', 'lucene'], help: 'Underlying OpenSearch ANN engine.' },
    { key: 'efSearch', label: 'efSearch', type: 'number', min: 10, max: 2000, step: 10, help: 'Search-time HNSW candidate expansion.' },
  ],
  redis: [
    { key: 'indexPrefix', label: 'Index prefix', type: 'text', placeholder: 'xrag:', help: 'Key prefix for vector documents.' },
    { key: 'searchTimeoutMs', label: 'Search timeout (ms)', type: 'number', min: 10, max: 60000, step: 10, help: 'Timeout for vector search calls.' },
  ],
  singlestore: [
    { key: 'databaseName', label: 'Database', type: 'text', placeholder: 'xrag', required: true, help: 'SingleStore database name.' },
    { key: 'tableName', label: 'Table', type: 'text', placeholder: 'xrag_vectors', required: true, help: 'Table storing vectors and metadata.' },
  ],
  supabase: [
    { key: 'schemaName', label: 'Schema', type: 'text', placeholder: 'public', help: 'Supabase/Postgres schema name.' },
    { key: 'rpcFunction', label: 'RPC function', type: 'text', placeholder: 'match_documents', help: 'Optional RPC for vector retrieval.' },
  ],
  upstash: [
    { key: 'namespaceName', label: 'Namespace', type: 'text', placeholder: 'default', help: 'Logical namespace in Upstash Vector.' },
    { key: 'consistencyLevel', label: 'Consistency', type: 'select', options: ['eventual', 'strong'], help: 'Read-after-write consistency preference.' },
  ],
  vectara: [
    { key: 'lambda', label: 'Lambda', type: 'number', min: 0, max: 1, step: 0.05, help: 'Vector-vs-keyword blending coefficient.' },
    { key: 'lexicalInterpolation', label: 'Lexical interpolation', type: 'number', min: 0, max: 1, step: 0.05, help: 'Additional lexical weighting control.' },
  ],
  'zep-oss': [
    { key: 'collectionDescription', label: 'Collection description', type: 'text', placeholder: 'XRAG knowledge collection', help: 'Human-readable collection description.' },
    { key: 'autoCreateCollection', label: 'Auto-create collection', type: 'boolean', help: 'Create collection automatically if missing.' },
  ],
  'zep-cloud': [
    { key: 'projectId', label: 'Project ID', type: 'text', placeholder: 'proj_...', required: true, help: 'Zep Cloud project identifier.' },
    { key: 'region', label: 'Cloud region', type: 'select', options: ['us-east-1', 'eu-west-1', 'ap-southeast-1'], help: 'Deployment region for your Zep project.' },
  ],
};

const getCredentialFields = (provider) => {
  if (Array.isArray(provider?.credentialFields) && provider.credentialFields.length > 0) {
    return provider.credentialFields;
  }
  if (provider?.defaultApiKeyEnvVar) {
    return [{
      env_var: provider.defaultApiKeyEnvVar,
      label: 'API Key',
      placeholder: 'sk-...',
      required: true,
      secret: true,
    }];
  }
  return [];
};

const getRequiredCredentialFields = (provider) =>
  getCredentialFields(provider).filter((field) => field.required !== false);

const getRelevantCredentialKeys = (provider, keys) => {
  const envVars = new Set(getCredentialFields(provider).map((field) => field.env_var));
  return Array.isArray(keys)
    ? keys.filter((key) => key.provider === provider?.id || envVars.has(key.env_var))
    : [];
};

const summarizeCredentialState = (provider, keys) => {
  const credentialFields = getCredentialFields(provider);
  if (credentialFields.length === 0) {
    return { label: '', configured: false, required: false };
  }

  const requiredFields = credentialFields.filter((field) => field.required !== false);
  const relevantKeys = getRelevantCredentialKeys(provider, keys);
  const configuredEnvVars = new Set(
    relevantKeys.filter((key) => key.is_active !== false).map((key) => key.env_var),
  );
  const configuredRequiredCount = requiredFields.filter((field) => configuredEnvVars.has(field.env_var)).length;

  if (credentialFields.length === 1) {
    const found = relevantKeys.find((key) => key.env_var === credentialFields[0].env_var) || relevantKeys[0];
    return {
      label: found ? (found.label || 'Key configured') : '',
      configured: requiredFields.length === 0 || configuredRequiredCount === requiredFields.length,
      required: requiredFields.length > 0,
    };
  }

  if (configuredRequiredCount === 0) {
    return {
      label: '',
      configured: requiredFields.length === 0,
      required: requiredFields.length > 0,
    };
  }

  return {
    label:
      requiredFields.length === 0 || configuredRequiredCount === requiredFields.length
        ? `${configuredRequiredCount} credentials configured`
        : `${configuredRequiredCount}/${requiredFields.length} credentials configured`,
    configured: requiredFields.length === 0 || configuredRequiredCount === requiredFields.length,
    required: requiredFields.length > 0,
  };
};

const isBlankValue = (value) => value === undefined || value === null || String(value).trim() === '';

let registryPromise = null;
const loadRegistry = (force = false) => {
  if (force || !registryPromise) {
    registryPromise = xragApi
      .fetchVectorProvidersRegistry()
      .then((data) => (Array.isArray(data?.providers) && data.providers.length ? data.providers : FALLBACK_PROVIDERS))
      .catch(() => FALLBACK_PROVIDERS);
  }
  return registryPromise;
};

const inputClass =
  'w-full rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-emerald-600/60 focus:ring-2 focus:ring-emerald-200/50';
const selectClass =
  'w-full appearance-none rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 pr-7 text-xs text-slate-200 outline-none transition focus:border-emerald-600/60 focus:ring-1 focus:ring-emerald-200/50';
const modalInputClass =
  'min-w-0 flex-1 rounded-xl border border-slate-700/50 bg-[#161b22] px-3 py-2 font-mono text-xs text-slate-200 outline-none transition focus:border-emerald-600/60 focus:ring-1 focus:ring-emerald-600/30';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
      {title}
    </label>
    {help && (
      <span title={help} className="cursor-help text-slate-500 hover:text-emerald-400">
        <CircleHelp size={11} />
      </span>
    )}
  </div>
);

const Toggle = ({ checked, onChange, label, help }) => (
  <div className="flex items-center justify-between rounded-xl border border-slate-700/40 bg-slate-900/30 px-3 py-2">
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">{label}</span>
      {help && (
        <span title={help} className="cursor-help text-slate-500 hover:text-emerald-400">
          <CircleHelp size={10} />
        </span>
      )}
      {checked && (
        <span className="rounded-full border border-emerald-700/40 bg-emerald-900/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
          on
        </span>
      )}
    </div>
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors focus:outline-none ${
        checked ? 'border-emerald-600/60 bg-emerald-500' : 'border-slate-600 bg-slate-700'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
        style={{ marginTop: 1 }}
      />
    </button>
  </div>
);

export const buildVectorStorePayload = (config, embeddingProfile) => ({
  ...config,
  dimensions: Number(embeddingProfile?.nativeDimension) || config.dimensions || null,
  embeddingProfile: embeddingProfile
    ? {
        modelId: embeddingProfile.modelId,
        provider: embeddingProfile.provider,
        nativeDimension: embeddingProfile.nativeDimension,
        metric: embeddingProfile.metric,
      }
    : null,
});

export const buildVectorDatabasePayload = buildVectorStorePayload;

export default function VectorDatabaseSettingsPanel({ value = {}, onChange, embeddingProfile }) {
  const isAwake = Boolean(embeddingProfile?.modelId);

  const [providers, setProviders] = useState(FALLBACK_PROVIDERS);
  const [registryError, setRegistryError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const providerMenuRef = useRef(null);

  const [apiKeyModal, setApiKeyModal] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiKeyFields, setApiKeyFields] = useState({});
  const [apiKeyShowValue, setApiKeyShowValue] = useState(false);
  const [apiKeyShowFields, setApiKeyShowFields] = useState({});
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeyError, setApiKeyError] = useState(null);
  const [existingKeys, setExistingKeys] = useState([]);
  const [existingKeysLoading, setExistingKeysLoading] = useState(false);
  const [selectedExistingKeyId, setSelectedExistingKeyId] = useState('');

  const setField = (field, next) => onChange?.(field, next);

  useEffect(() => {
    loadRegistry().then((list) => {
      if (Array.isArray(list) && list.length) {
        setProviders(list);
      }
    }).catch(() => {});
  }, []);

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

  const provider = useMemo(
    () => providers.find((entry) => entry.id === value.provider) || providers[0],
    [providers, value.provider],
  );

  const credentialFields = useMemo(() => getCredentialFields(provider), [provider]);
  const requiredCredentialFields = useMemo(() => getRequiredCredentialFields(provider), [provider]);
  const additionalFields = useMemo(() => PROVIDER_ADDITIONAL_FIELDS[provider?.id] || [], [provider?.id]);
  const missingAdditionalRequired = useMemo(
    () => additionalFields.filter((field) => field.required && isBlankValue(value[field.key])),
    [additionalFields, value],
  );
  const hasCredentialFields = credentialFields.length > 0;
  const isMultiCredentialProvider = credentialFields.length > 1;
  const providerNeedsCredentials = requiredCredentialFields.length > 0;
  const credentialButtonReady = providerNeedsCredentials ? apiKeyConfigured : Boolean(apiKeyMasked);

  const refreshCredentialState = async (providerSpec = provider) => {
    if (!providerSpec) {
      setApiKeyMasked('');
      setApiKeyConfigured(false);
      return;
    }
    try {
      const keys = await xragApi.listApiKeys();
      const summary = summarizeCredentialState(providerSpec, keys);
      setApiKeyMasked(summary.label);
      setApiKeyConfigured(summary.configured);
    } catch {
      setApiKeyMasked('');
      setApiKeyConfigured(false);
    }
  };

  useEffect(() => {
    refreshCredentialState(provider);
  }, [provider?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!embeddingProfile) return;
    const native = Number(embeddingProfile.nativeDimension) || null;
    if (native && Number(value.dimensions) !== native) {
      setField('dimensions', native);
    }

    const preferredMetric = embeddingProfile.metric === 'dot_product' ? 'dotproduct' : (embeddingProfile.metric || 'cosine');
    const supportedMetrics = provider?.supportedMetrics || ['cosine'];
    const nextMetric = supportedMetrics.includes(preferredMetric) ? preferredMetric : supportedMetrics[0];
    if (value.metric !== nextMetric) {
      setField('metric', nextMetric);
    }

    if (!value.embeddingProfile || value.embeddingProfile.modelId !== embeddingProfile.modelId) {
      setField('embeddingProfile', {
        modelId: embeddingProfile.modelId,
        provider: embeddingProfile.provider,
        nativeDimension: embeddingProfile.nativeDimension,
        metric: embeddingProfile.metric,
      });
    }
  }, [embeddingProfile?.modelId, embeddingProfile?.nativeDimension, provider?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const payload = useMemo(
    () => buildVectorStorePayload(value, embeddingProfile),
    [value, embeddingProfile],
  );

  const refresh = () => {
    setRefreshing(true);
    setRegistryError(null);
    loadRegistry(true)
      .then((list) => {
        if (Array.isArray(list) && list.length) {
          setProviders(list);
        } else {
          setRegistryError('Backend unreachable - using built-in catalog.');
        }
      })
      .catch(() => setRegistryError('Backend unreachable - using built-in catalog.'))
      .finally(() => setRefreshing(false));
  };

  const openApiKeyModal = () => {
    if (!hasCredentialFields) return;
    setApiKeyName('');
    setApiKeyValue('');
    setApiKeyFields(Object.fromEntries(credentialFields.map((field) => [field.env_var, ''])));
    setApiKeyShowValue(false);
    setApiKeyShowFields({});
    setApiKeyError(null);
    setSelectedExistingKeyId('');
    setExistingKeys([]);

    if (isMultiCredentialProvider) {
      setExistingKeysLoading(false);
    } else {
      setExistingKeysLoading(true);
      xragApi.listApiKeys()
        .then((keys) => setExistingKeys(getRelevantCredentialKeys(provider, keys)))
        .catch(() => setExistingKeys([]))
        .finally(() => setExistingKeysLoading(false));
    }

    setApiKeyModal(true);
  };

  const saveApiKey = async () => {
    if (!hasCredentialFields) return;
    setApiKeySaving(true);
    setApiKeyError(null);

    try {
      if (selectedExistingKeyId) {
        await xragApi.activateApiKey(selectedExistingKeyId);
        const found = existingKeys.find((entry) => entry.id === selectedExistingKeyId);
        setApiKeyMasked(found?.label ?? 'Existing key activated');
        setApiKeyConfigured(true);
      } else if (isMultiCredentialProvider) {
        const valuesToSave = credentialFields.filter((field) => String(apiKeyFields[field.env_var] ?? '').trim());
        if (valuesToSave.length === 0) return;
        const baseName = apiKeyName.trim() || provider.credentialTitle || provider.label;
        await Promise.all(valuesToSave.map((field) => xragApi.upsertApiKey({
          label: `${baseName} - ${field.label}`,
          provider: provider.id,
          env_var: field.env_var,
          key: String(apiKeyFields[field.env_var] ?? '').trim(),
          is_active: true,
        })));
        await refreshCredentialState(provider);
      } else {
        if (!apiKeyValue.trim()) return;
        await xragApi.upsertApiKey({
          label: apiKeyName.trim() || `${provider.label} key`,
          provider: provider.id,
          env_var: credentialFields[0]?.env_var,
          key: apiKeyValue.trim(),
          is_active: true,
        });
        const valuePreview = apiKeyValue.trim();
        setApiKeyMasked(
          valuePreview.length <= 8
            ? '•'.repeat(valuePreview.length)
            : `${valuePreview.slice(0, 4)}…${valuePreview.slice(-4)}`,
        );
        setApiKeyConfigured(true);
      }
      setApiKeyModal(false);
    } catch (error) {
      setApiKeyError(error?.message || 'Failed to save credentials');
    } finally {
      setApiKeySaving(false);
    }
  };

  if (!isAwake) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border-2 border-dashed border-emerald-600/60 bg-emerald-900/15 p-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0d1117] shadow-sm ring-1 ring-emerald-700/60">
              <Lock size={18} className="text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Vector Store - idle</p>
              <p className="text-xs font-semibold text-slate-200">Connect an Embedding model to wake this node.</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-[11px] text-slate-400">
            <Layers size={12} />
            <span className="font-bold">Embedding profile</span>
            <span className="ml-auto font-mono text-[10px] text-emerald-600">missing</span>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-300">
            Drop in an <span className="font-bold text-amber-400">Embedding</span> node, wire it here, and the panel auto-wakes.
            Dimension and metric are locked to the upstream model.
          </p>
        </div>
      </div>
    );
  }

  const warnings = [];
  if (provider?.fields?.includes('indexName') && !value.indexName) warnings.push('Index name is required for this provider.');
  if (provider?.fields?.includes('collection') && !value.collection) warnings.push('Collection name is required for this provider.');
  if (provider?.fields?.includes('url') && !value.url && provider.id !== 'chroma') warnings.push('Endpoint URL is required for this provider.');
  if (providerNeedsCredentials && !apiKeyConfigured) warnings.push(isMultiCredentialProvider ? 'Required credentials are not fully configured for this provider.' : 'API key is required for this provider.');
  if (missingAdditionalRequired.length > 0) {
    warnings.push(
      `Required provider parameters are missing: ${missingAdditionalRequired.map((field) => field.label).join(', ')}.`,
    );
  }

  const canSaveNewCredentials = isMultiCredentialProvider
    ? credentialFields.some((field) => String(apiKeyFields[field.env_var] ?? '').trim())
      && requiredCredentialFields.every((field) => String(apiKeyFields[field.env_var] ?? '').trim())
    : Boolean(apiKeyValue.trim());

  return (
    <>
      <div className="space-y-3">
        <section className="space-y-2.5 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database size={12} className="text-emerald-500" />
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Provider</h4>
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700/50 bg-[#0d1117] px-2 py-0.5 text-[10px] font-semibold text-slate-300 transition hover:border-emerald-600/60 hover:text-emerald-400 disabled:opacity-50"
            >
              <RefreshCw size={9} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </header>

          {registryError && (
            <p className="flex items-center gap-1.5 rounded-md border border-amber-700/40 bg-amber-900/20 px-2 py-1 text-[10px] font-semibold text-amber-300">
              <AlertTriangle size={10} className="shrink-0" />
              {registryError}
            </p>
          )}

          <div className="flex items-center gap-2.5 rounded-xl border border-slate-700/40 bg-slate-900/40 p-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-800/60 to-emerald-900/80 text-[11px] font-black text-emerald-200 ring-1 ring-emerald-600/30">
              {provider?.initials || '??'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="relative" ref={providerMenuRef}>
                <button
                  type="button"
                  onClick={() => setProviderOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-1 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-left text-xs font-semibold text-slate-100 transition hover:border-emerald-700/40 hover:text-emerald-200"
                >
                  <span className="truncate">{provider?.label || 'Select provider...'}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-full border border-emerald-700/40 bg-emerald-900/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-400">
                      {provider?.badge || ''}
                    </span>
                    <ChevronDown size={12} className={`text-slate-400 transition ${providerOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {providerOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-700/60 bg-[#0d1117] shadow-2xl shadow-black/60">
                    {providers.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          setField('provider', entry.id);
                          setProviderOpen(false);
                        }}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition hover:bg-emerald-900/20 ${
                          entry.id === provider?.id ? 'bg-emerald-900/30 text-emerald-200' : 'text-slate-200'
                        }`}
                      >
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-800 text-[9px] font-black text-slate-300">
                          {entry.initials}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{entry.label}</span>
                        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-slate-500">{entry.badge}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="mt-1 truncate text-[10px] text-slate-500">{provider?.description}</p>
            </div>
          </div>

          {hasCredentialFields && (
            <button
              type="button"
              onClick={openApiKeyModal}
              className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
                credentialButtonReady
                  ? 'border-emerald-700/40 bg-emerald-900/15 hover:border-emerald-600/50'
                  : 'border-amber-700/40 bg-amber-900/10 hover:border-amber-600/50'
              }`}
            >
              <Lock size={13} className={credentialButtonReady ? 'text-emerald-400' : 'text-amber-500'} />
              <span className={`flex-1 font-mono text-xs ${credentialButtonReady ? 'text-emerald-300' : 'text-slate-400'}`}>
                {apiKeyMasked || (isMultiCredentialProvider ? 'Click to configure credentials...' : 'Click to set API key...')}
              </span>
              {credentialButtonReady
                ? <CheckCircle2 size={12} className="shrink-0 text-emerald-400" />
                : <AlertTriangle size={12} className="shrink-0 text-amber-500" />}
            </button>
          )}
        </section>

        <section className="space-y-2.5 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
          <header className="flex items-center gap-2">
            <Layers size={12} className="text-emerald-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Index / Collection</h4>
          </header>

          {provider?.fields?.includes('indexName') && (
            <div>
              <FieldLabel title="Index name" help="Globally unique identifier of the vector index." />
              <input type="text" value={value.indexName || ''} onChange={(event) => setField('indexName', event.target.value)} className={inputClass} placeholder="xrag-default" />
            </div>
          )}

          {provider?.fields?.includes('collection') && (
            <div>
              <FieldLabel title="Collection" help="Logical grouping of vectors inside the database." />
              <input type="text" value={value.collection || ''} onChange={(event) => setField('collection', event.target.value)} className={inputClass} placeholder="default" />
            </div>
          )}

          {provider?.fields?.includes('namespace') && (
            <div>
              <FieldLabel title="Namespace" help="Optional sub-partition inside the index." />
              <input type="text" value={value.namespace || ''} onChange={(event) => setField('namespace', event.target.value)} className={inputClass} placeholder="(default)" />
            </div>
          )}

          {provider?.id === 'pinecone' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel title="Cloud" />
                  <div className="relative">
                    <select value={value.cloud || 'aws'} onChange={(event) => setField('cloud', event.target.value)} className={selectClass}>
                      {PINECONE_CLOUDS.map((cloud) => (
                        <option key={cloud.id} value={cloud.id}>{cloud.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
                <div>
                  <FieldLabel title="Region" />
                  <div className="relative">
                    <select value={value.region || 'us-east-1'} onChange={(event) => setField('region', event.target.value)} className={selectClass}>
                      {(PINECONE_REGIONS[value.cloud || 'aws'] || []).map((region) => (
                        <option key={region} value={region}>{region}</option>
                      ))}
                    </select>
                    <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
              </div>
              <div>
                <FieldLabel title="Pod environment (legacy)" help="Leave blank for serverless." />
                <input type="text" value={value.environment || ''} onChange={(event) => setField('environment', event.target.value)} className={inputClass} placeholder="(serverless)" />
              </div>
            </>
          )}

          {provider?.fields?.includes('url') && (
            <div>
              <FieldLabel title="Endpoint URL" help="HTTP(S) URL of your self-hosted or cloud instance." />
              <input type="text" value={value.url || ''} onChange={(event) => setField('url', event.target.value)} className={inputClass} placeholder="https://your-instance.example.com" />
            </div>
          )}

          {provider?.fields?.includes('persistDirectory') && (
            <div>
              <FieldLabel title="Persist directory" help="Local filesystem path for embedded or file-backed mode." />
              <input type="text" value={value.persistDirectory || ''} onChange={(event) => setField('persistDirectory', event.target.value)} className={`${inputClass} font-mono`} placeholder="./vector_db" />
            </div>
          )}

          {(provider?.fields?.includes('shards') || provider?.fields?.includes('replicas')) && (
            <div className="grid grid-cols-2 gap-2">
              {provider.fields.includes('shards') && (
                <div>
                  <FieldLabel title="Shards" />
                  <input type="number" min={1} value={value.shards ?? 1} onChange={(event) => setField('shards', Number(event.target.value))} className={inputClass} />
                </div>
              )}
              {provider.fields.includes('replicas') && (
                <div>
                  <FieldLabel title="Replicas" />
                  <input type="number" min={1} value={value.replicas ?? 1} onChange={(event) => setField('replicas', Number(event.target.value))} className={inputClass} />
                </div>
              )}
            </div>
          )}

          {provider?.id === 'kendra' && (
            <div>
              <FieldLabel title="AWS Region" />
              <div className="relative">
                <select value={value.region || 'us-east-1'} onChange={(event) => setField('region', event.target.value)} className={selectClass}>
                  {AWS_REGIONS.map((region) => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2.5 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
          <header className="flex items-center gap-2">
            <BrainCircuit size={12} className="text-emerald-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Vector space</h4>
          </header>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel title="Dimensions" help="Locked to the upstream embedding model vector size." />
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-800/40 px-2.5 py-1.5">
                <Lock size={11} className="shrink-0 text-slate-400" />
                <span className="font-mono text-xs font-bold text-slate-200">
                  {value.dimensions || embeddingProfile?.nativeDimension || '-'}
                </span>
              </div>
            </div>
            <div>
              <FieldLabel title="Distance metric" help="Constrained to the provider supported metrics." />
              <div className="relative">
                <select value={value.metric || provider?.supportedMetrics?.[0] || 'cosine'} onChange={(event) => setField('metric', event.target.value)} className={selectClass}>
                  {(provider?.supportedMetrics || ['cosine']).map((metric) => (
                    <option key={metric} value={metric}>{METRIC_LABELS[metric] || metric}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>
          <p className="text-[10px] text-slate-500">
            Embedding model: <span className="font-mono text-slate-300">{embeddingProfile?.modelId || '-'}</span>
          </p>
        </section>

        <section className="space-y-2.5 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
          <header className="flex items-center gap-2">
            <Server size={12} className="text-emerald-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Indexing behaviour</h4>
          </header>
          <div>
            <FieldLabel title="Metadata fields" help="Comma-separated chunk metadata keys stored with each vector." />
            <input type="text" value={value.metadataFields || ''} onChange={(event) => setField('metadataFields', event.target.value)} className={`${inputClass} font-mono`} placeholder="source,title,page" />
          </div>
          <div>
            <FieldLabel title="Upsert batch size" help="Vectors sent per write request." />
            <input type="number" min={1} max={1000} value={value.upsertBatchSize ?? 100} onChange={(event) => setField('upsertBatchSize', Number(event.target.value))} className={inputClass} />
          </div>
          {provider?.fields?.includes('hybridSearch') && (
            <Toggle checked={Boolean(value.hybridSearch)} onChange={(next) => setField('hybridSearch', next)} label="Hybrid search" help="Combine sparse and dense retrieval at query time." />
          )}
        </section>

        {additionalFields.length > 0 && (
          <section className="space-y-2.5 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
            <header className="flex items-center gap-2">
              <Server size={12} className="text-emerald-500" />
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Additional provider parameters</h4>
            </header>

            {additionalFields.map((field) => (
              <div key={field.key}>
                <FieldLabel
                  title={`${field.label}${field.required ? ' *' : ''}`}
                  help={field.help}
                />

                {field.type === 'boolean' ? (
                  <Toggle
                    checked={Boolean(value[field.key])}
                    onChange={(next) => setField(field.key, next)}
                    label={field.label}
                    help={field.help}
                  />
                ) : field.type === 'select' ? (
                  <div className="relative">
                    <select
                      value={value[field.key] ?? ''}
                      onChange={(event) => setField(field.key, event.target.value)}
                      className={selectClass}
                    >
                      <option value="">Select...</option>
                      {(field.options || []).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                ) : field.type === 'number' ? (
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={value[field.key] ?? ''}
                    onChange={(event) => {
                      const raw = event.target.value;
                      setField(field.key, raw === '' ? '' : Number(raw));
                    }}
                    className={inputClass}
                    placeholder={field.placeholder}
                  />
                ) : (
                  <input
                    type="text"
                    value={value[field.key] ?? ''}
                    onChange={(event) => setField(field.key, event.target.value)}
                    className={inputClass}
                    placeholder={field.placeholder}
                  />
                )}
              </div>
            ))}
          </section>
        )}

        {warnings.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-amber-700/40 bg-amber-900/15 p-2.5">
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-amber-400" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Configuration issues</p>
            </div>
            <ul className="space-y-1">
              {warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-1.5 rounded-lg border border-amber-700/40 bg-[#0d1117]/70 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-200">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0 text-amber-500" />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-700/40 bg-gradient-to-r from-emerald-900/30 to-emerald-800/10 p-2.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-900/40 ring-1 ring-emerald-700/40">
                <CheckCircle2 size={12} className="text-emerald-400" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Configuration valid</p>
                <p className="text-[10.5px] font-medium text-emerald-200/90">Ready to upsert vectors.</p>
              </div>
            </div>
          </div>
        )}

        <details className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-3">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Output payload (read-only)
          </summary>
          <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-emerald-200">
{JSON.stringify(payload, null, 2)}
          </pre>
        </details>

        <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          <Zap size={11} className="text-emerald-400" />
          Input: <span className="font-mono text-emerald-400">embedded_chunks</span>
          <span className="mx-1 text-slate-600">·</span>
          Output: <span className="font-mono text-emerald-400">chunks</span>
        </div>
      </div>

      {apiKeyModal && provider && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 2147483647, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setApiKeyModal(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-[#0d1117] shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-700/50 px-4 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-900/60 ring-1 ring-emerald-700/40">
                <Key size={15} className="text-emerald-300" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-slate-100">{provider.credentialTitle || provider.label}</p>
                <p className="font-mono text-[10px] text-slate-500">
                  {isMultiCredentialProvider ? `${credentialFields.length} credentials` : credentialFields[0]?.env_var}
                </p>
              </div>
              <button type="button" onClick={() => setApiKeyModal(false)} className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200">
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              {provider.credentialNotice?.text && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
                  {provider.credentialNotice.text}
                </div>
              )}

              {!isMultiCredentialProvider && (existingKeysLoading || existingKeys.length > 0) && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Existing key</label>
                  {existingKeysLoading ? (
                    <p className="text-[10px] text-slate-500">Loading saved keys...</p>
                  ) : (
                    <select value={selectedExistingKeyId} onChange={(event) => setSelectedExistingKeyId(event.target.value)} className="w-full rounded-xl border border-slate-700/50 bg-[#161b22] px-3 py-2 text-xs text-slate-200 outline-none transition focus:border-emerald-600/60 focus:ring-1 focus:ring-emerald-600/30">
                      <option value="">+ Enter new key...</option>
                      {existingKeys.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label ?? entry.env_var}{entry.is_active ? ' ✓' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {!selectedExistingKeyId && (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {isMultiCredentialProvider ? 'Credential name' : 'Label'} <span className="normal-case text-slate-600">(optional)</span>
                    </label>
                    <input type="text" value={apiKeyName} onChange={(event) => setApiKeyName(event.target.value)} placeholder={`${provider.credentialTitle || provider.label}${isMultiCredentialProvider ? ' credentials' : ' key'}`} className="w-full rounded-xl border border-slate-700/50 bg-[#161b22] px-3 py-2 text-xs text-slate-200 outline-none transition focus:border-emerald-600/60 focus:ring-1 focus:ring-emerald-600/30" />
                  </div>

                  {isMultiCredentialProvider ? credentialFields.map((field) => (
                    <div key={field.env_var} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          {field.label}
                          {field.required !== false && <span className="text-red-400"> *</span>}
                        </label>
                        <span className="font-mono text-[9px] text-slate-600">{field.env_var}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type={field.secret && !apiKeyShowFields[field.env_var] ? 'password' : 'text'}
                          value={apiKeyFields[field.env_var] ?? ''}
                          onChange={(event) => setApiKeyFields((previous) => ({ ...previous, [field.env_var]: event.target.value }))}
                          onKeyDown={(event) => { if (event.key === 'Enter') saveApiKey(); }}
                          placeholder={field.placeholder}
                          className={modalInputClass}
                        />
                        {field.secret && (
                          <button
                            type="button"
                            onClick={() => setApiKeyShowFields((previous) => ({ ...previous, [field.env_var]: !previous[field.env_var] }))}
                            className="shrink-0 rounded-xl border border-slate-700/50 bg-[#161b22] px-2.5 text-[10px] font-semibold text-slate-400 transition hover:text-slate-200"
                          >
                            {apiKeyShowFields[field.env_var] ? 'Hide' : 'Show'}
                          </button>
                        )}
                      </div>
                    </div>
                  )) : (
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {credentialFields[0]?.label || 'API Key'} <span className="text-red-400">*</span>
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type={apiKeyShowValue ? 'text' : 'password'}
                          value={apiKeyValue}
                          onChange={(event) => setApiKeyValue(event.target.value)}
                          onKeyDown={(event) => { if (event.key === 'Enter') saveApiKey(); }}
                          placeholder={credentialFields[0]?.placeholder || 'sk-...'}
                          className={modalInputClass}
                        />
                        <button type="button" onClick={() => setApiKeyShowValue((visible) => !visible)} className="shrink-0 rounded-xl border border-slate-700/50 bg-[#161b22] px-2.5 text-[10px] font-semibold text-slate-400 transition hover:text-slate-200">
                          {apiKeyShowValue ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/30 bg-slate-800/40 px-2.5 py-1.5">
                    <ShieldCheck size={11} className="shrink-0 text-slate-500" />
                    <span className="text-[10px] text-slate-400">
                      {isMultiCredentialProvider
                        ? 'Saved server-side as provider-specific environment variables - never sent to the browser.'
                        : <>Saved server-side as <span className="font-mono font-bold text-slate-300">{credentialFields[0]?.env_var}</span> - never sent to the browser.</>}
                    </span>
                  </div>
                </>
              )}

              {apiKeyError && (
                <p className="flex items-center gap-1.5 text-[10.5px] text-red-400">
                  <AlertTriangle size={11} className="shrink-0" />
                  {apiKeyError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-700/50 px-4 py-3">
              <button type="button" onClick={() => setApiKeyModal(false)} className="rounded-xl border border-slate-700/50 px-4 py-1.5 text-xs font-semibold text-slate-400 transition hover:border-slate-600 hover:text-slate-200">
                Cancel
              </button>
              <button
                type="button"
                onClick={saveApiKey}
                disabled={apiKeySaving || (!selectedExistingKeyId && !canSaveNewCredentials)}
                className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow transition hover:from-emerald-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {apiKeySaving ? 'Saving...' : selectedExistingKeyId ? 'Use this key' : 'Save & Activate'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
