/**
 * ResponseSettingsPanel — final delivery node for the RAG pipeline.
 *
 * The Response node is the *last hop* before a generated answer reaches
 * the end user. Its job is purely presentational + governance:
 *   1. Take the typed `chat_completion` payload coming from the LLM
 *      (or whatever produced the answer) and shape how it's rendered.
 *   2. Apply post-processing safety filters (PII / profanity / language).
 *   3. Decide which delivery channels receive the final text
 *      (chat UI, TTS voice, file export, webhook, …).
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 18)
 *   • Inputs (one of, preferred order):
 *       - `chat_completion` from `brain-llm`
 *       - `text` from `brain-tts` (already voice-narrated)
 *   • Outputs: terminal — produces a `final_response` payload that the
 *     runner persists to the chat transcript.
 *
 * Why a dedicated panel? The legacy generic config form only exposed
 * `includeCitations` + `format` as two raw text fields. With structured
 * output, multi-channel delivery and PII redaction this surface needs to
 * be a first-class panel like the LLM / Reranker ones.
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleHelp,
  FileText,
  Languages,
  Quote,
  ShieldCheck,
  Webhook,
  Volume2,
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

const ToggleRow = ({ checked, onChange, title, help, disabled = false }) => (
  <label
    className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 transition ${
      disabled
        ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-60'
        : checked
          ? 'cursor-pointer border-cyan-300 bg-cyan-50/60'
          : 'cursor-pointer border-slate-200 bg-white hover:border-slate-300'
    }`}
  >
    <input
      type="checkbox"
      checked={Boolean(checked)}
      disabled={disabled}
      onChange={(event) => onChange?.(event.target.checked)}
      className="mt-0.5 h-3.5 w-3.5 accent-cyan-500"
    />
    <span className="min-w-0">
      <span className="block text-[11.5px] font-bold text-slate-700">{title}</span>
      {help && <span className="mt-0.5 block text-[10.5px] leading-snug text-slate-500">{help}</span>}
    </span>
  </label>
);

// Presentation formats. `inherit` = honour whatever the upstream LLM emits
// (response_format on the LLM payload). The rest force a specific renderer.
const FORMAT_OPTIONS = [
  { value: 'inherit', label: 'Inherit from LLM', hint: 'Use whatever the LLM negotiated.' },
  { value: 'markdown', label: 'Markdown', hint: 'Rich text with headings, lists, links.' },
  { value: 'plain', label: 'Plain text', hint: 'Strip all formatting — safest for TTS.' },
  { value: 'html', label: 'HTML (sanitised)', hint: 'Rendered through a DOMPurify-like allowlist.' },
];

const CITATION_STYLES = [
  { value: 'inline', label: 'Inline [1]', hint: 'Place numeric markers next to claims.' },
  { value: 'footnote', label: 'Footnotes', hint: 'Collect sources at the bottom.' },
  { value: 'hyperlink', label: 'Hyperlinks', hint: 'Link the cited phrase to the source URL.' },
  { value: 'hidden', label: 'Hidden', hint: 'Cite internally but do not show in the message.' },
];

const TRUNCATION_BEHAVIOURS = [
  { value: 'hard_cut', label: 'Hard cut + ellipsis (…)' },
  { value: 'summarise_tail', label: 'Summarise the tail (extra LLM call)' },
  { value: 'show_more', label: 'Cut + “Show more” expander' },
  { value: 'none', label: 'No truncation' },
];

const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto (mirror user)' },
  { value: 'en', label: 'English' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
];

const EXPORT_FORMATS = [
  { value: 'md', label: 'Markdown (.md)' },
  { value: 'pdf', label: 'PDF (.pdf)' },
  { value: 'json', label: 'Structured JSON' },
  { value: 'txt', label: 'Plain text (.txt)' },
];

/**
 * Default config used by canvasConfig + as the merge base when older
 * payloads are loaded from disk that don't yet carry the new keys.
 */
export const DEFAULT_RESPONSE_CONFIG = {
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
  channels: {
    chat: true,
    voice: false,
    export: false,
    webhook: false,
  },
  exportFormat: 'md',
  webhookUrl: '',
  // Telemetry
  logLatency: true,
  logTokens: true,
  collectFeedback: true,
};

/**
 * Compose the typed `final_response` payload that the runner persists
 * to the chat transcript. Mirrors the buildXxxPayload helpers from the
 * other panels so the read-only preview block has something concrete
 * to display and downstream consumers can rely on a stable schema.
 */
export function buildResponsePayload(config = {}) {
  const c = { ...DEFAULT_RESPONSE_CONFIG, ...config };
  return {
    step_type: 'final_response',
    metadata: {
      format: c.format,
      include_citations: c.includeCitations,
      citation_style: c.includeCitations ? c.citationStyle : null,
      show_reasoning: c.showReasoning,
      stream_tokens: c.streamTokens,
      max_chars: c.maxChars,
      truncation: c.truncation,
      post_processing: {
        redact_pii: c.redactPii,
        profanity_filter: c.profanityFilter,
        enforce_language: c.enforceLanguage,
      },
      delivery: {
        chat: c.channels?.chat ?? true,
        voice: c.channels?.voice ?? false,
        export: c.channels?.export
          ? { enabled: true, format: c.exportFormat }
          : { enabled: false },
        webhook: c.channels?.webhook
          ? { enabled: true, url: c.webhookUrl || '' }
          : { enabled: false },
      },
      telemetry: {
        log_latency: c.logLatency,
        log_tokens: c.logTokens,
        collect_feedback: c.collectFeedback,
      },
    },
  };
}

export default function ResponseSettingsPanel({
  value = {},
  onChange,
  upstreamFormat = null,
  upstreamHasCitations = false,
  hasUpstreamProducer = false,
}) {
  const config = useMemo(() => ({ ...DEFAULT_RESPONSE_CONFIG, ...value }), [value]);
  const payload = useMemo(() => buildResponsePayload(config), [config]);
  const setField = (field, fieldValue) => onChange?.(field, fieldValue);
  const setChannel = (channelKey, enabled) =>
    onChange?.('channels', { ...config.channels, [channelKey]: enabled });

  // Detect impossible / risky combinations so we can surface a warning chip.
  const warnings = [];
  if (config.channels?.voice && config.format === 'html') {
    warnings.push('HTML format is not ideal for TTS — switch to plain text.');
  }
  if (config.channels?.webhook && !config.webhookUrl?.trim()) {
    warnings.push('Webhook is enabled but no URL is provided.');
  }
  if (config.includeCitations && !upstreamHasCitations && hasUpstreamProducer) {
    warnings.push('Citations are enabled, but the upstream LLM does not produce citations.');
  }
  if (!Object.values(config.channels || {}).some(Boolean)) {
    warnings.push('No delivery channel is enabled — the response will not be sent anywhere.');
  }

  return (
    <div className="space-y-3">
      {/* ── Upstream contract banner ───────────────────────────────────── */}
      <div
        className={`rounded-xl border p-3 ${
          hasUpstreamProducer
            ? 'border-cyan-200 bg-cyan-50/60'
            : 'border-amber-200 bg-amber-50/60'
        }`}
      >
        <div className="flex items-start gap-2">
          <Bot size={14} className={hasUpstreamProducer ? 'text-cyan-700' : 'text-amber-700'} />
          <div className="min-w-0 flex-1">
            <p
              className={`text-[11px] font-black uppercase tracking-wider ${
                hasUpstreamProducer ? 'text-cyan-800' : 'text-amber-800'
              }`}
            >
              Upstream contract
            </p>
            {hasUpstreamProducer ? (
              <p className="mt-0.5 text-[11px] text-cyan-900">
                Input: <span className="font-mono">chat_completion</span>
                {upstreamFormat && (
                  <>
                    {' '}· LLM format:{' '}
                    <span className="font-mono font-bold">{upstreamFormat}</span>
                  </>
                )}
              </p>
            ) : (
              <p className="mt-0.5 text-[11px] text-amber-900">
                No upstream response source detected. Connect a{' '}
                <span className="font-mono font-bold">brain-llm</span> node so the Response
                node can receive real content.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Presentation ───────────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <FileText size={13} className="text-slate-500" />
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-700">
            Presentation
          </p>
        </div>

        <div>
          <FieldLabel
            title="Format"
            help="If 'Inherit', the panel honours the response_format set by the LLM."
          />
          <select
            value={config.format}
            onChange={(event) => setField('format', event.target.value)}
            className={inputClass}
          >
            {FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.hint}
              </option>
            ))}
          </select>
        </div>

        <ToggleRow
          checked={config.includeCitations}
          onChange={(v) => setField('includeCitations', v)}
          title="Show citations"
          help="Appends the sources tied to the retrieved chunks to the response."
        />

        {config.includeCitations && (
          <div>
            <FieldLabel title="Citation style" />
            <select
              value={config.citationStyle}
              onChange={(event) => setField('citationStyle', event.target.value)}
              className={inputClass}
            >
              {CITATION_STYLES.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label} — {style.hint}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ToggleRow
            checked={config.showReasoning}
            onChange={(v) => setField('showReasoning', v)}
            title="Reasoning trace"
            help="Shows intermediate steps to the end user (debug / tutor mode)."
          />
          <ToggleRow
            checked={config.streamTokens}
            onChange={(v) => setField('streamTokens', v)}
            title="Stream tokens"
            help="Token-by-token rendering via SSE for the 'thinking UI' feel."
          />
        </div>
      </div>

      {/* ── Length & shape ─────────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <Quote size={13} className="text-slate-500" />
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-700">
            Length &amp; shape
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Max chars" help="Cap on the displayed response length." />
            <input
              type="number"
              min={100}
              step={100}
              value={config.maxChars}
              onChange={(event) =>
                setField('maxChars', Math.max(100, Number(event.target.value) || 0))
              }
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel title="Truncation" />
            <select
              value={config.truncation}
              onChange={(event) => setField('truncation', event.target.value)}
              className={inputClass}
            >
              {TRUNCATION_BEHAVIOURS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Post-processing safety ─────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={13} className="text-amber-700" />
          <p className="text-[11px] font-black uppercase tracking-wider text-amber-800">
            Post-processing
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ToggleRow
            checked={config.redactPii}
            onChange={(v) => setField('redactPii', v)}
            title="PII redaction"
            help="Mask email, phone, address, card number before display."
          />
          <ToggleRow
            checked={config.profanityFilter}
            onChange={(v) => setField('profanityFilter', v)}
            title="Profanity filter"
            help="Star out profanity / offensive expressions."
          />
        </div>

        <div>
          <FieldLabel
            title="Enforce language"
            help="If it arrives in another language, post-translates to the selected target language."
          />
          <div className="relative">
            <Languages
              size={12}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <select
              value={config.enforceLanguage}
              onChange={(event) => setField('enforceLanguage', event.target.value)}
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
      </div>

      {/* ── Delivery channels ──────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-cyan-600" />
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-700">
            Delivery channels
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ToggleRow
            checked={config.channels?.chat}
            onChange={(v) => setChannel('chat', v)}
            title="Chat UI"
            help="Displayed in the classic chat UI."
          />
          <ToggleRow
            checked={config.channels?.voice}
            onChange={(v) => setChannel('voice', v)}
            title="Voice (TTS)"
            help="Reads the response aloud via the brain-tts node."
          />
          <ToggleRow
            checked={config.channels?.export}
            onChange={(v) => setChannel('export', v)}
            title="Export"
            help="Produces a downloadable file in the selected format."
          />
          <ToggleRow
            checked={config.channels?.webhook}
            onChange={(v) => setChannel('webhook', v)}
            title="Webhook"
            help="POST to the given URL — for automation."
          />
        </div>

        {config.channels?.export && (
          <div>
            <FieldLabel title="Export format" />
            <select
              value={config.exportFormat}
              onChange={(event) => setField('exportFormat', event.target.value)}
              className={inputClass}
            >
              {EXPORT_FORMATS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {config.channels?.webhook && (
          <div>
            <FieldLabel title="Webhook URL" help="HTTPS-only. The payload is sent as JSON." />
            <div className="relative">
              <Webhook
                size={12}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="url"
                value={config.webhookUrl}
                placeholder="https://example.com/hooks/xrag"
                onChange={(event) => setField('webhookUrl', event.target.value)}
                className={`${inputClass} pl-7 font-mono`}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Telemetry ──────────────────────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <Volume2 size={13} className="text-slate-500" />
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-700">
            Telemetry
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <ToggleRow
            checked={config.logLatency}
            onChange={(v) => setField('logLatency', v)}
            title="Log latency"
          />
          <ToggleRow
            checked={config.logTokens}
            onChange={(v) => setField('logTokens', v)}
            title="Log tokens"
          />
          <ToggleRow
            checked={config.collectFeedback}
            onChange={(v) => setField('collectFeedback', v)}
            title="Feedback prompt"
          />
        </div>
      </div>

      {/* ── Warnings ───────────────────────────────────────────────────── */}
      {warnings.length > 0 && (
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
      )}
      {warnings.length === 0 && (
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-emerald-800">
          <CheckCircle2 size={11} />
          Configuration valid — all checks passed.
        </div>
      )}

      {/* ── Read-only payload ──────────────────────────────────────────── */}
      <div>
        <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
          Output payload (read-only)
        </p>
        <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-cyan-300">
{JSON.stringify(payload, null, 2)}
        </pre>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-cyan-500" />
        Output: <span className="font-mono">final_response</span> → chat transcript
      </div>
    </div>
  );
}
