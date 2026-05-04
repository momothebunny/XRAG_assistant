/**
 * HyDEGenSettingsPanel — HyDE (Hypothetical Document Embeddings) generator.
 *
 * Generates N hypothetical documents from the query, then embeds them to
 * get a richer query representation for dense retrieval.
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 6)
 *   • Inputs: `text` / `query` from Question / Query Rewriter.
 *   • Outputs: `text`, `query` (combined hypothetical docs), `hypotheses`.
 */

import { Brain, FileText, CircleHelp } from 'lucide-react';

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

export default function HyDEGenSettingsPanel({ value = {}, onChange }) {
  const set = (key, val) => onChange?.({ ...value, [key]: val });

  return (
    <div className="space-y-3">
      <Section icon={FileText} title="Hypothetical Document Generation">
        <FieldLabel title="Hypotheses per query" help="Number of hypothetical documents to generate (1–10)" />
        <input
          type="number"
          min={1}
          max={10}
          value={value.hypothesesPerQuery ?? 3}
          onChange={(e) => set('hypothesesPerQuery', Number(e.target.value))}
          className={inputClass}
        />

        <FieldLabel title="HyDE instruction" help="Prompt instructing the model to generate a hypothetical answer" />
        <textarea
          rows={3}
          value={value.hydeInstruction ?? 'Write a concise passage that would answer the following question:'}
          onChange={(e) => set('hydeInstruction', e.target.value)}
          className={inputClass}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.prependOriginalQuery ?? true)}
            onChange={(e) => set('prependOriginalQuery', e.target.checked)}
            className="h-3.5 w-3.5 accent-amber-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Prepend original query to output</span>
        </label>
      </Section>

      <Section icon={Brain} title="Generation Model">
        <FieldLabel title="Model" help="OpenRouter model used to generate hypothetical documents" />
        <input
          type="text"
          value={value.model ?? 'openai/gpt-4o-mini'}
          onChange={(e) => set('model', e.target.value)}
          className={inputClass}
        />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Max tokens" />
            <input
              type="number"
              min={50}
              max={2000}
              value={value.maxTokens ?? 256}
              onChange={(e) => set('maxTokens', Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel title="Temperature" />
            <input
              type="number"
              min={0}
              max={2}
              step={0.05}
              value={value.temperature ?? 0.7}
              onChange={(e) => set('temperature', Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
      </Section>
    </div>
  );
}
