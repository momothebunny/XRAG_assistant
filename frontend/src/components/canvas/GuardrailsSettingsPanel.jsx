/**
 * GuardrailsSettingsPanel — policy enforcement layer for LLM inputs and outputs.
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 14)
 *   • Inputs: `text` from LLM.
 *   • Outputs: `text`, `passed` (bool).
 */

import { Shield, AlertOctagon, CircleHelp } from 'lucide-react';

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

const ToggleRow = ({ checked, onChange, title, help }) => (
  <label
    className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition ${
      checked ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
    }`}
  >
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(e) => onChange?.(e.target.checked)}
      className="mt-0.5 h-3.5 w-3.5 accent-amber-500"
    />
    <span className="min-w-0">
      <span className="block text-[11.5px] font-bold text-slate-700">{title}</span>
      {help && <span className="mt-0.5 block text-[10.5px] leading-snug text-slate-500">{help}</span>}
    </span>
  </label>
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

export default function GuardrailsSettingsPanel({ value = {}, onChange }) {
  const set = (key, val) => onChange?.({ ...value, [key]: val });

  return (
    <div className="space-y-3">
      <Section icon={Shield} title="Input Checks">
        <ToggleRow
          checked={value.checkJailbreak ?? true}
          onChange={(v) => set('checkJailbreak', v)}
          title="Jailbreak detection"
          help="Reject prompts attempting to override system instructions"
        />
        <ToggleRow
          checked={value.checkPromptInjection ?? true}
          onChange={(v) => set('checkPromptInjection', v)}
          title="Prompt injection detection"
          help="Block injected instructions inside retrieved documents"
        />
        <ToggleRow
          checked={value.checkToxicity ?? false}
          onChange={(v) => set('checkToxicity', v)}
          title="Toxicity / hate speech check"
          help="Flag or reject toxic input queries"
        />
      </Section>

      <Section icon={AlertOctagon} title="Output Checks">
        <ToggleRow
          checked={value.checkOutputPII ?? false}
          onChange={(v) => set('checkOutputPII', v)}
          title="PII in output"
          help="Redact PII from the generated answer"
        />
        <ToggleRow
          checked={value.checkOutputToxicity ?? false}
          onChange={(v) => set('checkOutputToxicity', v)}
          title="Toxic output"
          help="Reject answers containing hate speech / profanity"
        />
        <ToggleRow
          checked={value.checkOutputRelevance ?? false}
          onChange={(v) => set('checkOutputRelevance', v)}
          title="Off-topic output"
          help="Flag answers that are not relevant to the original query"
        />
      </Section>

      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <FieldLabel title="Violation action" help="What to do when a violation is detected" />
        <select
          value={value.violationAction ?? 'flag'}
          onChange={(e) => set('violationAction', e.target.value)}
          className={inputClass}
        >
          <option value="flag">Flag — add violation note to trace</option>
          <option value="block">Block — return a rejection message</option>
          <option value="redact">Redact — strip violating content</option>
        </select>

        <FieldLabel title="Rejection message" />
        <input
          type="text"
          value={value.rejectionMessage ?? 'This request cannot be processed due to policy restrictions.'}
          onChange={(e) => set('rejectionMessage', e.target.value)}
          className={inputClass}
        />
      </div>
    </div>
  );
}
