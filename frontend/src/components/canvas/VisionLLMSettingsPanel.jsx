/**
 * VisionLLMSettingsPanel  amber-themed multimodal vision LLM inspector.
 *
 * Backend contract (`process-vision-llm` in `nodes.py::_exec_vision_llm`):
 *   { model, temperature, maxTokens, task, customPrompt,
 *     includeImageInContext, detailHigh }
 * Inputs: images, text. Outputs: answer, text.
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  CircleHelp,
  Eye,
  Sliders,
  Zap,
} from 'lucide-react';

const VISION_MODELS = [
  { value: 'openai/gpt-4o',                                label: 'GPT-4o (OpenAI)' },
  { value: 'openai/gpt-4-turbo',                           label: 'GPT-4 Turbo Vision' },
  { value: 'anthropic/claude-3.5-sonnet',                  label: 'Claude 3.5 Sonnet' },
  { value: 'anthropic/claude-3-opus',                      label: 'Claude 3 Opus' },
  { value: 'google/gemini-pro-vision',                     label: 'Gemini Pro Vision' },
  { value: 'google/gemini-flash-1.5',                      label: 'Gemini Flash 1.5' },
  { value: 'meta-llama/llama-3.2-11b-vision-instruct',     label: 'Llama 3.2 Vision 11B' },
];

const TASKS = [
  { value: 'vqa',             label: 'Visual QA',         hint: 'Answer questions about the image' },
  { value: 'caption',         label: 'Caption',           hint: 'Image captioning' },
  { value: 'ocr',             label: 'OCR',               hint: 'Text extraction' },
  { value: 'chart-analysis',  label: 'Chart',             hint: 'Chart / diagram analysis' },
  { value: 'document-parse',  label: 'Doc parse',         hint: 'Tables, forms' },
  { value: 'custom',          label: 'Custom',            hint: 'Use the prompt below' },
];

const inputClass =
  'w-full rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-amber-600/60 focus:ring-2 focus:ring-amber-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-amber-500">
        <CircleHelp size={11} />
      </span>
    )}
  </div>
);

const ToggleChip = ({ checked, onChange, label, help }) => (
  <button
    type="button"
    title={help}
    aria-pressed={Boolean(checked)}
    onClick={() => onChange?.(!checked)}
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
      checked
        ? 'border-amber-600/60 bg-amber-900/20 text-amber-300 shadow-sm shadow-amber-200/40'
        : 'border-slate-700/50 bg-[#0d1117] text-slate-400 hover:border-amber-700/40 hover:text-amber-400'
    }`}
  >
    <span aria-hidden className={`inline-block h-2 w-2 rounded-full transition ${checked ? 'bg-amber-500' : 'bg-slate-300'}`} />
    {label}
  </button>
);

function StatPill({ label, hint, ok = true, Icon }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-[10px] ${ok ? 'border-amber-700/40 bg-amber-900/20 text-amber-300' : 'border-slate-700/50 bg-[#0d1117] text-slate-400'}`}>
      <div className="flex items-center gap-1">
        <Icon size={10} />
        <p className="font-bold">{label}</p>
      </div>
      <p className="mt-0.5 truncate font-mono text-[9px]">{hint}</p>
    </div>
  );
}

function buildPayload(value) {
  return {
    model:                 String(value?.model ?? 'openai/gpt-4o'),
    temperature:           Math.max(0, Math.min(2, Number(value?.temperature ?? 0.2))),
    maxTokens:             Math.max(100, Math.min(4096, Number(value?.maxTokens ?? 1024))),
    task:                  String(value?.task ?? 'vqa'),
    customPrompt:          String(value?.customPrompt ?? ''),
    includeImageInContext: Boolean(value?.includeImageInContext ?? true),
    detailHigh:            Boolean(value?.detailHigh ?? false),
  };
}

export default function VisionLLMSettingsPanel({ value = {}, onChange }) {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildPayload(value), [value]);
  const activeModel = VISION_MODELS.find((m) => m.value === payload.model) ?? VISION_MODELS[0];
  const activeTask  = TASKS.find((t) => t.value === payload.task) ?? TASKS[0];

  const warnings = [];
  if (payload.task === 'custom' && !payload.customPrompt.trim()) {
    warnings.push('Custom task selected but no prompt provided.');
  }
  if (payload.detailHigh && payload.maxTokens < 800) {
    warnings.push('High-detail mode usually needs ? 800 max tokens to give a useful answer.');
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-800/50 to-amber-900/70 text-amber-200 ring-1 ring-amber-600/30">
            <Eye size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-100">Vision LLM</p>
            <p className="truncate font-mono text-[10.5px] text-slate-400">
              <span className="text-amber-400">{activeModel.label}</span>  {activeTask.label}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-amber-400">temp {payload.temperature.toFixed(2)}</span>
            <span className="font-mono text-[10px] text-slate-400">{payload.maxTokens} tok</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-400">
          Multimodal reasoner that consumes image(s) plus text. Pick a task preset or
          author a custom instruction.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-700/40 bg-amber-900/20 p-3">
        <div className="flex items-start gap-2">
          <Brain size={14} className="text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">Vision summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Model"  ok hint={activeModel.label.split(' ')[0]} Icon={Brain} />
              <StatPill label="Task"   ok hint={activeTask.label}                Icon={Eye} />
              <StatPill label="Detail" ok={payload.detailHigh} hint={payload.detailHigh ? 'high' : 'low'} Icon={Sliders} />
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Brain size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Model</h4>
        </header>
        <select value={payload.model} onChange={(e) => setField('model', e.target.value)} className={inputClass}>
          {VISION_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Temperature" />
            <input
              type="number"
              min={0}
              max={2}
              step={0.05}
              value={payload.temperature}
              onChange={(e) => setField('temperature', Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel title="Max tokens" />
            <input
              type="number"
              min={100}
              max={4096}
              step={100}
              value={payload.maxTokens}
              onChange={(e) => setField('maxTokens', Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Eye size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Task &amp; prompt</h4>
        </header>
        <div className="flex flex-wrap gap-1.5">
          {TASKS.map((t) => (
            <ToggleChip
              key={t.value}
              checked={payload.task === t.value}
              onChange={() => setField('task', t.value)}
              label={t.label}
              help={t.hint}
            />
          ))}
        </div>
        <div>
          <FieldLabel title="Custom prompt override" help="Used when task is 'Custom'; overrides task preset." />
          <textarea
            rows={3}
            value={payload.customPrompt}
            placeholder="Describe the contents of this image in detail"
            onChange={(e) => setField('customPrompt', e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip
            checked={payload.includeImageInContext}
            onChange={(v) => setField('includeImageInContext', v)}
            label="Forward image downstream"
          />
          <ToggleChip
            checked={payload.detailHigh}
            onChange={(v) => setField('detailHigh', v)}
            label="High-detail mode"
          />
        </div>
      </section>

      {warnings.length > 0 ? (
        <ul className="space-y-1">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 rounded-lg border border-amber-700/40 bg-amber-900/20 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-300">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-700/40 bg-amber-900/20 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-300">
          <CheckCircle2 size={11} /> Vision LLM configured.
        </div>
      )}

      <details className="rounded-2xl border border-slate-700/50 bg-slate-800/40/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-amber-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Zap size={11} className="text-amber-400" />
        Output: <span className="font-mono text-amber-400">answer  text</span>
      </div>
    </div>
  );
}
