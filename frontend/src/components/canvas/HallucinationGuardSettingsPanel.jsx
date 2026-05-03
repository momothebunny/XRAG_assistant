/**
 * HallucinationGuardSettingsPanel — validates LLM answer against retrieved evidence.
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 15)
 *   • Inputs: `text` (LLM answer) + `chunks` (evidence).
 *   • Outputs: `answer` (possibly flagged/rejected), `grounding_score`, `passed`.
 */

import { ShieldAlert, AlertTriangle, CircleHelp } from 'lucide-react';

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

const FALLBACK_MODES = [
  { value: 'flag', label: 'Flag only — prepend grounding score to answer' },
  { value: 'reject', label: 'Reject — return an "insufficient evidence" message' },
  { value: 'abstain', label: 'Abstain — return empty answer' },
  { value: 'pass', label: 'Pass through — always forward the answer' },
];

export default function HallucinationGuardSettingsPanel({ value = {}, onChange }) {
  const set = (key, val) => onChange?.({ ...value, [key]: val });
  const score = Number(value.minGroundingScore ?? 0.75);

  return (
    <div className="space-y-3">
      <Section icon={ShieldAlert} title="Grounding Threshold">
        <FieldLabel
          title={`Min Grounding Score — ${(score * 100).toFixed(0)}%`}
          help="Minimum fraction of answer tokens that must appear in the evidence chunks"
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={score}
          onChange={(e) => set('minGroundingScore', Number(e.target.value))}
          className="w-full accent-amber-500"
        />
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>0% (any)</span>
          <span className="font-bold text-amber-600">{(score * 100).toFixed(0)}%</span>
          <span>100% (strict)</span>
        </div>
      </Section>

      <Section icon={AlertTriangle} title="Fallback Behaviour">
        <FieldLabel title="On failure" help="What to do when grounding score is below threshold" />
        <select
          value={value.fallbackMode ?? 'flag'}
          onChange={(e) => set('fallbackMode', e.target.value)}
          className={inputClass}
        >
          {FALLBACK_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        <FieldLabel title="Rejection message" help="Custom message returned when the answer is rejected" />
        <input
          type="text"
          value={value.rejectionMessage ?? 'I cannot answer this based on the available evidence.'}
          onChange={(e) => set('rejectionMessage', e.target.value)}
          className={inputClass}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.alwaysPassIfNoEvidence ?? true)}
            onChange={(e) => set('alwaysPassIfNoEvidence', e.target.checked)}
            className="h-3.5 w-3.5 accent-amber-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Pass through when no evidence chunks</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.appendScore ?? false)}
            onChange={(e) => set('appendScore', e.target.checked)}
            className="h-3.5 w-3.5 accent-amber-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Append grounding score to trace</span>
        </label>
      </Section>
    </div>
  );
}
