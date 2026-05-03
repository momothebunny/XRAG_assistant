/**
 * ContextCompressionSettingsPanel — trims the retrieved context to fit the LLM window.
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 10)
 *   • Inputs: `chunks` from Retriever / Reranker.
 *   • Outputs: `chunks` (subset), consumed by LLM.
 */

import { Scissors, FileText, CircleHelp } from 'lucide-react';

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
  { value: 'token-budget', label: 'Token budget', desc: 'Keep chunks until token limit' },
  { value: 'extractive', label: 'Extractive', desc: 'Extract most relevant sentences' },
  { value: 'llm-compress', label: 'LLM compress', desc: 'Use LLM to summarise each chunk' },
  { value: 'top-k', label: 'Top-k', desc: 'Keep only the top-k chunks by score' },
];

export default function ContextCompressionSettingsPanel({ value = {}, onChange }) {
  const set = (key, val) => onChange?.({ ...value, [key]: val });

  return (
    <div className="space-y-3">
      <Section icon={Scissors} title="Compression Strategy">
        <FieldLabel title="Strategy" help="How the context will be compressed" />
        <select
          value={value.strategy ?? 'token-budget'}
          onChange={(e) => set('strategy', e.target.value)}
          className={inputClass}
        >
          {STRATEGIES.map((s) => (
            <option key={s.value} value={s.value}>{s.label} — {s.desc}</option>
          ))}
        </select>
      </Section>

      <Section icon={FileText} title="Budget & Limits">
        <FieldLabel title="Max Tokens" help="Hard token cap for the combined context passed to the LLM" />
        <input
          type="number"
          min={100}
          max={128000}
          step={100}
          value={value.maxTokens ?? 2200}
          onChange={(e) => set('maxTokens', Number(e.target.value))}
          className={inputClass}
        />

        <FieldLabel title="Top-k (top-k strategy)" help="Keep only this many chunks after scoring" />
        <input
          type="number"
          min={1}
          max={50}
          value={value.topK ?? 5}
          onChange={(e) => set('topK', Number(e.target.value))}
          className={inputClass}
        />

        <FieldLabel title="Max chars per chunk" help="Truncate individual chunks to this length before passing on" />
        <input
          type="number"
          min={50}
          max={10000}
          step={50}
          value={value.maxCharsPerChunk ?? 1000}
          onChange={(e) => set('maxCharsPerChunk', Number(e.target.value))}
          className={inputClass}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.keepCitations ?? true)}
            onChange={(e) => set('keepCitations', e.target.checked)}
            className="h-3.5 w-3.5 accent-amber-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Preserve citation markers</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.keepScores ?? true)}
            onChange={(e) => set('keepScores', e.target.checked)}
            className="h-3.5 w-3.5 accent-amber-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Preserve relevance scores</span>
        </label>
      </Section>
    </div>
  );
}
