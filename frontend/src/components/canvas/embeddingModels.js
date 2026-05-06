// Embedding model registry — drives the "smart awakening" UX of the Chunking node.
// When a Chunking node is connected to one of these models, the inspector
// adapts its labels, defaults, limits, and extra fields to match the model's
// real-world constraints.

export const EMBEDDING_PROFILES = [
  // ── OpenAI ────────────────────────────────────────────────────────────────
  {
    matches: ['text-embedding-3-large'],
    label: 'OpenAI · text-embedding-3-large',
    provider: 'openai',
    family: 'openai-v3',
    unit: 'tokens',
    unitLabel: 'Token (Tiktoken)',
    tokenizer: 'cl100k_base',
    lengthFunction: 'tiktoken',
    maxChunkSize: 8191,
    defaults: { chunkSize: 1000, overlap: 250 },
    nativeDimension: 3072,
    minDimension: 256,
    metric: 'cosine',
    supportsMatryoshka: true,
    supportsSemantic: true,
    color: 'amber',
    badge: 'OpenAI v3',
  },
  {
    matches: ['text-embedding-3-small'],
    label: 'OpenAI · text-embedding-3-small',
    provider: 'openai',
    family: 'openai-v3',
    unit: 'tokens',
    unitLabel: 'Token (Tiktoken)',
    tokenizer: 'cl100k_base',
    lengthFunction: 'tiktoken',
    maxChunkSize: 8191,
    defaults: { chunkSize: 1000, overlap: 250 },
    nativeDimension: 1536,
    minDimension: 256,
    metric: 'cosine',
    supportsMatryoshka: true,
    supportsSemantic: true,
    color: 'amber',
    badge: 'OpenAI v3',
  },
  {
    matches: ['text-embedding-ada-002'],
    label: 'OpenAI · text-embedding-ada-002',
    provider: 'openai',
    family: 'openai-v2',
    unit: 'tokens',
    unitLabel: 'Token (Tiktoken)',
    tokenizer: 'cl100k_base',
    lengthFunction: 'tiktoken',
    maxChunkSize: 8191,
    defaults: { chunkSize: 1000, overlap: 200 },
    nativeDimension: 1536,
    minDimension: 1536,
    metric: 'cosine',
    supportsMatryoshka: false,
    supportsSemantic: true,
    color: 'amber',
    badge: 'OpenAI v2',
  },

  // ── Cohere ────────────────────────────────────────────────────────────────
  {
    matches: ['cohere', 'embed-english', 'embed-multilingual'],
    label: 'Cohere · embed-english-v3.0',
    provider: 'cohere',
    family: 'cohere-v3',
    unit: 'tokens',
    unitLabel: 'Token (Cohere)',
    tokenizer: 'cohere',
    lengthFunction: 'tokens',
    maxChunkSize: 2048,
    defaults: { chunkSize: 750, overlap: 150 },
    nativeDimension: 1024,
    minDimension: 1024,
    metric: 'cosine',
    supportsSemantic: true,
    color: 'sky',
    badge: 'Cohere',
  },

  // ── HuggingFace / local ───────────────────────────────────────────────────
  {
    matches: ['bge', 'BAAI/bge'],
    label: 'HuggingFace · BAAI/bge-base-en-v1.5',
    provider: 'huggingface',
    family: 'bge',
    unit: 'characters',
    unitLabel: 'Karakterszám (chars)',
    tokenizer: 'BAAI/bge-base-en-v1.5',
    lengthFunction: 'characters',
    maxChunkSize: 512,
    defaults: { chunkSize: 400, overlap: 50 },
    nativeDimension: 768,
    minDimension: 768,
    metric: 'cosine',
    queryPrefix: 'Represent this sentence for searching relevant passages: ',
    documentPrefix: '',
    batchSize: 32,
    color: 'rose',
    badge: 'HuggingFace',
  },
  {
    matches: ['e5', 'intfloat/e5'],
    label: 'HuggingFace · intfloat/e5-large-v2',
    provider: 'huggingface',
    family: 'e5',
    unit: 'characters',
    unitLabel: 'Karakterszám (chars)',
    tokenizer: 'intfloat/e5-large-v2',
    lengthFunction: 'characters',
    maxChunkSize: 512,
    defaults: { chunkSize: 400, overlap: 50 },
    nativeDimension: 1024,
    minDimension: 1024,
    metric: 'cosine',
    queryPrefix: 'query: ',
    documentPrefix: 'passage: ',
    batchSize: 32,
    color: 'rose',
    badge: 'HuggingFace',
  },
  {
    matches: ['MiniLM', 'all-MiniLM'],
    label: 'HuggingFace · all-MiniLM-L6-v2',
    provider: 'huggingface',
    family: 'minilm',
    unit: 'characters',
    unitLabel: 'Karakterszám (chars)',
    tokenizer: 'sentence-transformers/all-MiniLM-L6-v2',
    lengthFunction: 'characters',
    maxChunkSize: 256,
    defaults: { chunkSize: 220, overlap: 40 },
    nativeDimension: 384,
    minDimension: 384,
    metric: 'cosine',
    queryPrefix: '',
    documentPrefix: '',
    batchSize: 64,
    color: 'rose',
    badge: 'HuggingFace',
  },
  {
    matches: ['jina'],
    label: 'HuggingFace · jina-embeddings-v2-base-en',
    provider: 'huggingface',
    family: 'jina',
    unit: 'characters',
    unitLabel: 'Karakterszám (chars)',
    tokenizer: 'jinaai/jina-embeddings-v2-base-en',
    lengthFunction: 'characters',
    maxChunkSize: 8192,
    defaults: { chunkSize: 1000, overlap: 200 },
    nativeDimension: 768,
    minDimension: 768,
    metric: 'cosine',
    batchSize: 32,
    color: 'rose',
    badge: 'HuggingFace',
  },
];

// Resolve a model identifier (free-form string) to one of the known profiles.
// Match is case-insensitive and substring-based — first match wins. Returns
// null when no profile fits, so callers can render a generic fallback.
export const resolveEmbeddingProfile = (modelIdentifier) => {
  if (!modelIdentifier) {
    return null;
  }

  const haystack = String(modelIdentifier).toLowerCase();
  for (const profile of EMBEDDING_PROFILES) {
    if (profile.matches.some((needle) => haystack.includes(String(needle).toLowerCase()))) {
      return profile;
    }
  }

  return null;
};

// Computes the chunking-config patch implied by a model profile. Used both as
// the auto-fill payload on connect and as the "intelligent default" baseline
// shown in the inspector.
export const buildChunkingDefaultsForProfile = (profile) => {
  if (!profile) {
    return {};
  }

  const patch = {
    chunkSize: profile.defaults.chunkSize,
    overlap: profile.defaults.overlap,
    lengthFunction: profile.lengthFunction,
  };

  if (profile.tokenizer && profile.lengthFunction === 'tiktoken') {
    patch.tokenModel = profile.tokenizer;
  }
  if (profile.lengthFunction === 'huggingface' || profile.provider === 'huggingface') {
    patch.hfTokenizerModel = profile.tokenizer;
  }
  if (profile.queryPrefix !== undefined) {
    patch.queryInstruction = profile.queryPrefix;
  }
  if (profile.documentPrefix !== undefined) {
    patch.documentInstruction = profile.documentPrefix;
  }
  if (profile.batchSize !== undefined) {
    patch.batchSize = profile.batchSize;
  }
  if (profile.supportsMatryoshka) {
    patch.embeddingDimension = profile.nativeDimension;
  }

  return patch;
};

// Build a profile object from the live config of an OpenRouter-backed
// embedding node. The Chunking inspector consumes this so it can wake up
// and adapt its UI to the upstream model.
export const profileFromEmbeddingConfig = (config) => {
  if (!config) return null;

  // Accept both the raw node config (fields stored directly by EmbeddingSettingsPanel)
  // and the built payload shape (gateway + metadata wrapper). The panel stores
  // embeddingProvider (not 'backend_proxy') as the gateway, so we must not
  // gate on that value.
  const metadata = config.metadata || null;
  const modelId = metadata?.model_id || config.model_id || '';
  if (!modelId) return null;

  // Resolve numeric caps from either the metadata wrapper or direct fields.
  const maxTokens =
    Number(metadata?.max_token_capacity ?? config.max_token_capacity) || 512;
  const outputDims =
    Number(metadata?.output_dimensions ?? config.output_dimensions) || 1536;
  const batchSz =
    Number(metadata?.batch_size ?? config.batch_size) || 100;

  // Heuristic: pick a length function from the model id.
  const idLower = modelId.toLowerCase();
  const isOpenAi = idLower.startsWith('openai/');
  const isCohere = idLower.startsWith('cohere/');
  const lengthFunction = isOpenAi ? 'tiktoken' : isCohere ? 'characters' : 'huggingface';

  return {
    provider: 'openrouter',
    family: 'openrouter',
    modelId,
    tokenizer: isOpenAi ? 'cl100k_base' : modelId,
    lengthFunction,
    unit: lengthFunction === 'characters' ? 'characters' : 'tokens',
    unitLabel: lengthFunction === 'characters' ? 'Characters' : 'Tokens',
    maxChunkSize: maxTokens,
    defaults: {
      chunkSize: Math.min(1000, Math.floor(maxTokens * 0.8)),
      overlap: Math.min(200, Math.floor(maxTokens * 0.15)),
    },
    nativeDimension: outputDims,
    minDimension: outputDims,
    metric: idLower.includes('bge') ? 'dot_product' : 'cosine',
    batchSize: batchSz,
    queryPrefix: '',
    documentPrefix: '',
    supportsMatryoshka: idLower.includes('text-embedding-3-'),
    color: 'amber',
    label: `OpenRouter · ${modelId}`,
    badge: 'OpenRouter',
  };
};
