import { useEffect, useState } from 'react';
import { ChevronDown, CircleHelp, Lock, Settings2, Sparkles } from 'lucide-react';

const Toggle = ({ value, onChange, label, help }) => (
  <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
    <div className="flex min-w-0 items-center gap-1">
      <p className="truncate text-[11px] font-bold text-slate-700">{label}</p>
      <button
        type="button"
        title={help}
        className="shrink-0 text-slate-400 hover:text-slate-700"
      >
        <CircleHelp size={12} />
      </button>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative inline-block h-5 w-9 shrink-0 overflow-hidden rounded-full transition-colors ${
        value ? 'bg-sky-600' : 'bg-slate-300'
      }`}
    >
      <span
        className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-[left] duration-200"
        style={{ left: value ? '18px' : '2px' }}
      />
    </button>
  </div>
);

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">{title}</label>
    <button type="button" title={help} className="shrink-0 text-slate-400 hover:text-slate-700">
      <CircleHelp size={11} />
    </button>
  </div>
);

const SectionHeading = ({ children, color }) => (
  <h4 className={`text-[10px] font-black uppercase tracking-wider ${color}`}>{children}</h4>
);

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-sky-400';

const STRATEGY_OPTIONS = [
  {
    value: 'recursive',
    label: 'Recursive (LangChain)',
    description:
      'Splits along ranked separators (paragraph → line → sentence → word → character). The most universal option — this is what LangChain RecursiveCharacterTextSplitter uses.',
  },
  {
    value: 'fixed',
    label: 'Fixed window',
    description:
      'Cuts at a fixed character window regardless of separators. Fast and predictable, but can break words / sentences at the chunk boundary.',
  },
  {
    value: 'sentence',
    label: 'Sentence boundary',
    description:
      'Splits at sentence boundaries (.!?), then merges sentences up to chunk_size. Best when text is well punctuated and context is sentence-shaped.',
  },
  {
    value: 'paragraph',
    label: 'Paragraph',
    description:
      'Splits along blank-line separated paragraphs, then merges short paragraphs to reach chunk_size. Ideal for essays, notes and blog posts.',
  },
  {
    value: 'markdown',
    label: 'Markdown headings',
    description:
      'First splits along Markdown headings (#, ##, ###), then falls back to general separators. Recommended for structured docs.',
  },
  {
    value: 'html',
    label: 'HTML structure',
    description:
      'Splits along HTML tags (<h1>…<h3>, <p>, <li>) while preserving the section hierarchy. Use for scraped websites / docs portals.',
  },
  {
    value: 'code',
    label: 'Code (AST-aware)',
    description:
      'Splits code along language-specific separators (class/def/function/} / block boundaries) so embeddings see logical units.',
  },
  {
    value: 'semantic',
    label: 'Semantic (embedding-based)',
    description:
      'Splits at "topic shifts" based on cosine distance between sentence embeddings. More expensive (extra embed calls) but yields the most meaningful chunk boundaries.',
  },
  {
    value: 'token',
    label: 'Token-exact (tiktoken)',
    description:
      'Measures chunk length with a concrete tokenizer (e.g. tiktoken cl100k_base) and cuts at exact token counts. Choose this when the embedder/LLM has a hard token limit.',
  },
];

const LENGTH_OPTIONS = [
  {
    value: 'characters',
    label: 'Characters',
    description:
      'chunk_size is interpreted in characters. Simple and deterministic — sufficient for most embedding models.',
  },
  {
    value: 'words',
    label: 'Words (whitespace)',
    description:
      'Measures size in whitespace-separated words. More natural for prose, but not perfectly aligned with the tokenizer.',
  },
  {
    value: 'tokens',
    label: 'Token estimate (~4ch/tok)',
    description:
      'Treats the value as a token budget (~4 characters / token). A cheap estimate, roughly mappable to embedder token limits.',
  },
  {
    value: 'tiktoken',
    label: 'Token-exact (tiktoken)',
    description:
      'Counts tokens with an OpenAI-compatible tokenizer (tiktoken). Accurate, but tokenizer runs on every cut — slightly slower.',
  },
  {
    value: 'huggingface',
    label: 'HuggingFace tokenizer',
    description:
      'Counts with a specific HF tokenizer (e.g. bge-base, e5). Choose this when the embedder is also an HF model — chunks will stay inside the context window.',
  },
];

const TOKEN_MODEL_OPTIONS = [
  { value: 'cl100k_base', label: 'cl100k_base (GPT-4o / 4 / 3.5)' },
  { value: 'o200k_base', label: 'o200k_base (o-series)' },
  { value: 'p50k_base', label: 'p50k_base (Codex / text-davinci)' },
  { value: 'r50k_base', label: 'r50k_base (GPT-3)' },
];

const HF_MODEL_OPTIONS = [
  { value: 'BAAI/bge-base-en-v1.5', label: 'BAAI/bge-base-en-v1.5' },
  { value: 'BAAI/bge-large-en-v1.5', label: 'BAAI/bge-large-en-v1.5' },
  { value: 'intfloat/e5-large-v2', label: 'intfloat/e5-large-v2' },
  { value: 'sentence-transformers/all-MiniLM-L6-v2', label: 'all-MiniLM-L6-v2' },
  { value: 'jinaai/jina-embeddings-v2-base-en', label: 'jina-embeddings-v2-base-en' },
];

const CODE_LANGUAGE_OPTIONS = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript / TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'cpp', label: 'C / C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'markdown', label: 'Markdown' },
];

const SEMANTIC_BREAKPOINT_OPTIONS = [
  { value: 'percentile', label: 'Percentile (95)' },
  { value: 'standard_deviation', label: 'Standard deviation (3σ)' },
  { value: 'interquartile', label: 'Interquartile (1.5·IQR)' },
  { value: 'gradient', label: 'Gradient (derivative peaks)' },
];

const ChunkingSettingsPanel = ({ value = {}, onChange, embeddingProfile = null }) => {
  const update = (field, nextValue) => onChange(field, nextValue);

  const isAwake = Boolean(embeddingProfile);

  // ── Sleep state ────────────────────────────────────────────────────────
  // When no embedding model is wired into this Chunking node, render a
  // dimmed, disabled placeholder so the user can't pick parameters that
  // would later turn out to be incompatible with their chosen model.
  if (!isAwake) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed border-slate-300 bg-slate-100/60 p-3 text-slate-500">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 rounded-lg border border-slate-300 bg-white p-1.5 text-slate-400">
            <Lock size={14} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wider text-slate-600">Chunking node · sleeping</p>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              Please connect an <span className="font-bold text-slate-700">Embedding model</span> to unlock the configuration. This way chunk_size, the unit of measure and token limits all align with the requirements of the chosen model.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white/70 p-2.5 text-[11px] leading-snug text-slate-400">
          <p className="font-black uppercase tracking-wider text-slate-400">What will be auto-configured?</p>
          <ul className="mt-1.5 space-y-0.5 list-disc pl-4">
            <li>chunk_size and overlap tailored to the model's context window</li>
            <li>character / token counting matched to the model's tokenizer</li>
            <li>Vector DB dimension and distance metric handshake</li>
          </ul>
        </div>
      </div>
    );
  }

  const strategy = String(value.strategy || 'recursive').toLowerCase();
  const chunkSize = Number(value.chunkSize ?? embeddingProfile.defaults.chunkSize ?? 750);
  const overlap = Number(value.overlap ?? embeddingProfile.defaults.overlap ?? 250);
  const separators = value.separators ?? '\\n\\n,\\n,. , ,';
  const keepSeparator = Boolean(value.keepSeparator ?? true);
  const lengthFunction = String(value.lengthFunction || embeddingProfile.lengthFunction || 'characters').toLowerCase();
  const minChunkChars = Number(value.minChunkChars ?? 0);
  const stripWhitespace = Boolean(value.stripWhitespace ?? true);

  // Embedding-driven extras
  const maxChunkSize = Number(embeddingProfile.maxChunkSize || 8000);
  const exceedsLimit = chunkSize > maxChunkSize;
  const embeddingDimension = Number(
    value.embeddingDimension ?? embeddingProfile.nativeDimension ?? 1536
  );
  const queryInstruction = String(value.queryInstruction ?? embeddingProfile.queryPrefix ?? '');
  const documentInstruction = String(value.documentInstruction ?? embeddingProfile.documentPrefix ?? '');
  const batchSize = Number(value.batchSize ?? embeddingProfile.batchSize ?? 32);

  // Tokenizer / model bindings — auto-synced from the upstream embedding profile.
  // Write-through: keep the chunking config in sync with the upstream model so
  // downstream payloads always carry the correct tokenizer ids.
  useEffect(() => {
    if (!embeddingProfile?.modelId) return;
    if (embeddingProfile.lengthFunction === 'tiktoken' && value.tokenModel !== embeddingProfile.tokenizer) {
      onChange('tokenModel', embeddingProfile.tokenizer);
    }
    if (embeddingProfile.lengthFunction === 'huggingface' && value.hfTokenizerModel !== embeddingProfile.modelId) {
      onChange('hfTokenizerModel', embeddingProfile.modelId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embeddingProfile?.modelId, embeddingProfile?.lengthFunction]);

  // Code splitter
  const codeLanguage = String(value.codeLanguage || 'python');

  // Markdown / HTML structure-aware
  const headersToSplitOn = String(value.headersToSplitOn || 'h1,h2,h3');
  const includeHeadersInMetadata = Boolean(value.includeHeadersInMetadata ?? true);

  // Semantic splitter
  const semanticBreakpointType = String(value.semanticBreakpointType || 'percentile');
  const semanticThreshold = Number(value.semanticThreshold ?? 95);

  // Quality knobs (apply to most strategies)
  const dedupNearDuplicates = Boolean(value.dedupNearDuplicates ?? false);
  const dedupSimilarity = Number(value.dedupSimilarity ?? 0.92);
  const smartMergeShortChunks = Boolean(value.smartMergeShortChunks ?? true);
  const addContextHeader = Boolean(value.addContextHeader ?? false);
  const respectSentenceBoundary = Boolean(value.respectSentenceBoundary ?? true);

  const overlapPercent = chunkSize > 0 ? Math.round((overlap / chunkSize) * 100) : 0;
  const separatorsDisabled = !(strategy === 'recursive' || strategy === 'markdown');

  const strategyOption = STRATEGY_OPTIONS.find((option) => option.value === strategy);
  const lengthOption = LENGTH_OPTIONS.find((option) => option.value === lengthFunction);

  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="space-y-3 rounded-2xl border border-sky-300 bg-gradient-to-br from-sky-50/80 via-white to-white p-2.5 shadow-[0_0_0_1px_rgba(56,189,248,0.25)]">
      <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/80 p-2">
        <div className="mt-0.5 rounded-lg border border-sky-300 bg-white p-1.5 text-sky-600">
          <Sparkles size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-sky-700">
            Awake · {embeddingProfile.badge}
          </p>
          <p className="text-[11px] font-bold text-slate-700 truncate">{embeddingProfile.label}</p>
          <p className="text-[10px] text-slate-500 leading-snug">
            Unit: <span className="font-bold text-slate-700">{embeddingProfile.unitLabel}</span> · max {embeddingProfile.maxChunkSize.toLocaleString()} {embeddingProfile.unit} · {embeddingProfile.nativeDimension}-dim
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <SectionHeading color="text-sky-700">Splitter</SectionHeading>

        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
            strategy
          </label>
          <select
            value={strategy}
            onChange={(event) => update('strategy', event.target.value)}
            className={inputClass}
          >
            {STRATEGY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {strategyOption && (
            <p className="mt-1.5 rounded-lg border border-sky-100 bg-sky-50/70 px-2 py-1.5 text-[11px] leading-snug text-sky-800">
              {strategyOption.description}
            </p>
          )}
        </div>

        {(lengthFunction === 'tiktoken' || lengthFunction === 'huggingface' || strategy === 'token') && (
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
              tokenizer
            </label>
            {embeddingProfile?.modelId ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50/70 px-2.5 py-2">
                <Lock size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold leading-tight text-emerald-800">
                    Tokenizer: Auto-synced
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-emerald-900/80">
                    {embeddingProfile.modelId}
                  </p>
                  <p className="mt-1 text-[10px] leading-snug text-emerald-700/80">
                    The backend uses a tokenizer matching the connected
                    embedding model, so there are no token-limit collisions.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-100/70 px-2.5 py-2 text-[11px] text-slate-400">
                <Lock size={13} className="shrink-0" />
                <span className="italic">Waiting for the Embedding model…</span>
              </div>
            )}
          </div>
        )}

        {strategy === 'code' && (
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
              code_language
            </label>
            <select
              value={codeLanguage}
              onChange={(event) => update('codeLanguage', event.target.value)}
              className={inputClass}
            >
              {CODE_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-slate-500">
              Selects the language-specific separator set (class/def/function/} etc.).
            </p>
          </div>
        )}

        {(strategy === 'markdown' || strategy === 'html') && (
          <>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
                headers_to_split_on
              </label>
              <input
                type="text"
                value={headersToSplitOn}
                placeholder={strategy === 'html' ? 'h1,h2,h3' : '#,##,###'}
                onChange={(event) => update('headersToSplitOn', event.target.value)}
                className={inputClass}
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Comma-separated list — at which heading levels to start a new chunk.
              </p>
            </div>
            <Toggle
              value={includeHeadersInMetadata}
              onChange={(next) => update('includeHeadersInMetadata', next)}
              label="include_headers_in_metadata"
              help="Copies the parent heading chain into the chunk metadata (and optionally to the start of the text) — improves retrieval accuracy."
            />
          </>
        )}

        {strategy === 'semantic' && (
          <div className="space-y-2 rounded-lg border border-sky-100 bg-sky-50/40 p-2">
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
                breakpoint_type
              </label>
              <select
                value={semanticBreakpointType}
                onChange={(event) => update('semanticBreakpointType', event.target.value)}
                className={inputClass}
              >
                {SEMANTIC_BREAKPOINT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
                threshold
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={semanticThreshold}
                onChange={(event) => update('semanticThreshold', Number(event.target.value || 0))}
                className={inputClass}
              />
              <p className="mt-1 text-[10px] text-slate-500">
                For percentile: 0–100, for std: σ count, for IQR: multiplier. Higher → fewer, longer chunks.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <SectionHeading color="text-sky-700">Window ({embeddingProfile.unitLabel})</SectionHeading>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel
              title="chunk_size"
              help={`Max size of a chunk in the chosen model's unit (${embeddingProfile.unitLabel}). Model limit: ${embeddingProfile.maxChunkSize}.`}
            />
            <input
              type="number"
              min={50}
              max={maxChunkSize}
              step={50}
              value={chunkSize}
              onChange={(event) => update('chunkSize', Number(event.target.value || 0))}
              className={`${inputClass} ${exceedsLimit ? 'border-rose-400 bg-rose-50 text-rose-700' : ''}`}
            />
          </div>
          <div>
            <FieldLabel
              title="chunk_overlap"
              help="Shared content between two adjacent chunks. Preserves context at the boundary."
            />
            <input
              type="number"
              min={0}
              max={Math.max(0, chunkSize - 1)}
              step={10}
              value={overlap}
              onChange={(event) => update('overlap', Number(event.target.value || 0))}
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
          <span>≈ {overlapPercent}% overlap</span>
          <span>
            {overlap}/{chunkSize} {embeddingProfile.unit}
          </span>
        </div>
        {exceedsLimit && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-bold text-rose-700">
            ⚠ {embeddingProfile.label} accepts at most {embeddingProfile.maxChunkSize} {embeddingProfile.unit} — lower the chunk_size!
          </p>
        )}
      </section>

      <button
        type="button"
        onClick={() => setShowAdvanced((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-600 hover:border-sky-300 hover:text-sky-700"
      >
        <span className="flex items-center gap-1.5">
          <Settings2 size={13} />
          Advanced settings
        </span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
        />
      </button>

      {showAdvanced && (
        <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-white/60 p-2.5">
          <section className="space-y-2">
            <SectionHeading color="text-sky-700">Length function</SectionHeading>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
                length_function
              </label>
              <select
                value={lengthFunction}
                onChange={(event) => update('lengthFunction', event.target.value)}
                className={inputClass}
              >
                {LENGTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {lengthOption && (
                <p className="mt-1.5 rounded-lg border border-sky-100 bg-sky-50/70 px-2 py-1.5 text-[11px] leading-snug text-sky-800">
                  {lengthOption.description}
                </p>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <SectionHeading color="text-emerald-700">Separators</SectionHeading>
            <div>
              <FieldLabel
                title="separators"
                help="Comma-separated, in priority order. \\n and \\t escapes are supported. Empty entry (two commas) = character fallback."
              />
              <textarea
                rows={2}
                value={separators}
                disabled={separatorsDisabled}
                placeholder="\n\n,\n,. , ,"
                onChange={(event) => update('separators', event.target.value)}
                className={`${inputClass} resize-none font-mono text-[11px] disabled:bg-slate-100 disabled:text-slate-400`}
              />
              {separatorsDisabled && (
                <p className="mt-1 text-[10px] text-slate-400">
                  Only with <span className="font-bold">recursive / markdown</span> strategies.
                </p>
              )}
            </div>
            <Toggle
              value={keepSeparator}
              onChange={(next) => update('keepSeparator', next)}
              label="keep_separator"
              help="When enabled, the separator stays at the end of the chunk — e.g. the closing period of a sentence is preserved."
            />
            <div>
              <FieldLabel
                title="min_chunk_chars"
                help="Chunks shorter than this are dropped. 0 → no minimum."
              />
              <input
                type="number"
                min={0}
                max={2000}
                step={10}
                value={minChunkChars}
                onChange={(event) => update('minChunkChars', Number(event.target.value || 0))}
                className={inputClass}
              />
            </div>
          </section>

          <section className="space-y-2">
            <SectionHeading color="text-rose-700">Quality</SectionHeading>
            <Toggle
              value={smartMergeShortChunks}
              onChange={(next) => update('smartMergeShortChunks', next)}
              label="smart_merge_short_chunks"
              help="Merges fragments below min_chunk_chars into a neighbouring chunk instead of dropping them."
            />
            <Toggle
              value={respectSentenceBoundary}
              onChange={(next) => update('respectSentenceBoundary', next)}
              label="respect_sentence_boundary"
              help="Pushes the chunk boundary to the nearest sentence terminator (.!?) so it never cuts mid-sentence."
            />
            <Toggle
              value={addContextHeader}
              onChange={(next) => update('addContextHeader', next)}
              label="add_context_header"
              help="Prepends the source document title + heading chain to each chunk — meaningfully boosts retrieval relevance."
            />
            <Toggle
              value={dedupNearDuplicates}
              onChange={(next) => update('dedupNearDuplicates', next)}
              label="dedup_near_duplicates"
              help="Keeps only one of any near-identical chunks (e.g. repeated boilerplate)."
            />
            {dedupNearDuplicates && (
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
                  dedup_similarity
                </label>
                <input
                  type="number"
                  min={0.5}
                  max={1}
                  step={0.01}
                  value={dedupSimilarity}
                  onChange={(event) => update('dedupSimilarity', Number(event.target.value || 0))}
                  className={inputClass}
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Cosine similarity threshold (0.85–0.98 is typical).
                </p>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <SectionHeading color="text-slate-700">Cleanup</SectionHeading>
            <Toggle
              value={stripWhitespace}
              onChange={(next) => update('stripWhitespace', next)}
              label="strip_whitespace"
              help="Trims whitespace from the start/end of each chunk before saving."
            />
          </section>
        </div>
      )}
    </div>
  );
};

export default ChunkingSettingsPanel;
