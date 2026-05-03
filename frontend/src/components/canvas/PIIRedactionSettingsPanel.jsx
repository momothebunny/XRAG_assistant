/**
 * PIIRedactionSettingsPanel — masks sensitive personal data in chunks before LLM.
 *
 * CONNECTION CONTRACT (CANONICAL_PIPELINE_RANK = 11)
 *   • Inputs: `chunks` from Reranker / Context Compression.
 *   • Outputs: `chunks` with PII replaced by placeholders.
 */

import { ShieldCheck, EyeOff, CircleHelp } from 'lucide-react';

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

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-400';

export default function PIIRedactionSettingsPanel({ value = {}, onChange }) {
  const set = (key, val) => onChange?.({ ...value, [key]: val });

  return (
    <div className="space-y-3">
      <Section icon={ShieldCheck} title="Entities to Redact">
        <ToggleRow
          checked={value.redactEmails ?? true}
          onChange={(v) => set('redactEmails', v)}
          title="Email addresses"
          help="Replaces with [EMAIL]"
        />
        <ToggleRow
          checked={value.redactPhones ?? true}
          onChange={(v) => set('redactPhones', v)}
          title="Phone numbers"
          help="Replaces with [PHONE]"
        />
        <ToggleRow
          checked={value.redactIds ?? true}
          onChange={(v) => set('redactIds', v)}
          title="ID numbers (SSN, passport, national ID)"
          help="Replaces with [ID]"
        />
        <ToggleRow
          checked={value.redactCreditCards ?? false}
          onChange={(v) => set('redactCreditCards', v)}
          title="Credit / debit card numbers"
          help="Replaces with [CARD]"
        />
        <ToggleRow
          checked={value.redactIpAddresses ?? false}
          onChange={(v) => set('redactIpAddresses', v)}
          title="IP addresses"
          help="Replaces with [IP]"
        />
        <ToggleRow
          checked={value.redactPersonNames ?? false}
          onChange={(v) => set('redactPersonNames', v)}
          title="Person names (NER)"
          help="Uses named entity recognition — may have false positives"
        />
      </Section>

      <Section icon={EyeOff} title="Redaction Options">
        <FieldLabel title="Replacement placeholder" help="Token used to replace detected PII (e.g. [REDACTED])" />
        <input
          type="text"
          value={value.placeholder ?? ''}
          placeholder="Leave blank to use entity-type tokens"
          onChange={(e) => set('placeholder', e.target.value)}
          className={inputClass}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.preserveFormatting ?? true)}
            onChange={(e) => set('preserveFormatting', e.target.checked)}
            className="h-3.5 w-3.5 accent-amber-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Preserve spacing and formatting</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value.auditLog ?? false)}
            onChange={(e) => set('auditLog', e.target.checked)}
            className="h-3.5 w-3.5 accent-amber-500"
          />
          <span className="text-[11px] font-bold text-slate-700">Log redaction count to trace</span>
        </label>
      </Section>
    </div>
  );
}
