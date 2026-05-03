/**
 * QuestionSettingsPanel — defines how user-facing queries enter the pipeline.
 *
 * The Question node is the primary *query source* of the canvas. It owns
 * the contract of what a "user query" looks like before any retrieval,
 * routing, or generation happens:
 *   1. Input shape & validation (length, language, allowed chars).
 *   2. Pre-processing (trim, normalize, strip emoji, casefold, …).
 *   3. Sample / placeholder text used by the playground.
 *   4. Multi-turn handling — should previous turns be appended?
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 2)
 *   • Inputs: optional `user_context` from `user-actor` (for locale defaults).
 *   • Outputs: typed `query` payload consumed by Retriever / Router / LLM.
 *
 * Why a dedicated panel? The legacy generic form only exposed `language`
 * and `maxLength` as raw text fields. Real RAG pipelines need validation
 * rules (min length, allowed unicode ranges, blocklist), pre-processing
 * (trim, case, emoji strip), and a way to seed the playground with a
 * representative sample.
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Globe,
  Hash,
  ListChecks,
  MessageSquare,
  Ruler,
  Sparkles,
  Wand2,
  Zap,
} from 'lucide-react';

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-cyan-400';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
      {title}
    </label>
    {help && (
      <button
        type="button"
        title={help}
        className="shrink-0 text-slate-400 hover:text-slate-700"
      >
        <CircleHelp size={11} />
      </button>
    )}
  </div>
);

const ToggleRow = ({ checked, onChange, title, help }) => (
  <label
    className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 transition cursor-pointer ${
      checked
        ? 'border-cyan-300 bg-cyan-50/60'
        : 'border-slate-200 bg-white hover:border-slate-300'
    }`}
  >
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(event) => onChange?.(event.target.checked)}
      className="mt-0.5 h-3.5 w-3.5 accent-cyan-500"
    />
    <span className="min-w-0">
      <span className="block text-[11.5px] font-bold text-slate-700">{title}</span>
      {help && (
        <span className="mt-0.5 block text-[10.5px] leading-snug text-slate-500">{help}</span>
      )}
    </span>
  </label>
);

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
  { value: 'free_text', label: 'Free text — bármi gépelhető', icon: MessageSquare },
  { value: 'multiple_choice', label: 'Multiple choice — előre megadott opciók', icon: ListChecks },
];

// Sample queries the playground can pre-fill with one click.
const SAMPLE_QUERIES = [
  'Mit takar a vector store cosine similarity beállítása?',
  'Foglald össze a 2025 Q4 sales jelentést egy bekezdésben.',
  'Mi a különbség a HyDE és a query rewriting között?',
  'Adj 3 példát a hibrid keresés (BM25 + dense) előnyeire.',
  'Hogyan működik a reranking egy RAG pipeline-ban?',
];

/**
 * Default config — used by canvasConfig + as the merge base when older
 * payloads are loaded that don't carry the new keys.
 */
export const DEFAULT_QUESTION_CONFIG = {
  // Input shape
  mode: 'free_text',
  language: 'auto',
  placeholder: 'Tedd fel a kérdésed…',
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
  // Multi-turn
  appendHistory: true,
  historyTurns: 4,
};

/**
 * Compose the typed `query_input` payload that downstream nodes consume.
 * Mirrors the buildXxxPayload helpers from sibling panels so the read-only
 * preview block has something concrete to display.
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
      },
      history: {
        append: Boolean(c.appendHistory),
        turns: Math.max(0, Number(c.historyTurns) || 0),
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
    warnings.push('A min length nagyobb mint a max length — egy kérdés sem fogja átengedni.');
  }
  if (config.mode === 'multiple_choice' && choiceCount < 2) {
    warnings.push('Multiple choice módnál legalább 2 opció kell.');
  }
  if (!regexValidation.ok) {
    warnings.push(`Érvénytelen blocklist regex: ${regexValidation.message}`);
  }
  if (config.appendHistory && config.historyTurns === 0) {
    warnings.push('Conversation history bekapcsolva, de a turn count 0 — nincs hatása.');
  }

  return (
    <div className="space-y-3">
      {/* ── Upstream contract banner ───────────────────────────────────── */}
      <div
        className={`rounded-xl border p-3 ${
          hasUserContextUpstream
            ? 'border-cyan-200 bg-cyan-50/60'
            : 'border-slate-200 bg-slate-50/60'
        }`}
      >
        <div className="flex items-start gap-2">
          <MessageSquare
            size={14}
            className={hasUserContextUpstream ? 'text-cyan-700' : 'text-slate-500'}
          />
          <div className="min-w-0 flex-1">
            <p
              className={`text-[11px] font-black uppercase tracking-wider ${
                hasUserContextUpstream ? 'text-cyan-800' : 'text-slate-700'
              }`}
            >
              Upstream contract
            </p>
            <p
              className={`mt-0.5 text-[11px] ${
                hasUserContextUpstream ? 'text-cyan-900' : 'text-slate-600'
              }`}
            >
              {hasUserContextUpstream
                ? 'User node bekötve — locale és tone örökölhető tőle.'
                : 'Nincs user-actor upstream. A node önállóan is működik, de nem fogad locale defaultokat.'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Input shape ─────────────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={13} className="text-slate-500" />
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-700">
            Input shape
          </p>
        </div>

        <div>
          <FieldLabel title="Input mode" />
          <div className="grid grid-cols-2 gap-1.5">
            {INPUT_MODES.map((mode) => {
              const Icon = mode.icon;
              const active = config.mode === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setField('mode', mode.value)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10.5px] font-bold transition ${
                    active
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-800 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:text-cyan-700'
                  }`}
                >
                  <Icon size={12} className={active ? 'text-cyan-600' : 'text-slate-400'} />
                  <span className="truncate">{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel
              title="Language"
              help="Auto = langid auto-detection. Egyébként hard-codeolja a query nyelvét."
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
            <FieldLabel title="Placeholder" help="A textarea üres állapotában látszik." />
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
              help="A playground előtölti vele. Üresen hagyva csak a placeholder látszik."
            />
            <textarea
              rows={2}
              value={config.sampleQuery}
              onChange={(event) => setField('sampleQuery', event.target.value)}
              className={inputClass}
              placeholder="Pl. Mit jelent a HyDE retrieval?"
            />
            <div className="mt-1 flex flex-wrap gap-1">
              {SAMPLE_QUERIES.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => setField('sampleQuery', sample)}
                  className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:border-cyan-300 hover:text-cyan-700"
                  title={sample}
                >
                  <Sparkles size={9} className="mr-0.5 inline-block text-amber-400" />
                  {sample.length > 32 ? `${sample.slice(0, 32)}…` : sample}
                </button>
              ))}
            </div>
          </div>
        )}

        {config.mode === 'multiple_choice' && (
          <div>
            <FieldLabel
              title="Choices (egy sor = egy opció)"
              help="Minden új sor egy választható válasz lesz."
            />
            <textarea
              rows={5}
              value={config.multipleChoiceOptions}
              onChange={(event) => setField('multipleChoiceOptions', event.target.value)}
              className={`${inputClass} font-mono`}
              placeholder={'Igen\nNem\nNem tudom'}
            />
            <p className="mt-1 text-[10px] text-slate-500">
              {choiceCount} opció felismerve.
            </p>
          </div>
        )}
      </div>

      {/* ── Validation ──────────────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <Ruler size={13} className="text-slate-500" />
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-700">
            Validation
          </p>
        </div>

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

        <ToggleRow
          checked={config.required}
          onChange={(v) => setField('required', v)}
          title="Required"
          help="Ha be van kapcsolva, üres kérdés submit-je hibát dob a Guardrails előtt."
        />

        <div>
          <FieldLabel
            title="Blocklist regex"
            help="A regex-et találó query-ket a Guardrails azonnal elutasítja."
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
                regexValidation.ok ? '' : 'border-rose-300 focus:ring-rose-400'
              }`}
            />
          </div>
          {!regexValidation.ok && (
            <p className="mt-1 text-[10px] font-semibold text-rose-600">
              Hibás regex: {regexValidation.message}
            </p>
          )}
        </div>
      </div>

      {/* ── Pre-processing ──────────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <Wand2 size={13} className="text-slate-500" />
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-700">
            Pre-processing
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ToggleRow
            checked={config.trimWhitespace}
            onChange={(v) => setField('trimWhitespace', v)}
            title="Trim whitespace"
            help="Levágja a vezető / záró space-eket."
          />
          <ToggleRow
            checked={config.collapseWhitespace}
            onChange={(v) => setField('collapseWhitespace', v)}
            title="Collapse whitespace"
            help="Több space → egy. Sortörést is normalizál."
          />
          <ToggleRow
            checked={config.normalizeUnicode}
            onChange={(v) => setField('normalizeUnicode', v)}
            title="Normalize unicode (NFC)"
            help="Egységesíti a kompozit karaktereket."
          />
          <ToggleRow
            checked={config.stripEmoji}
            onChange={(v) => setField('stripEmoji', v)}
            title="Strip emoji"
            help="Eltávolítja a Unicode emoji karaktereket."
          />
          <ToggleRow
            checked={config.caseFold}
            onChange={(v) => setField('caseFold', v)}
            title="Case-fold (lowercase)"
            help="Embedding modellnél jobb relevancia, de elveszik a tulajdonnév-érzékenység."
          />
        </div>
      </div>

      {/* ── Multi-turn ──────────────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <ListChecks size={13} className="text-slate-500" />
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-700">
            Multi-turn
          </p>
        </div>
        <ToggleRow
          checked={config.appendHistory}
          onChange={(v) => setField('appendHistory', v)}
          title="Append conversation history"
          help="Az előző N turn-t hozzácsatolja a query-hez (User node rememberHistory-jának kell engednie)."
        />
        <div>
          <FieldLabel title="History turns (N)" help="Hány korábbi user/assistant turn kerüljön be." />
          <input
            type="number"
            min={0}
            max={32}
            step={1}
            value={config.historyTurns}
            onChange={(event) =>
              setField(
                'historyTurns',
                Math.min(32, Math.max(0, Number(event.target.value) || 0)),
              )
            }
            className={inputClass}
            disabled={!config.appendHistory}
          />
        </div>
      </div>

      {/* ── Warnings / OK ───────────────────────────────────────────────── */}
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
          Konfiguráció rendben — minden ellenőrzés zöld.
        </div>
      )}

      {/* ── Read-only payload ───────────────────────────────────────────── */}
      <div>
        <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
          Output payload (read-only)
        </p>
        <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-cyan-300">
{JSON.stringify(payload, null, 2)}
        </pre>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-cyan-500" />
        Kimenet: <span className="font-mono">query_input</span> → Retriever, Router, LLM
      </div>
    </div>
  );
}
