/**
 * ReflectionLoopSettingsPanel — iterative self-critique to improve the answer.
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 16)
 *   • Inputs: `text` / `answer` from LLM (or Hallucination Guard).
 *   • Outputs: `answer` (refined), `iterations`.
 */

import { Repeat, Sparkles, CircleHelp } from 'lucide-react';

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-400';

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
      <Icon size={13} className="text-amber-500 shrink-0" />
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">{title}</span>
    </div>
    {children}
  </div>
);

export default function ReflectionLoopSettingsPanel({ value = {}, onChange }) {
  const set = (key, val) => onChange?.({ ...value, [key]: val });

  return (
    <div className="space-y-3">
      <Section icon={Repeat} title="Loop Settings">
        <FieldLabel title="Max Reflections" help="Maximum number of critique-and-revise iterations (1–5)" />
        <input
          type="number"
          min={1}
          max={5}
          value={value.maxReflections ?? 2}
          onChange={(e) => set('maxReflections', Number(e.target.value))}
          className={inputClass}
        />

        <FieldLabel title="Stop Condition" help="When to stop reflecting early" />
        <select
          value={value.stopCondition ?? 'max-iters'}
          onChange={(e) => set('stopCondition', e.target.value)}
          className={inputClass}
        >
          <option value="max-iters">Always run max iterations</option>
          <option value="score-threshold">Stop when quality score ≥ threshold</option>
          <option value="no-change">Stop when answer stops changing</option>
        </select>

        <FieldLabel title="Quality Threshold (score-threshold mode)" help="0–1 score above which to stop early" />
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={value.qualityThreshold ?? 0.85}
          onChange={(e) => set('qualityThreshold', Number(e.target.value))}
          className={inputClass}
        />
      </Section>

      <Section icon={Sparkles} title="Critique Prompt">
        <FieldLabel title="Critique instruction" help="System prompt injected for the critique step" />
        <textarea
          rows={4}
          value={value.critiquePrompt ?? 'Critique the following answer. Identify factual errors, missing citations, or logical inconsistencies. Then produce an improved version.'}
          onChange={(e) => set('critiquePrompt', e.target.value)}
          className={inputClass}
        />

        <FieldLabel title="Critique model" help="Model used for self-reflection (can differ from generation model)" />
        <input
          type="text"
          value={value.critiqueModel ?? 'openai/gpt-4o-mini'}
          onChange={(e) => set('critiqueModel', e.target.value)}
          className={inputClass}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.appendIterationTrace ?? false)}
            onChange={(e) => set('appendIterationTrace', e.target.checked)}
            className="h-3.5 w-3.5 accent-amber-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Append all iterations to trace</span>
        </label>
      </Section>
    </div>
  );
}
