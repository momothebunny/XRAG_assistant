/**
 * ResponseSettingsPanel  final delivery node for the RAG pipeline.
 *
 * Visual language matches UserSettingsPanel / QuestionSettingsPanel
 * (modern, soft fuchsia atoms  hero card, preset grid, ToggleChip pills,
 * sectioned cards, range slider, validation strip, collapsible payload
 * preview). The schema and the `buildResponsePayload` helper are
 * preserved verbatim so the backend runner that consumes the typed
 * `final_response` payload keeps working unchanged.
 *
 * What belongs here, and ONLY here:
 *   1. Presentation      format, citation style, reasoning trace, streaming.
 *   2. Length & shape    character cap + truncation strategy.
 *   3. Post-processing   PII redaction, profanity filter, language enforcement.
 *   4. Delivery          chat, voice (TTS), file export, webhook.
 *   5. Telemetry         latency / token counters / feedback prompt.
 *
 * What does NOT belong here (delegated to sibling nodes):
 *    Generation params (temperature, top_p, ...)  LLM node
 *    Tone / persona / role instructions           System Prompt node
 *    Identity / RBAC / quotas                     User node
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 18)
 *    Inputs (one of, preferred order):
 *       - `chat_completion` from `brain-llm`
 *       - `text` from upstream answer-producing nodes
 *    Outputs: terminal  produces a `final_response` payload that the
 *     runner persists to the chat transcript.
 */

import { useMemo } from 'react';
import SliderRow from './SliderRow';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleHelp,
  FileDown,
  FileText,
  Languages,
  MessageSquare,
  Mic,
  Quote,
  Send,
  ShieldCheck,
  Sparkles,
  Volume2,
  Webhook,
  Zap,
} from 'lucide-react';

//  Shared atoms (modern, soft fuchsia  mirrors User / Question panels) 
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
 * ToggleChip  pill button with aria-pressed state.
 *
 * Implemented as a real <button>, NOT a <label> wrapping a hidden <input>.
 * Hidden checkboxes inside <label> can cause the browser to scroll the page
 * when focus moves into a clipped (sr-only) element  visible to the user
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

//  Domain options 
// Presentation formats. `inherit` = honour whatever the upstream LLM emits
// (response_format on the LLM payload). The rest force a specific renderer.
const FORMAT_OPTIONS = [
  { value: 'inherit',  label: 'Inherit from LLM', hint: 'Use whatever the LLM negotiated.' },
  { value: 'markdown', label: 'Markdown',          hint: 'Rich text with headings, lists, links.' },
  { value: 'plain',    label: 'Plain text',        hint: 'Strip all formatting  safest for TTS.' },
  { value: 'html',     label: 'HTML (sanitised)',  hint: 'Rendered through a DOMPurify-like allowlist.' },
];

const CITATION_STYLES = [
  { value: 'inline',    label: 'Inline [1]',  hint: 'Place numeric markers next to claims.' },
  { value: 'footnote',  label: 'Footnotes',   hint: 'Collect sources at the bottom.' },
  { value: 'hyperlink', label: 'Hyperlinks',  hint: 'Link the cited phrase to the source URL.' },
  { value: 'hidden',    label: 'Hidden',      hint: 'Cite internally but do not show in the message.' },
];

const TRUNCATION_BEHAVIOURS = [
  { value: 'hard_cut',        label: 'Hard cut + ellipsis ()' },
  { value: 'summarise_tail',  label: 'Summarise the tail (extra LLM call)' },
  { value: 'show_more',       label: 'Cut + Show more expander' },
  { value: 'none',            label: 'No truncation' },
];

const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto (mirror user)' },
  { value: 'en',   label: 'English' },
  { value: 'hu',   label: 'Hungarian' },
  { value: 'de',   label: 'German' },
  { value: 'fr',   label: 'French' },
  { value: 'es',   label: 'Spanish' },
];

const EXPORT_FORMATS = [
  { value: 'md',   label: 'Markdown (.md)' },
  { value: 'pdf',  label: 'PDF (.pdf)' },
  { value: 'json', label: 'Structured JSON' },
  { value: 'txt',  label: 'Plain text (.txt)' },
];

const TELEMETRY_TOGGLES = [
  { key: 'logLatency',      label: 'Log latency',      help: 'Record request  response duration.' },
  { key: 'logTokens',       label: 'Log tokens',       help: 'Record prompt / completion token counts.' },
  { key: 'collectFeedback', label: 'Feedback prompt',  help: 'Show ?? / ?? controls under the answer.' },
];

// Quick presets  mirror the persona-preset pattern from UserSettingsPanel.
// Each preset overrides a coherent subset of the schema; "custom" is
// implicit (the chip simply lights up when the user diverges).
const RESPONSE_PRESETS = [
  {
    id: 'concise',
    label: 'Concise',
    description: 'Short plain text, no citations.',
    icon: MessageSquare,
    overrides: {
      format: 'plain',
      includeCitations: false,
      showReasoning: false,
      streamTokens: false,
      maxChars: 1500,
      truncation: 'hard_cut',
    },
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Markdown + inline citations, streamed.',
    icon: Sparkles,
    overrides: {
      format: 'inherit',
      includeCitations: true,
      citationStyle: 'inline',
      showReasoning: false,
      streamTokens: true,
      maxChars: 4000,
      truncation: 'show_more',
    },
  },
  {
    id: 'detailed',
    label: 'Detailed',
    description: 'Full reasoning + footnotes.',
    icon: FileText,
    overrides: {
      format: 'markdown',
      includeCitations: true,
      citationStyle: 'footnote',
      showReasoning: true,
      streamTokens: true,
      maxChars: 8000,
      truncation: 'show_more',
    },
  },
  {
    id: 'voice',
    label: 'Voice',
    description: 'Plain text optimised for TTS.',
    icon: Mic,
    overrides: {
      format: 'plain',
      includeCitations: false,
      showReasoning: false,
      streamTokens: false,
      maxChars: 2500,
      truncation: 'summarise_tail',
      enforceLanguage: 'auto',
    },
  },
];

//  Schema (UNCHANGED  backend `final_response` consumer depends on it) 
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
  // Quick-preset hint (UI-only  not persisted in the typed payload).
  preset: 'standard',
};

/**
 * Compose the typed `final_response` payload that the runner persists
 * to the chat transcript. Keys / nesting MUST stay stable  the backend
 * canvas runner pattern-matches on this exact shape.
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

//  Component 
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

  const applyPreset = (presetId) => {
    const preset = RESPONSE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setField('preset', preset.id);
    Object.entries(preset.overrides).forEach(([key, val]) => setField(key, val));
  };

  // Detect impossible / risky combinations so we can surface a warning chip.
  const warnings = [];
  if (config.channels?.voice && config.format === 'html') {
    warnings.push('HTML format is not ideal for TTS  switch to plain text.');
  }
  if (config.channels?.webhook && !config.webhookUrl?.trim()) {
    warnings.push('Webhook is enabled but no URL is provided.');
  }
  if (config.channels?.webhook && config.webhookUrl?.trim() && !/^https:\/\//i.test(config.webhookUrl)) {
    warnings.push('Webhook URL should be HTTPS for transport security.');
  }
  if (config.includeCitations && !upstreamHasCitations && hasUpstreamProducer) {
    warnings.push('Citations are enabled, but the upstream LLM does not produce citations.');
  }
  if (!Object.values(config.channels || {}).some(Boolean)) {
    warnings.push('No delivery channel is enabled  the response will not be sent anywhere.');
  }

  // Derived bits for the hero card.
  const activeChannels = Object.entries(config.channels || {})
    .filter(([, on]) => on)
    .map(([k]) => k);
  const channelLabel = activeChannels.length === 0
    ? 'no channel'
    : activeChannels.join('  ');
  const formatLabel = FORMAT_OPTIONS.find((f) => f.value === config.format)?.label ?? config.format;

  return (
    <div className="space-y-3">
      {/*  Hero card  */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-800/50 to-fuchsia-900/70 text-fuchsia-200 ring-1 ring-fuchsia-600/30">
            <Send size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-100">Final response</p>
            <p className="truncate font-mono text-[10.5px] text-slate-400">
              {formatLabel}  {channelLabel}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-fuchsia-700">
              {config.maxChars} chars
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              {config.streamTokens ? 'streamed' : 'one-shot'}
            </span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-400">
          The <span className="font-semibold text-slate-200">last hop</span> before the answer
          reaches the user. Shapes presentation, applies safety filters, and routes the result
          to the selected delivery channels.
        </p>
      </div>

      {/*  Upstream contract  */}
      <div
        className={`rounded-2xl border p-3 ${
          hasUpstreamProducer
            ? 'border-fuchsia-200 bg-fuchsia-50/50'
            : 'border-amber-700/40 bg-amber-900/20'
        }`}
      >
        <div className="flex items-start gap-2">
          <Bot size={14} className={hasUpstreamProducer ? 'text-fuchsia-700' : 'text-amber-400'} />
          <div className="min-w-0 flex-1">
            <p
              className={`text-[10px] font-semibold uppercase tracking-wider ${
                hasUpstreamProducer ? 'text-fuchsia-800' : 'text-amber-300'
              }`}
            >
              Upstream contract
            </p>
            {hasUpstreamProducer ? (
              <p className="mt-0.5 text-[11px] text-fuchsia-900">
                Input: <span className="font-mono">chat_completion</span>
                {upstreamFormat && (
                  <>
                    {' '} LLM format:{' '}
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

      {/*  Quick presets  */}
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-slate-800/40/40 p-3">
        <header className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Quick presets
          </p>
          {!RESPONSE_PRESETS.some((p) => p.id === config.preset) && (
            <span className="rounded-full border border-fuchsia-200 bg-[#0d1117] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-fuchsia-700">
              custom
            </span>
          )}
        </header>
        <div className="grid grid-cols-2 gap-1.5">
          {RESPONSE_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const active = config.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
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
                    {preset.label}
                  </span>
                </div>
                <span className="text-[9.5px] leading-snug text-slate-400">
                  {preset.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/*  Presentation  */}
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <FileText size={12} className="text-fuchsia-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Presentation
          </h4>
        </header>

        <div>
          <FieldLabel
            title="Format"
            help="If 'Inherit', the panel honours the response_format set by the LLM."
          />
          <select
            value={config.format}
            onChange={(event) => {
              setField('format', event.target.value);
              setField('preset', 'custom');
            }}
            className={inputClass}
          >
            {FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}  {option.hint}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <ToggleChip
            checked={config.includeCitations}
            onChange={(v) => { setField('includeCitations', v); setField('preset', 'custom'); }}
            label="Citations"
            help="Append the sources tied to retrieved chunks."
          />
          <ToggleChip
            checked={config.showReasoning}
            onChange={(v) => { setField('showReasoning', v); setField('preset', 'custom'); }}
            label="Reasoning trace"
            help="Show intermediate steps (debug / tutor mode)."
          />
          <ToggleChip
            checked={config.streamTokens}
            onChange={(v) => { setField('streamTokens', v); setField('preset', 'custom'); }}
            label="Stream tokens"
            help="Token-by-token rendering via SSE."
          />
        </div>

        {config.includeCitations && (
          <div>
            <FieldLabel title="Citation style" />
            <select
              value={config.citationStyle}
              onChange={(event) => {
                setField('citationStyle', event.target.value);
                setField('preset', 'custom');
              }}
              className={inputClass}
            >
              {CITATION_STYLES.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}  {style.hint}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/*  Length & shape  */}
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Quote size={12} className="text-fuchsia-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Length &amp; shape
            </h4>
          </div>
        </header>

        <SliderRow
          label="Max chars"
          value={config.maxChars}
          min={500}
          max={12000}
          step={500}
          onChange={(v) => {
            setField('maxChars', Math.max(500, v));
            setField('preset', 'custom');
          }}
          format={(v) => `${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`}
          accentColor="#e879f9"
          minLabel="500"
          maxLabel="12k"
        />

        <div>
          <FieldLabel title="Truncation behaviour" />
          <select
            value={config.truncation}
            onChange={(event) => {
              setField('truncation', event.target.value);
              setField('preset', 'custom');
            }}
            className={inputClass}
          >
            {TRUNCATION_BEHAVIOURS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/*  Post-processing  */}
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <ShieldCheck size={12} className="text-fuchsia-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Post-processing
          </h4>
        </header>

        <div className="flex flex-wrap gap-1.5">
          <ToggleChip
            checked={config.redactPii}
            onChange={(v) => setField('redactPii', v)}
            label="PII redaction"
            help="Mask email, phone, address, card number before display."
          />
          <ToggleChip
            checked={config.profanityFilter}
            onChange={(v) => setField('profanityFilter', v)}
            label="Profanity filter"
            help="Star out profanity / offensive expressions."
          />
        </div>

        <div>
          <FieldLabel
            title="Enforce language"
            help="If the answer arrives in another language, post-translate to the selected target."
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
      </section>

      {/*  Delivery channels  */}
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={12} className="text-fuchsia-500" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Delivery channels
            </h4>
          </div>
          <span className="font-mono text-[10px] text-slate-400">
            {activeChannels.length} active
          </span>
        </header>

        <div className="flex flex-wrap gap-1.5">
          <ToggleChip
            checked={config.channels?.chat}
            onChange={(v) => setChannel('chat', v)}
            label="Chat UI"
            help="Displayed in the classic chat UI."
          />
          <ToggleChip
            checked={config.channels?.voice}
            onChange={(v) => setChannel('voice', v)}
            label="Voice (TTS)"
            help="Read aloud via the app voice delivery channel."
          />
          <ToggleChip
            checked={config.channels?.export}
            onChange={(v) => setChannel('export', v)}
            label="Export"
            help="Produce a downloadable file."
          />
          <ToggleChip
            checked={config.channels?.webhook}
            onChange={(v) => setChannel('webhook', v)}
            label="Webhook"
            help="POST the response to a URL."
          />
        </div>

        {config.channels?.export && (
          <div>
            <FieldLabel title="Export format" />
            <div className="relative">
              <FileDown
                size={12}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <select
                value={config.exportFormat}
                onChange={(event) => setField('exportFormat', event.target.value)}
                className={`${inputClass} pl-7`}
              >
                {EXPORT_FORMATS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {config.channels?.webhook && (
          <div>
            <FieldLabel title="Webhook URL" help="HTTPS-only. Payload is sent as JSON." />
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
      </section>

      {/*  Telemetry  */}
      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Volume2 size={12} className="text-fuchsia-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Telemetry
          </h4>
        </header>
        <div className="flex flex-wrap gap-1.5">
          {TELEMETRY_TOGGLES.map((toggle) => (
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

      {/*  Validation strip  */}
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
          Configuration valid  all checks passed.
        </div>
      )}

      {/*  Output payload preview  */}
      <details className="rounded-2xl border border-slate-700/50 bg-slate-800/40/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-fuchsia-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      {/*  Footer  */}
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Zap size={11} className="text-fuchsia-400" />
        Output: <span className="font-mono text-fuchsia-700">final_response</span>  chat transcript
      </div>
    </div>
  );
}
