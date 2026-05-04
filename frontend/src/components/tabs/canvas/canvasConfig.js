import {
  Brain,
  Bot,
  Database,
  Eye,
  FileInput,
  Filter,
  GitBranch,
  Globe,
  Image as ImageIcon,
  MessageSquare,
  Mic,
  Network,
  Repeat,
  ScissorsLineDashed,
  Search,
  Shield,
  Sparkles,
  ScrollText,
  User,
  Volume2,
} from 'lucide-react';
import { DEFAULT_UPLOADED_DOCUMENTS_CONFIG } from '../../../data/documentUploadSchema';

export const NODE_LIBRARY = [
  {
    key: 'user-actor',
    category: 'Interaction',
    label: 'User',
    description: 'End-user actor in conversation flow',
    icon: User,
    colorClass: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700',
    config: {
      preset: 'enterprise-user',
      // Identity & RBAC
      role: 'user',
      tenantId: 'acme-corp',
      userId: '',
      requireAuth: true,
      // Personalisation
      locale: 'en',
      expertise: 'intermediate',
      tone: 'professional',
      // Session
      channel: 'web_chat',
      sessionId: '',
      rememberHistory: true,
      // Capabilities & limits
      allowedTools: ['retrieve', 'rerank', 'cite'],
      rateLimitRpm: 60,
      // Privacy
      consentDataCollection: true,
      consentTraining: false,
    },
  },
  {
    key: 'input-question',
    category: 'Interaction',
    label: 'Question',
    description: 'User query input channel',
    icon: MessageSquare,
    colorClass: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700',
    hiddenInPalette: true,
    config: {
      // Input shape
      mode: 'free_text',
      language: 'auto',
      placeholder: 'Ask your question…',
      sampleQuery: '',
      multipleChoiceOptions: '',
      // Validation
      minLength: 3,
      maxLength: 4000,
      required: true,
      blocklistRegex: '',
      // Pre-processing
      trimWhitespace: true,
      collapseWhitespace: true,
      normalizeUnicode: true,
      stripEmoji: false,
      caseFold: false,
      // Multi-turn
      appendHistory: true,
      historyTurns: 4,
    },
  },
  {
    key: 'input-upload',
    category: 'Sources',
    label: 'Uploaded Documents',
    description: 'Pick already-ingested documents or whole folders from the Knowledge Base',
    icon: FileInput,
    colorClass: 'bg-violet-50 border-violet-200 text-violet-700',
    config: { ...DEFAULT_UPLOADED_DOCUMENTS_CONFIG },
  },
  {
    key: 'input-url',
    category: 'Sources',
    label: 'URL Scraper',
    description: 'Web crawler ingestion',
    icon: Globe,
    colorClass: 'bg-violet-50 border-violet-200 text-violet-700',
    config: { depth: 2 },
  },
  {
    key: 'process-chunking',
    category: 'Ingestion',
    label: 'Chunking',
    description: 'Recursive text split',
    icon: ScissorsLineDashed,
    colorClass: 'bg-sky-50 border-sky-200 text-sky-700',
    config: {
      strategy: 'recursive',
      chunkSize: 750,
      overlap: 250,
      separators: '\\n\\n,\\n,. , ,',
      keepSeparator: true,
      lengthFunction: 'characters',
      tokenModel: 'cl100k_base',
      hfTokenizerModel: 'BAAI/bge-base-en-v1.5',
      codeLanguage: 'python',
      headersToSplitOn: 'h1,h2,h3',
      includeHeadersInMetadata: true,
      semanticBreakpointType: 'percentile',
      semanticThreshold: 95,
      smartMergeShortChunks: true,
      respectSentenceBoundary: true,
      addContextHeader: false,
      dedupNearDuplicates: false,
      dedupSimilarity: 0.92,
      minChunkChars: 0,
      stripWhitespace: true,
    },
  },
  {
    key: 'process-embedding',
    category: 'Ingestion',
    label: 'Embedding Model',
    description: 'OpenRouter via secure backend proxy',
    icon: Sparkles,
    colorClass: 'bg-sky-50 border-sky-200 text-sky-700',
    config: {
      gateway: 'backend_proxy',
      // The API key lives on the backend (.env: OPENROUTER_API_KEY) — never here.
      model_id: '',
      max_token_capacity: 0,
      output_dimensions: null,
      is_cached: true,
      batch_size: 100,
      // Computed by the panel; downstream nodes read this:
      metadata: null,
    },
  },
  {
    key: 'process-reranker',
    category: 'Retrieval',
    label: 'Reranker',
    description: 'Query-aware OpenRouter reranker (Cohere / Voyage / Jina)',
    icon: Filter,
    colorClass: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    config: {
      gateway: 'backend_proxy',
      metadata: {
        model_id: 'cohere/rerank-4-pro',
        top_n: 5,
        score_threshold: 0.0,
      },
      normalizeScores: true,
      keepOriginalScore: true,
      maxDocuments: 100,
      fallbackOnError: true,
    },
  },
  {
    key: 'process-cleaning',
    category: 'Ingestion',
    label: 'Document Cleaning',
    description: 'Normalize text and remove noise',
    icon: Sparkles,
    colorClass: 'bg-sky-50 border-sky-200 text-sky-700',
    config: { removeHeaders: true, normalizeWhitespace: true, fixEncoding: true },
  },
  {
    key: 'process-query-rewriter',
    category: 'Retrieval',
    label: 'Query Rewriter',
    description: 'Rewrite user query for retrieval',
    icon: Search,
    colorClass: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    config: { strategy: 'intent-aware', expansionTerms: 3 },
  },
  {
    key: 'process-retriever',
    category: 'Retrieval',
    label: 'Retriever',
    description: 'Top-k vector search (similarity / MMR / hybrid)',
    icon: Search,
    colorClass: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    config: {
      strategy: 'similarity',
      topK: 8,
      similarityThreshold: 0.72,
      mmrLambda: 0.5,
      mmrFetchK: 24,
      hybridAlpha: 0.5,
      includeMetadata: true,
      includeScores: true,
      metadataFilter: '',
      // Snapshot of the upstream Vector DB / Embedding profile, populated by
      // the panel so the canvas runtime can preview without traversing edges.
      embeddingProfile: null,
      vectorStore: null,
    },
  },
  {
    key: 'process-hybrid-merge',
    category: 'Retrieval',
    label: 'Hybrid Merge',
    description: 'Blend BM25 and vector results',
    icon: GitBranch,
    colorClass: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    config: { bm25Weight: 0.4, vectorWeight: 0.6 },
  },
  {
    key: 'process-context-compression',
    category: 'Retrieval',
    label: 'Context Compression',
    description: 'Compact long context before LLM',
    icon: ScissorsLineDashed,
    colorClass: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    config: { maxTokens: 2200, keepCitations: true },
  },
  {
    key: 'process-pii-redaction',
    category: 'Safety',
    label: 'PII Redaction',
    description: 'Mask personal/sensitive fields',
    icon: Shield,
    colorClass: 'bg-rose-50 border-rose-200 text-rose-700',
    config: {
      redactEmails: true,
      redactPhones: true,
      redactIds: true,
      redactNames: false,
      redactAddresses: false,
      redactCreditCards: true,
      redactIbans: true,
      mask: '[REDACTED]',
      whitelistPattern: '',
    },
  },
  {
    key: 'process-hallucination-guard',
    category: 'Safety',
    label: 'Hallucination Guard',
    description: 'Validate answer against evidence',
    icon: Brain,
    colorClass: 'bg-rose-50 border-rose-200 text-rose-700',
    config: { minGroundingScore: 0.75, fallbackToCitationMode: true },
  },
  {
    key: 'process-reflection-loop',
    category: 'Safety',
    label: 'Reflection Loop',
    description: 'Generate -> critique -> revise cycle',
    icon: Repeat,
    colorClass: 'bg-rose-50 border-rose-200 text-rose-700',
    config: { maxReflections: 2, critiquePrompt: 'Check factual grounding and missing evidence.' },
  },
  {
    key: 'storage-vector',
    category: 'Storage',
    label: 'Vector Database',
    description: 'Pinecone / Chroma / Qdrant / Weaviate / Milvus / pgvector / FAISS',
    icon: Database,
    colorClass: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    config: {
      provider: 'pinecone',
      indexName: 'xrag-default',
      namespace: '',
      collection: 'default',
      metric: 'cosine',
      dimensions: null,            // auto-synced from upstream Embedding
      cloud: 'aws',                // pinecone serverless
      region: 'us-east-1',         // pinecone serverless
      environment: '',             // legacy pinecone pods
      persistDirectory: './chroma_db',
      url: '',                     // qdrant / weaviate / milvus self-hosted
      shards: 1,
      replicas: 1,
      hybridSearch: false,
      metadataFields: 'source,title,page',
      upsertBatchSize: 100,
      apiKeyEnvVar: 'PINECONE_API_KEY', // backend reads the actual secret
      embeddingProfile: null,
    },
  },
  {
    key: 'storage-graph',
    category: 'Storage',
    label: 'Graph Database',
    description: 'Neo4j / Memgraph / Nebula / Arango / Neptune / Kùzu / NetworkX',
    icon: Network,
    colorClass: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    config: {
      provider: 'neo4j',
      mode: 'property-graph',
      // Connection
      url: 'bolt://localhost:7687',
      database: 'neo4j',
      space: '',
      persistDirectory: './graph_db',
      encrypted: true,
      region: '',
      iamRole: '',
      // Credentials (env-var NAMES only)
      usernameEnvVar: 'NEO4J_USERNAME',
      passwordEnvVar: 'NEO4J_PASSWORD',
      // Knowledge-graph extraction
      extractorStrategy: 'llm-extraction',
      entityTypes: 'Person,Organization,Location,Concept,Event',
      minConfidence: 0.6,
      avgTriplesPerChunk: 6,
      upsertBatchSize: 100,
      // Snapshot of upstream chunks producer (populated by panel)
      upstreamProfile: null,
    },
  },
  {
    key: 'storage-keyvalue',
    category: 'Storage',
    label: 'KV / Session Store',
    description: 'Redis cache and short-term memory',
    icon: Database,
    colorClass: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    config: { provider: 'redis', ttlSeconds: 3600 },
  },
  {
    key: 'input-system-prompt',
    category: 'Brain',
    label: 'System Prompt',
    description: 'Persona / style / constraints for the LLM',
    icon: ScrollText,
    colorClass: 'bg-amber-50 border-amber-200 text-amber-700',
    config: {
      preset: 'rag-grounded',
      persona: 'You are a grounded enterprise RAG assistant.',
      style: 'Concise, factual, with inline citations like [1].',
      constraints: 'Refuse to answer if no evidence chunks support the claim.',
      template: '',
    },
  },
  {
    key: 'brain-llm',
    category: 'Brain',
    label: 'LLM (Generation)',
    description: 'OpenRouter chat completion grounded on retrieved chunks',
    icon: Brain,
    colorClass: 'bg-amber-50 border-amber-200 text-amber-700',
    config: {
      gateway: 'backend_proxy',
      metadata: {
        model_id: 'openai/gpt-4o',
        temperature: 0.2,
        max_tokens: 1024,
        top_p: 1.0,
        response_format: 'text',
      },
      systemPrompt: '',
      citationMode: true,
    },
  },
  {
    key: 'brain-hyde-gen',
    category: 'Brain',
    label: 'LLM: HyDE Gen',
    description: 'Hypothetical Document Embedding generator',
    icon: Sparkles,
    colorClass: 'bg-amber-50 border-amber-200 text-amber-700',
    config: {
      model: 'gpt-4o-mini',
      hypothesesPerQuery: 3,
      maxTokens: 256,
      temperature: 0.7,
      systemPrompt: 'Write a concise hypothetical answer to the user question that would plausibly appear in a relevant document.',
    },
  },
  {
    key: 'brain-stt',
    category: 'Brain',
    label: 'Speech-to-Text (STT)',
    description: 'Whisper / realtime transcript',
    icon: Mic,
    colorClass: 'bg-amber-50 border-amber-200 text-amber-700',
    config: { model: 'whisper-large-v3', language: 'auto' },
  },
  {
    key: 'brain-tts',
    category: 'Brain',
    label: 'Text-to-Speech (TTS)',
    description: 'Natural voice output',
    icon: Volume2,
    colorClass: 'bg-amber-50 border-amber-200 text-amber-700',
    config: { provider: 'openai-tts', voice: 'alloy' },
  },
  {
    key: 'brain-router',
    category: 'Brain',
    label: 'Model Router',
    description: 'Route by intent/cost/latency',
    icon: GitBranch,
    colorClass: 'bg-amber-50 border-amber-200 text-amber-700',
    config: { strategy: 'intent-first', fallbackModel: 'gpt-4o-mini' },
  },
  {
    key: 'brain-guardrails',
    category: 'Safety',
    label: 'Guardrails',
    description: 'Safety and policy checks',
    icon: Shield,
    colorClass: 'bg-rose-50 border-rose-200 text-rose-700',
    config: { piiRedaction: true, jailbreakCheck: true },
  },
  {
    key: 'output-response',
    category: 'Interaction',
    label: 'Response',
    description: 'Final grounded answer to user',
    icon: Bot,
    colorClass: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700',
    config: {
      // Presentation
      format: 'inherit',
      includeCitations: true,
      citationStyle: 'inline',
      showReasoning: false,
      streamTokens: true,
      // Length & shape
      maxChars: 4000,
      truncation: 'show_more',
      // Post-processing safety
      redactPii: true,
      profanityFilter: false,
      enforceLanguage: 'auto',
      // Delivery channels
      channels: { chat: true, voice: false, export: false, webhook: false },
      exportFormat: 'md',
      webhookUrl: '',
      // Telemetry
      logLatency: true,
      logTokens: true,
      collectFeedback: true,
    },
  },
  {
    key: 'output-chat',
    category: 'Interaction',
    label: 'Chat Tester',
    description: 'Interactive output preview',
    icon: MessageSquare,
    colorClass: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700',
    config: { mode: 'preview' },
  },
  {
    key: 'input-image',
    category: 'Sources',
    label: 'Image Upload',
    description: 'Upload images for multimodal RAG — ingestion library or visual query',
    icon: ImageIcon,
    colorClass: 'bg-violet-50 border-violet-200 text-violet-700',
    config: {
      mode: 'upload',           // 'upload' | 'url' | 'screenshot'
      role: 'library',          // 'library' (ingestion) | 'query' (query-time visual input)
      acceptedFormats: 'jpg,jpeg,png,webp,gif,tiff,pdf',
      maxSizeMB: 20,
      maxImages: 50,
      extractExif: true,
      generateThumbnail: true,
      autoCaption: false,       // delegate captioning to downstream brain-vision node
    },
  },
  {
    key: 'brain-vision',
    category: 'Brain',
    label: 'Vision LLM',
    description: 'Multimodal vision model — image captioning, analysis, and visual question answering',
    icon: Eye,
    colorClass: 'bg-amber-50 border-amber-200 text-amber-700',
    config: {
      gateway: 'backend_proxy',
      metadata: {
        model_id: 'openai/gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 512,
        detail: 'auto',         // 'low' | 'high' | 'auto'
      },
      mode: 'caption',          // 'caption' | 'analyze' | 'vqa' | 'ocr'
      captionStyle: 'detailed', // 'brief' | 'detailed' | 'structured'
      systemPrompt: 'Describe this image in detail, including all visible text, objects, charts, diagrams, and spatial relationships. This description will be used for semantic search retrieval.',
      includeOCR: true,
      outputFormat: 'text',
    },
  },
  {
    key: 'sub-graph',
    category: 'Ingestion',
    label: 'Sub-graph',
    description: 'Collapsed node cluster for cleaner canvas view',
    icon: Network,
    colorClass: 'bg-sky-50 border-sky-200 text-sky-700',
    hiddenInPalette: true,
    config: { nodeCount: 0, members: [], collapsedNodes: [], collapsedEdges: [] },
  },
];

export const USER_TEMPLATE_KEY = 'user-actor';
export const QUESTION_TEMPLATE_KEY = 'input-question';
export const SUBGRAPH_TEMPLATE_KEY = 'sub-graph';
export const BASIC_BLUEPRINT_ID = 'basic-rag';

// Each blueprint references a fully pre-configured flow stored on the
// backend (`backend/data/canvas_flows.json`). When the user picks one,
// the canvas replaces its current graph with the saved flow so every
// node arrives with its real production-ready configuration (models,
// providers, chunk sizes, retrieval params, prompts, ...). The
// `templateKeys` list is kept as a fallback so the old "insert empty
// blueprint" behaviour still works if the backend flow is missing.
export const RAG_BLUEPRINTS = [
  {
    id: 'basic-rag',
    label: 'Naive RAG',
    description: 'Documents → chunking → embedding → vector DB → similarity retrieval → LLM answer.',
    backendFlowId: 'flow-naive-rag-001',
    templateKeys: [
      'user-actor',
      'input-question',
      'input-upload',
      'process-cleaning',
      'process-chunking',
      'process-embedding',
      'storage-vector',
      'brain-llm',
      'output-response',
      'output-chat',
    ],
  },
  {
    id: 'reranker-rag',
    label: 'Reranker RAG',
    description: 'MMR retrieval (top 20) → LLM-as-reranker (top 5) → GPT-4o-mini answer.',
    backendFlowId: 'flow-c504631287',
    templateKeys: [
      'user-actor', 'input-question', 'input-upload', 'process-cleaning',
      'process-chunking', 'process-embedding', 'storage-vector',
      'process-retriever', 'process-reranker', 'brain-llm', 'output-response', 'output-chat',
    ],
  },
  {
    id: 'hyde-rag',
    label: 'HyDE RAG',
    description: 'LLM drafts a hypothetical answer, embeds it for retrieval, then reranks against the original question.',
    backendFlowId: 'flow-hyde-rag-001',
    templateKeys: [
      'user-actor', 'input-question', 'input-upload', 'process-chunking',
      'process-embedding', 'storage-vector', 'brain-hyde-gen',
      'process-retriever', 'process-reranker', 'brain-llm', 'output-response', 'output-chat',
    ],
  },
  {
    id: 'self-rag',
    label: 'Self-RAG',
    description: 'LLM decides when to retrieve, scores chunk relevance and self-checks groundedness with a reflection loop.',
    backendFlowId: 'flow-self-rag-001',
    templateKeys: [
      'user-actor', 'input-question', 'input-upload', 'process-cleaning',
      'process-chunking', 'process-embedding', 'storage-vector',
      'process-reranker', 'brain-llm', 'process-reflection-loop',
      'process-hallucination-guard', 'output-response', 'output-chat',
    ],
  },
  {
    id: 'agentic-rag',
    label: 'Agentic RAG',
    description: 'Plan → Act → Observe → Reason: query decomposition, dual retrieval + hybrid merge, reflection and hallucination guard.',
    backendFlowId: 'flow-agentic-rag-001',
    templateKeys: [
      'user-actor', 'input-question', 'input-upload', 'process-chunking',
      'process-embedding', 'storage-vector', 'process-query-rewriter',
      'process-retriever', 'process-hybrid-merge', 'process-context-compression',
      'brain-router', 'brain-llm', 'process-reflection-loop',
      'process-hallucination-guard', 'output-response', 'output-chat',
    ],
  },
  {
    id: 'pdr-rag',
    label: 'Parent-Document RAG',
    description: 'Two-tier chunking: small child chunks for precise vector search, full parent chunks given to the LLM as context.',
    backendFlowId: 'flow-pdr-001',
    templateKeys: [
      'user-actor', 'input-question', 'input-upload', 'process-chunking',
      'process-embedding', 'storage-vector', 'process-retriever',
      'brain-llm', 'output-response', 'output-chat',
    ],
  },
  {
    id: 'graph-rag',
    label: 'GraphRAG',
    description: 'Knowledge graph (Neo4j) + vector retrieval running in parallel, then hybrid merge unifies graph and semantic context.',
    backendFlowId: 'flow-graphrag-001',
    templateKeys: [
      'user-actor', 'input-question', 'input-upload', 'process-cleaning',
      'process-chunking', 'process-embedding', 'storage-vector',
      'storage-graph', 'process-hybrid-merge', 'brain-router',
      'brain-llm', 'output-response', 'output-chat',
    ],
  },
  {
    id: 'router-rag',
    label: 'Router RAG',
    description: 'Query Router routes the question to one of three specialised retrieval paths, then RRF-merge → reranker → LLM.',
    backendFlowId: 'flow-router-rag-001',
    templateKeys: [
      'user-actor', 'input-question', 'input-upload', 'process-chunking',
      'process-embedding', 'storage-vector', 'brain-router',
      'process-retriever', 'process-hybrid-merge', 'process-reranker',
      'brain-llm', 'output-response', 'output-chat',
    ],
  },
  {
    id: 'long-context-rag',
    label: 'Long-Context RAG',
    description: 'Large 2.5k-token chunks, ingestion-time LLM summaries cached in Redis, pyramid re-ordering, 200k-context generator.',
    backendFlowId: 'flow-lcrag-001',
    templateKeys: [
      'user-actor', 'input-question', 'input-upload', 'process-chunking',
      'process-embedding', 'storage-vector', 'process-context-compression',
      'brain-llm', 'output-response', 'output-chat',
    ],
  },
  {
    id: 'corrective-rag',
    label: 'Corrective RAG',
    description: 'Retrieves, evaluates relevance, and corrects with web search / query rewrite when the evidence is weak.',
    backendFlowId: 'flow-crag-001',
    templateKeys: [
      'user-actor', 'input-question', 'input-upload', 'process-chunking',
      'process-embedding', 'storage-vector', 'process-retriever',
      'process-query-rewriter', 'brain-llm', 'process-hallucination-guard',
      'output-response', 'output-chat',
    ],
  },
  {
    id: 'multimodal-rag',
    label: 'Multi-Modal RAG',
    description: 'Combines text and image inputs for vision-aware retrieval and answer generation.',
    backendFlowId: 'flow-mmrag-001',
    templateKeys: [
      'user-actor', 'input-question', 'input-upload', 'process-chunking',
      'process-embedding', 'storage-vector', 'process-retriever',
      'brain-llm', 'output-response', 'output-chat',
    ],
  },
  {
    id: 'modular-rag',
    label: 'Modular RAG',
    description: 'Composable pre-/retrieval/post modules with guardrails, PII redaction and reflection — production-grade default.',
    backendFlowId: 'flow-modular-rag-001',
    templateKeys: [
      'user-actor', 'input-question', 'input-upload', 'process-cleaning',
      'process-chunking', 'process-embedding', 'storage-vector',
      'process-retriever', 'process-reranker', 'process-pii-redaction',
      'brain-guardrails', 'brain-llm', 'process-hallucination-guard',
      'output-response', 'output-chat',
    ],
  },
];

export const templateByKey = NODE_LIBRARY.reduce((accumulator, item) => {
  accumulator[item.key] = item;
  return accumulator;
}, {});

export const visibleNodeLibrary = NODE_LIBRARY.filter((item) => !item.hiddenInPalette);

const CATEGORY_ORDER = ['Interaction', 'Sources', 'Ingestion', 'Retrieval', 'Storage', 'Brain', 'Safety'];

export const groupedNodeLibrary = CATEGORY_ORDER.map((category) => ({
  category,
  items: visibleNodeLibrary.filter((item) => item.category === category),
})).filter((group) => group.items.length > 0);

export const buildNodeData = (templateKey) => {
  const template = templateByKey[templateKey];
  return {
    templateKey,
    label: template.label,
    description: template.description,
    category: template.category,
    colorClass: template.colorClass,
    config: { ...template.config },
  };
};

// ─── Custom user-defined nodes ────────────────────────────────────────────
// Curated map of icon-name strings → lucide components. The backend stores
// just the icon name (whitelisted) and the frontend resolves it here so the
// JSON payload stays serializable.
import {
  Wand2, Code2, Zap, Layers,
} from 'lucide-react';

export const CUSTOM_NODE_ICON_MAP = {
  Wand2, Sparkles, Bot, Brain, Code2, Zap, Layers,
  GitBranch, Filter, Search, Database, Network, Globe,
  Shield, Repeat, ScissorsLineDashed, ScrollText, FileInput,
  FileUp: FileInput, MessageSquare, Mic, Volume2, Eye, User,
  Image: ImageIcon,
};

export const COLOR_TO_CLASS = (color) => {
  const safe = ['amber', 'sky', 'cyan', 'emerald', 'violet', 'fuchsia', 'rose', 'indigo', 'slate'].includes(color) ? color : 'indigo';
  return `bg-${safe}-50 border-${safe}-200 text-${safe}-700`;
};

/**
 * Register a custom node so the canvas runtime (drop handler, ragNode
 * renderer, etc.) sees it the same way as a built-in template. Mutates
 * `templateByKey` in place — safe to call multiple times (idempotent).
 */
export const registerCustomTemplate = (customNode) => {
  if (!customNode || !customNode.id) return null;
  const Icon = CUSTOM_NODE_ICON_MAP[customNode.icon] || Wand2;
  const colorClass = COLOR_TO_CLASS(customNode.color);
  const template = {
    key: customNode.id,
    category: customNode.category || 'Custom',
    label: customNode.name || 'Custom Node',
    description: customNode.description || '',
    icon: Icon,
    colorClass,
    isCustom: true,
    customNode,
    config: { ...(customNode.default_config || {}) },
  };
  templateByKey[customNode.id] = template;
  return template;
};

export const unregisterCustomTemplate = (customNodeId) => {
  if (customNodeId && templateByKey[customNodeId]) {
    delete templateByKey[customNodeId];
  }
};

const PREVIEW_BACKDROP_THEME_SCALE = [
  {
    border: 'rgba(16, 185, 129, 0.65)',
    background: 'rgba(16, 185, 129, 0.24)',
    shadow: 'rgba(16, 185, 129, 0.26)',
  },
  {
    border: 'rgba(14, 165, 233, 0.65)',
    background: 'rgba(14, 165, 233, 0.23)',
    shadow: 'rgba(14, 165, 233, 0.25)',
  },
  {
    border: 'rgba(99, 102, 241, 0.65)',
    background: 'rgba(99, 102, 241, 0.22)',
    shadow: 'rgba(99, 102, 241, 0.25)',
  },
  {
    border: 'rgba(245, 158, 11, 0.65)',
    background: 'rgba(245, 158, 11, 0.24)',
    shadow: 'rgba(245, 158, 11, 0.26)',
  },
];

export const getPreviewBackdropTheme = (nestingLevel) => {
  const index = Math.max(0, (Number(nestingLevel || 1) - 1) % PREVIEW_BACKDROP_THEME_SCALE.length);
  return PREVIEW_BACKDROP_THEME_SCALE[index];
};
