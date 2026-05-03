/**
 * QueryRewriterSettingsPanel — expands / reformulates the user query before retrieval.
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 6)
 *   • Inputs: `text` / `query` from Question node.
 *   • Outputs: `text`, `query` (rewritten) consumed by Retriever / HyDE.
 */

import { Pencil, Sparkles, CircleHelp } from 'lucide-react';

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
  { value: 'intent-aware', label: 'Intent-aware', desc: 'Detects query intent and reformulates' },
  { value: 'multi-query', label: 'Multi-query', desc: 'Generates N parallel query variants' },
  { value: 'step-back', label: 'Step-back', desc: 'Abstracts to broader concept' },
  { value: 'decompose', label: 'Decompose', desc: 'Splits complex query into sub-questions' },
  { value: 'expansion', label: 'Term expansion', desc: 'Adds synonym / related terms' },
];

export default function QueryRewriterSettingsPanel({ value = {}, onChange }) {
  const set = (key, val) => onChange?.({ ...value, [key]: val });

  return (
    <div className="space-y-3">
      <Section icon={Pencil} title="Rewrite Strategy">
        <FieldLabel title="Strategy" help="How the query will be reformulated" />
        <select
          value={value.strategy ?? 'intent-aware'}
          onChange={(e) => set('strategy', e.target.value)}
          className={inputClass}
        >
          {STRATEGIES.map((s) => (
            <option key={s.value} value={s.value}>{s.label} — {s.desc}</option>
          ))}
        </select>

        <FieldLabel title="Expansion Terms" help="Number of synonym/related terms to add (for expansion strategy)" />
        <input
          type="number"
          min={0}
          max={10}
          value={value.expansionTerms ?? 3}
          onChange={(e) => set('expansionTerms', Number(e.target.value))}
          className={inputClass}
        />

        <FieldLabel title="Variants (multi-query)" help="How many parallel query variants to generate" />
        <input
          type="number"
          min={1}
          max={10}
          value={value.variants ?? 3}
          onChange={(e) => set('variants', Number(e.target.value))}
          className={inputClass}
        />
      </Section>

      <Section icon={Sparkles} title="LLM Options">
        <FieldLabel title="Model (for LLM-based rewriting)" help="OpenRouter model used to reformulate the query" />
        <input
          type="text"
          value={value.model ?? 'openai/gpt-4o-mini'}
          onChange={(e) => set('model', e.target.value)}
          className={inputClass}
        />

        <FieldLabel title="Temperature" />
        <input
          type="number"
          min={0}
          max={2}
          step={0.05}
          value={value.temperature ?? 0.3}
          onChange={(e) => set('temperature', Number(e.target.value))}
          className={inputClass}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.preserveOriginal ?? true)}
            onChange={(e) => set('preserveOriginal', e.target.checked)}
            className="h-3.5 w-3.5 accent-amber-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Include original query in output</span>
        </label>
      </Section>
    </div>
  );
}
