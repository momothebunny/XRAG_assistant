/**
 * QuestionSettingsPanel — defines the *query-input contract* of the canvas.
 *
 * What belongs here, and ONLY here:
 *   1. Input shape — mode (free text / multiple choice), language, placeholder, sample.
 *   2. Validation  — min / max length, required, blocklist regex.
 *   3. Pre-processing — trim, collapse whitespace, NFC, strip emoji, casefold, spell-check.
 *   4. Multi-turn   — append history + window size.
 *   5. Modality     — voice input / STT fallback (how the query *enters*).
 *
 * What does NOT belong here (delegated to sibling nodes):
 *   • answerStyle           → Response / System Prompt node (it shapes the OUTPUT)
 *   • tokenBudget           → LLM node (it's a generation cap, not an input field)
 *   • suggestedFollowups    → Response / Chat node (post-answer UX)
 *   • Identity / RBAC / quotas → User node
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 2)
 *   • Inputs:  optional `user_context` from `user-actor` (for locale defaults).
 *   • Outputs: typed `query_input` payload consumed by Retriever / Router / LLM.
 */

import { useMemo } from 'react';
import SliderRow from './SliderRow';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Globe,
  Hash,
  History,
  ListChecks,
  MessageSquare,
  Mic,
  Ruler,
  Sparkles,
  Wand2,
  Zap,
} from 'lucide-react';

// ─── Shared atoms (modern, soft fuchsia — mirrors UserSettingsPanel) ─────
const inputClass =
  'w-full rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-fuchsia-300 focus:ring-2 focus:ring-fuchsia-200/40';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
      {title}
    </label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-fuchsia-500">
        <CircleHelp size={11} />
      </span>
    )}
  </div>
);

/**
 * ToggleChip — pill button with aria-pressed state.
 *
 * Implemented as a real <button>, NOT a <label> wrapping a hidden <input>.
 * Hidden checkboxes inside <label> can cause the browser to scroll the page
 * when focus moves into a clipped (sr-only) element — visible to the user
 * as the inspector "jumping" or a popup-like reflow.
 */
const ToggleChip = ({ checked, onChange, label, help }) => (
  <button
    type="button"
    title={help}
    aria-pressed={Boolean(checked)}
    onClick={() => onChange?.(!checked)}
    className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
      checked
        ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 shadow-sm shadow-fuchsia-200/30'
        : 'border-slate-700/50 bg-[#0d1117] text-slate-400 hover:border-fuchsia-200 hover:text-fuchsia-700'
    }`}
  >
    <span
      aria-hidden
      className={`inline-block h-2 w-2 rounded-full transition ${
        checked ? 'bg-fuchsia-500' : 'bg-slate-300 group-hover:bg-fuchsia-300'
      }`}
    />
    {label}
  </button>
);

// ─── Domain options ──────────────────────────────────────────────────────
const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto-detect (langid)' },
  { value: 'en', label: 'English' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' },
];

const INPUT_MODES = [
  {
    value: 'free_text',
    label: 'Free text',
    description: 'Anything can be typed.',
    icon: MessageSquare,
  },
  {
    value: 'multiple_choice',
    label: 'Multiple choice',
    description: 'Predefined option list.',
    icon: ListChecks,
  },
];

const SAMPLE_QUERIES = [
  'What does the cosine similarity setting on a vector store mean?',
  'Summarize the 2025 Q4 sales report in one paragraph.',
  'What is the difference between HyDE and query rewriting?',
  'Give 3 examples of the benefits of hybrid search (BM25 + dense).',
  'How does reranking work in a RAG pipeline?',
];

const PREPROCESSING_TOGGLES = [
  { key: 'trimWhitespace',     label: 'Trim',           help: 'Trim leading / trailing spaces.' },
  { key: 'collapseWhitespace', label: 'Collapse spaces', help: 'Multiple spaces → one. Normalize line breaks.' },
  { key: 'normalizeUnicode',   label: 'NFC',            help: 'Unicode NFC normalization — unify composite characters.' },
  { key: 'stripEmoji',         label: 'Strip emoji',    help: 'Remove Unicode emoji.' },
  { key: 'caseFold',           label: 'Lowercase',      help: 'Better embedding recall, but loses proper-noun sensitivity.' },
  { key: 'spellCheck',         label: 'Spell-check',    help: 'Auto-correct simple typos before submission.' },
];

// ─── Schema ──────────────────────────────────────────────────────────────
export const DEFAULT_QUESTION_CONFIG = {
  // Input shape
  mode: 'free_text',
  language: 'auto',
  placeholder: 'Ask your question…',
  sampleQuery: '',
  multipleChoiceOptions: '', // newline-separated
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
  spellCheck: false,
  // Multi-turn
  appendHistory: true,
  historyTurns: 4,
  // Input modality
  voiceInput: false,
  enableSttFallback: false,
};

/**
 * Compose the typed `query_input` payload that downstream nodes consume.
 * Note: NO `style` block — answer styling lives in Response / SystemPrompt nodes.
 */
export function buildQuestionPayload(config = {}) {
  const c = { ...DEFAULT_QUESTION_CONFIG, ...config };
  const choices = (c.multipleChoiceOptions || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    step_type: 'query_input',
    metadata: {
      input: {
        mode: c.mode,
        language: c.language,
        placeholder: c.placeholder,
        sample_query: c.sampleQuery || null,
        choices: c.mode === 'multiple_choice' ? choices : null,
      },
      validation: {
        required: Boolean(c.required),
        min_length: Math.max(0, Number(c.minLength) || 0),
        max_length: Math.max(1, Number(c.maxLength) || 1),
        blocklist_regex: c.blocklistRegex || null,
      },
      preprocessing: {
        trim_whitespace: Boolean(c.trimWhitespace),
        collapse_whitespace: Boolean(c.collapseWhitespace),
        normalize_unicode: Boolean(c.normalizeUnicode),
        strip_emoji: Boolean(c.stripEmoji),
        case_fold: Boolean(c.caseFold),
        spell_check: Boolean(c.spellCheck),
      },
      history: {
        append: Boolean(c.appendHistory),
        turns: Math.max(0, Number(c.historyTurns) || 0),
      },
      modality: {
        voice_input: Boolean(c.voiceInput),
        stt_fallback: Boolean(c.enableSttFallback),
      },
    },
  };
}

// Validate the user's blocklist regex so we can show a red ring instead
// of letting the runtime throw at request time.
function validateRegex(pattern) {
  if (!pattern) return { ok: true };
  try {
    new RegExp(pattern);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

// ─── Component ───────────────────────────────────────────────────────────
export default function QuestionSettingsPanel({
  value = {},
  onChange,
  hasUserContextUpstream = false,
}) {
  const config = useMemo(() => ({ ...DEFAULT_QUESTION_CONFIG, ...value }), [value]);
  const payload = useMemo(() => buildQuestionPayload(config), [config]);
  const setField = (field, fieldValue) => onChange?.(field, fieldValue);

  const regexValidation = useMemo(() => validateRegex(config.blocklistRegex), [config.blocklistRegex]);
  const choiceCount = useMemo(
    () =>
      (config.multipleChoiceOptions || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean).length,
    [config.multipleChoiceOptions],
  );

  const warnings = [];
  if (config.minLength > config.maxLength) {
    warnings.push('Min length is greater than max length — no question will pass through.');
  }
  if (config.mode === 'multiple_choice' && choiceCount < 2) {
    warnings.push('Multiple choice mode requires at least 2 options.');
  }
  if (!regexValidation.ok) {
    warnings.push(`Invalid blocklist regex: ${regexValidation.message}`);
  }
  if (config.appendHistory && config.historyTurns === 0) {
    warnings.push('Conversation history enabled, but turn count is 0 — has no effect.');
  }

  const enabledPrep = PREPROCESSING_TOGGLES.filter((p) => config[p.key]).length;
  const langLabel =
    LANGUAGE_OPTIONS.find((l) => l.value === config.language)?.label || config.language;

  return (
    <div className="space-y-3">
      {/* ── Hero card ───────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-800/50 to-fuchsia-900/70 text-fuchsia-200 ring-1 ring-fuchsia-600/30">
            <MessageSquare size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-100">
              {config.mode === 'multiple_choice' ? 'Multiple choice' : 'Free-text query'}
            </p>
            <p className="truncate font-mono text-[10.5px] text-slate-400">
              {langLabel} · {config.minLength}–{config.maxLength} chars
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-fuchsia-700">
              {enabledPrep} {enabledPrep === 1 ? 'rule' : 'rules'}
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              {config.appendHistory ? `+${config.historyTurns} turns` : 'no history'}
            </span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-400">
          Defines the <span className="font-semibold text-slate-200">input contract</span> of the
          pipeline — shape, validation, normalization. Output styling, follow-ups, and token
          budgets live in the Response / LLM nodes.
        </p>
      </div>

      {/* ── Upstream contract banner ───────────────────────────────────── */}
      <div
        className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${
          hasUserContextUpstream
            ? 'border-fuchsia-200 bg-fuchsia-50/50'
            : 'border-slate-700/50 bg-slate-800/40/50'
        }`}
      >
        <Sparkles
          size={12}
          className={`mt-0.5 shrink-0 ${
            hasUserContextUpstream ? 'text-fuchsia-500' : 'text-slate-400'
          }`}
        />
        <p className="text-[10.5px] leading-snug text-slate-300">
          {hasUserContextUpstream ? (
            <>
              <span className="font-semibold text-fuchsia-700">User node connected.</span>{' '}
              Locale defaults can be inherited from upstream identity.
            </>
          ) : (
            <>
              <span className="font-semibold text-slate-200">No user-actor upstream.</span>{' '}
              Works standalone, but won&rsquo;t receive locale defaults.
            </>
          )}
        </p>
      </div>

      {/* ── Input shape ─────────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <MessageSquare size={12} className="text-fuchsia-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Input shape
          </h4>
        </header>

        <div className="grid grid-cols-2 gap-1.5">
          {INPUT_MODES.map((mode) => {
            const Icon = mode.icon;
            const active = config.mode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => setField('mode', mode.value)}
                className={`group flex flex-col gap-1 rounded-xl border bg-[#0d1117] p-2 text-left transition ${
                  active
                    ? 'border-fuchsia-300 ring-2 ring-fuchsia-600/50'
                    : 'border-slate-700/50 hover:border-fuchsia-200'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md transition ${
                      active
                        ? 'bg-fuchsia-900/40 text-fuchsia-300'
                        : 'bg-slate-800/60 text-slate-400 group-hover:bg-fuchsia-50 group-hover:text-fuchsia-500'
                    }`}
                  >
                    <Icon size={11} />
                  </span>
                  <span
                    className={`text-[11px] font-bold ${
                      active ? 'text-fuchsia-800' : 'text-slate-200'
                    }`}
                  >
                    {mode.label}
                  </span>
                </div>
                <span className="text-[9.5px] leading-snug text-slate-400">
                  {mode.description}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel
              title="Language"
              help="Auto = langid auto-detection. Otherwise hard-codes the query language."
            />
            <div className="relative">
              <Globe
                size={12}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <select
                value={config.language}
                onChange={(event) => setField('language', event.target.value)}
                className={`${inputClass} pl-7`}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <FieldLabel title="Placeholder" help="Shown when the textarea is empty." />
            <input
              type="text"
              value={config.placeholder}
              onChange={(event) => setField('placeholder', event.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {config.mode === 'free_text' && (
          <div>
            <FieldLabel
              title="Sample query"
              help="The playground pre-fills it. Leave empty to show only the placeholder."
            />
            <textarea
              rows={2}
              value={config.sampleQuery}
              onChange={(event) => setField('sampleQuery', event.target.value)}
              className={inputClass}
              placeholder="e.g. What does HyDE retrieval mean?"
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {SAMPLE_QUERIES.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => setField('sampleQuery', sample)}
                  className="rounded-md border border-slate-700/50 bg-[#0d1117] px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 transition hover:border-fuchsia-200 hover:text-fuchsia-700"
                  title={sample}
                >
                  <Sparkles size={9} className="mr-0.5 inline-block text-fuchsia-400" />
                  {sample.length > 32 ? `${sample.slice(0, 32)}…` : sample}
                </button>
              ))}
            </div>
          </div>
        )}

        {config.mode === 'multiple_choice' && (
          <div>
            <FieldLabel
              title="Choices (one line = one option)"
              help="Each new line will be a selectable answer."
            />
            <textarea
              rows={5}
              value={config.multipleChoiceOptions}
              onChange={(event) => setField('multipleChoiceOptions', event.target.value)}
              className={`${inputClass} font-mono`}
              placeholder={'Yes\nNo\nI don\u2019t know'}
            />
            <p className="mt-1 text-[10px] text-slate-400">
              {choiceCount} {choiceCount === 1 ? 'option' : 'options'} recognized.
            </p>
          </div>
        )}
      </section>

      {/* ── Validation ──────────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Ruler size={12} className="text-fuchsia-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Validation
          </h4>
        </header>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Min length (chars)" />
            <input
              type="number"
              min={0}
              step={1}
              value={config.minLength}
              onChange={(event) =>
                setField('minLength', Math.max(0, Number(event.target.value) || 0))
              }
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel title="Max length (chars)" />
            <input
              type="number"
              min={1}
              step={100}
              value={config.maxLength}
              onChange={(event) =>
                setField('maxLength', Math.max(1, Number(event.target.value) || 1))
              }
              className={inputClass}
            />
          </div>
        </div>

        <button
          type="button"
          aria-pressed={Boolean(config.required)}
          onClick={() => setField('required', !config.required)}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
            config.required
              ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800'
              : 'border-slate-700/50 bg-[#0d1117] text-slate-400 hover:border-fuchsia-200 hover:text-fuchsia-700'
          }`}
        >
          <CheckCircle2
            size={12}
            className={config.required ? 'text-fuchsia-500' : 'text-slate-400'}
          />
          Required (reject empty submissions)
        </button>

        <div>
          <FieldLabel
            title="Blocklist regex"
            help="Queries matching the regex are immediately rejected by Guardrails."
          />
          <div className="relative">
            <Hash
              size={12}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={config.blocklistRegex}
              onChange={(event) => setField('blocklistRegex', event.target.value)}
              placeholder="(?i)\\b(jailbreak|ignore previous)\\b"
              className={`${inputClass} pl-7 font-mono ${
                regexValidation.ok ? '' : 'border-rose-600/60 focus:border-rose-500 focus:ring-rose-600/40'
              }`}
            />
          </div>
          {!regexValidation.ok && (
            <p className="mt-1 text-[10px] font-semibold text-rose-600">
              Invalid regex: {regexValidation.message}
            </p>
          )}
        </div>
      </section>

      {/* ── Pre-processing ──────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 size={12} className="text-fuchsia-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Pre-processing
            </h4>
          </div>
          <span className="font-mono text-[10px] text-slate-400">
            {enabledPrep} / {PREPROCESSING_TOGGLES.length}
          </span>
        </header>
        <p className="text-[10px] leading-snug text-slate-400">
          Applied in order before the query is handed off to the Retriever.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PREPROCESSING_TOGGLES.map((toggle) => (
            <ToggleChip
              key={toggle.key}
              checked={config[toggle.key]}
              onChange={(v) => setField(toggle.key, v)}
              label={toggle.label}
              help={toggle.help}
            />
          ))}
        </div>
      </section>

      {/* ── Multi-turn ──────────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={12} className="text-fuchsia-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Multi-turn
            </h4>
          </div>
          <span className="font-mono text-[11px] font-bold text-fuchsia-700">
            {config.appendHistory ? `${config.historyTurns} turns` : 'off'}
          </span>
        </header>
        <button
          type="button"
          aria-pressed={Boolean(config.appendHistory)}
          onClick={() => setField('appendHistory', !config.appendHistory)}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
            config.appendHistory
              ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800'
              : 'border-slate-700/50 bg-[#0d1117] text-slate-400 hover:border-fuchsia-200 hover:text-fuchsia-700'
          }`}
        >
          <History
            size={12}
            className={config.appendHistory ? 'text-fuchsia-500' : 'text-slate-400'}
          />
          Append conversation history
        </button>
        <SliderRow
          label="History turns"
          value={config.historyTurns}
          min={0}
          max={16}
          step={1}
          onChange={(v) => setField('historyTurns', Math.max(0, Math.min(16, v)))}
          accentColor="#e879f9"
          disabled={!config.appendHistory}
        />
      </section>

      {/* ── Modality ────────────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Mic size={12} className="text-fuchsia-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Input modality
          </h4>
        </header>
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip
            checked={config.voiceInput}
            onChange={(v) => setField('voiceInput', v)}
            label="Voice input"
            help="Microphone button in the chat UI, using the Web Speech API."
          />
          <ToggleChip
            checked={config.enableSttFallback}
            onChange={(v) => setField('enableSttFallback', v)}
            label="STT fallback (Whisper)"
            help="If browser STT is unavailable, transcribe with server-side Whisper."
          />
        </div>
      </section>

      {/* ── Validation warnings / OK ────────────────────────────────────── */}
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
          Configuration valid — all checks passed.
        </div>
      )}

      {/* ── Output payload preview ──────────────────────────────────────── */}
      <details className="rounded-2xl border border-slate-700/50 bg-slate-800/40/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-fuchsia-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Zap size={11} className="text-fuchsia-400" />
        Output: <span className="font-mono text-fuchsia-700">query_input</span> → Retriever, Router, LLM
      </div>
    </div>
  );
}
