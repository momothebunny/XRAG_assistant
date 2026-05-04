/**
 * ModelRouterSettingsPanel — routes queries to different LLMs based on intent or load.
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 12)
 *   • Inputs: `text` / `query` from Question / System Prompt.
 *   • Outputs: `text`, `selected_model` — consumed by LLM node.
 */

import { GitBranch, Brain, CircleHelp } from 'lucide-react';

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

const STRATEGIES = [
  { value: 'intent-first', label: 'Intent-first', desc: 'Classify intent, then route to specialist model' },
  { value: 'cost-first', label: 'Cost-first', desc: 'Use cheapest capable model' },
  { value: 'quality-first', label: 'Quality-first', desc: 'Use highest quality model' },
  { value: 'latency-first', label: 'Latency-first', desc: 'Use fastest responding model' },
  { value: 'round-robin', label: 'Round-robin', desc: 'Distribute load across models' },
];

export default function ModelRouterSettingsPanel({ value = {}, onChange }) {
  const set = (key, val) => onChange?.({ ...value, [key]: val });

  return (
    <div className="space-y-3">
      <Section icon={GitBranch} title="Routing Strategy">
        <FieldLabel title="Strategy" />
        <select
          value={value.strategy ?? 'intent-first'}
          onChange={(e) => set('strategy', e.target.value)}
          className={inputClass}
        >
          {STRATEGIES.map((s) => (
            <option key={s.value} value={s.value}>{s.label} — {s.desc}</option>
          ))}
        </select>
      </Section>

      <Section icon={Brain} title="Model Pool">
        <FieldLabel title="Fallback model" help="Used when no rule matches or all primary models are unavailable" />
        <input
          type="text"
          value={value.fallbackModel ?? 'openai/gpt-4o-mini'}
          onChange={(e) => set('fallbackModel', e.target.value)}
          className={inputClass}
        />

        <FieldLabel title="Simple queries model" help="Fast/cheap model for short, factual queries" />
        <input
          type="text"
          value={value.simpleModel ?? 'openai/gpt-4o-mini'}
          onChange={(e) => set('simpleModel', e.target.value)}
          className={inputClass}
        />

        <FieldLabel title="Complex queries model" help="High-capability model for multi-step reasoning" />
        <input
          type="text"
          value={value.complexModel ?? 'openai/gpt-4o'}
          onChange={(e) => set('complexModel', e.target.value)}
          className={inputClass}
        />

        <FieldLabel title="Code queries model" help="Code-specialist model (optional)" />
        <input
          type="text"
          value={value.codeModel ?? ''}
          placeholder="e.g. anthropic/claude-3.5-sonnet"
          onChange={(e) => set('codeModel', e.target.value)}
          className={inputClass}
        />

        <FieldLabel title="Max query length (simple threshold)" help="Queries shorter than this go to the simple model" />
        <input
          type="number"
          min={10}
          max={2000}
          value={value.simpleQueryMaxLength ?? 120}
          onChange={(e) => set('simpleQueryMaxLength', Number(e.target.value))}
          className={inputClass}
        />
      </Section>
    </div>
  );
}
