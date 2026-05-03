/**
 * VisionLLMSettingsPanel — multimodal Vision LLM node.
 *
 * Processes one or more images together with a text query/prompt using a
 * vision-capable LLM (GPT-4o, Claude 3 Sonnet, Gemini Pro Vision, etc.)
 *
 * CONNECTION CONTRACT
 *   • Inputs: `images` / `documents` from Image Upload, `text` from Question.
 *   • Outputs: `answer`, `text` — consumed by Chunking / LLM / Response.
 */

import { Eye, Brain, CircleHelp } from 'lucide-react';

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

const Section = ({ icon: Icon, title, children }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
    <div className="flex items-center gap-1.5">
      <Icon size={13} className="text-violet-500 shrink-0" />
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">{title}</span>
    </div>
    {children}
  </div>
);

const VISION_MODELS = [
  { value: 'openai/gpt-4o', label: 'GPT-4o (OpenAI)' },
  { value: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo Vision (OpenAI)' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (Anthropic)' },
  { value: 'anthropic/claude-3-opus', label: 'Claude 3 Opus (Anthropic)' },
  { value: 'google/gemini-pro-vision', label: 'Gemini Pro Vision (Google)' },
  { value: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5 (Google)' },
  { value: 'meta-llama/llama-3.2-11b-vision-instruct', label: 'Llama 3.2 Vision 11B' },
];

const TASKS = [
  { value: 'vqa', label: 'Visual QA — answer questions about the image' },
  { value: 'caption', label: 'Image captioning' },
  { value: 'ocr', label: 'OCR / text extraction' },
  { value: 'chart-analysis', label: 'Chart / diagram analysis' },
  { value: 'document-parse', label: 'Document parsing (tables, forms)' },
  { value: 'custom', label: 'Custom prompt' },
];

export default function VisionLLMSettingsPanel({ value = {}, onChange }) {
  const set = (key, val) => onChange?.({ ...value, [key]: val });

  return (
    <div className="space-y-3">
      <Section icon={Brain} title="Model">
        <FieldLabel title="Vision model" help="Must support image inputs via OpenRouter" />
        <select
          value={value.model ?? 'openai/gpt-4o'}
          onChange={(e) => set('model', e.target.value)}
          className={inputClass}
        >
          {VISION_MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Temperature" />
            <input
              type="number"
              min={0}
              max={2}
              step={0.05}
              value={value.temperature ?? 0.2}
              onChange={(e) => set('temperature', Number(e.target.value))}
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
              value={value.maxTokens ?? 1024}
              onChange={(e) => set('maxTokens', Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
      </Section>

      <Section icon={Eye} title="Task & Prompt">
        <FieldLabel title="Task" help="Pre-built task preset (sets a default system prompt)" />
        <select
          value={value.task ?? 'vqa'}
          onChange={(e) => set('task', e.target.value)}
          className={inputClass}
        >
          {TASKS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <FieldLabel title="Custom prompt override" help="Overrides the task preset when filled" />
        <textarea
          rows={3}
          value={value.customPrompt ?? ''}
          placeholder="Describe the contents of this image in detail…"
          onChange={(e) => set('customPrompt', e.target.value)}
          className={inputClass}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.includeImageInContext ?? true)}
            onChange={(e) => set('includeImageInContext', e.target.checked)}
            className="h-3.5 w-3.5 accent-violet-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Include image in downstream context</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.detailHigh ?? false)}
            onChange={(e) => set('detailHigh', e.target.checked)}
            className="h-3.5 w-3.5 accent-violet-500"
          />
          <span className="text-[11px] font-bold text-slate-700">High-detail mode (more tokens)</span>
        </label>
      </Section>
    </div>
  );
}
