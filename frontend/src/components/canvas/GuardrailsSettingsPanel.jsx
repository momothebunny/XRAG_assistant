/**
 * GuardrailsSettingsPanel  rose-themed policy filter for LLM input/output.
 *
 * Backend contract (`brain-guardrails` in
 * `backend/app/canvas/nodes.py::_exec_guardrails`):
 *   { checkJailbreak, checkPromptInjection, checkToxicity,
 *     checkOutputPII, checkOutputToxicity, checkOutputRelevance,
 *     violationAction, rejectionMessage }
 *
 * Inputs: `text`. Outputs: `text`, `passed`. Backend currently returns a
 * permissive stub  the configured policy keys travel with the node so a
 * real provider (e.g. NeMo Guardrails, Llama Guard) can be wired without a
 * frontend change.
 */

import { useMemo } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Eye,
  Filter,
  Shield,
  Zap,
} from 'lucide-react';

const INPUT_CHECKS = [
  { id: 'checkJailbreak',       label: 'Jailbreak',        hint: 'Override-style prompts' },
  { id: 'checkPromptInjection', label: 'Prompt injection', hint: 'Hidden instructions in docs' },
  { id: 'checkToxicity',        label: 'Toxicity',         hint: 'Hate / abuse on input' },
];

const OUTPUT_CHECKS = [
  { id: 'checkOutputPII',       label: 'Output PII',       hint: 'Mask PII before reply' },
  { id: 'checkOutputToxicity',  label: 'Output toxicity',  hint: 'Reject toxic answers' },
  { id: 'checkOutputRelevance', label: 'Off-topic output', hint: 'Flag unrelated answers' },
];

const ACTIONS = [
  { value: 'flag',   label: 'Flag',   hint: 'Add violation note to trace' },
  { value: 'block',  label: 'Block',  hint: 'Return rejection message' },
  { value: 'redact', label: 'Redact', hint: 'Strip violating content' },
];

const inputClass =
  'w-full rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-rose-500">
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
        ? 'border-rose-300 bg-rose-900/20 text-rose-300 shadow-sm shadow-rose-200/40'
        : 'border-slate-700/50 bg-[#0d1117] text-slate-400 hover:border-rose-700/40 hover:text-rose-400'
    }`}
  >
    <span aria-hidden className={`inline-block h-2 w-2 rounded-full transition ${checked ? 'bg-rose-500' : 'bg-slate-300'}`} />
    {label}
  </button>
);

function StatPill({ label, hint, ok = true, Icon }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-[10px] ${ok ? 'border-rose-700/40 bg-rose-900/20 text-rose-300' : 'border-slate-700/50 bg-[#0d1117] text-slate-400'}`}>
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
    checkJailbreak:       Boolean(value?.checkJailbreak ?? true),
    checkPromptInjection: Boolean(value?.checkPromptInjection ?? true),
    checkToxicity:        Boolean(value?.checkToxicity ?? false),
    checkOutputPII:       Boolean(value?.checkOutputPII ?? false),
    checkOutputToxicity:  Boolean(value?.checkOutputToxicity ?? false),
    checkOutputRelevance: Boolean(value?.checkOutputRelevance ?? false),
    violationAction:      String(value?.violationAction ?? 'flag'),
    rejectionMessage:     String(value?.rejectionMessage ?? 'This request cannot be processed due to policy restrictions.'),
  };
}

export default function GuardrailsSettingsPanel({ value = {}, onChange }) {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildPayload(value), [value]);

  const inputOn  = INPUT_CHECKS.filter((c) => payload[c.id]).length;
  const outputOn = OUTPUT_CHECKS.filter((c) => payload[c.id]).length;
  const totalOn  = inputOn + outputOn;

  const warnings = [];
  if (totalOn === 0) warnings.push('No checks enabled  guardrails will pass everything.');
  if (payload.violationAction === 'block' && !payload.rejectionMessage.trim()) {
    warnings.push('Rejection message is empty for block action.');
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-800/50 to-rose-900/70 text-rose-200 ring-1 ring-rose-600/30">
            <Shield size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-100">Guardrails</p>
            <p className="truncate font-mono text-[10.5px] text-slate-400">
              <span className="text-rose-400">{totalOn}</span>/{INPUT_CHECKS.length + OUTPUT_CHECKS.length} checks  {payload.violationAction}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-rose-400">policy</span>
            <span className="font-mono text-[10px] text-slate-400">in {inputOn}  out {outputOn}</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-400">
          Policy filter for both <span className="font-semibold text-slate-200">inputs</span> and{' '}
          <span className="font-semibold text-slate-200">outputs</span>. Choose what to detect and
          how to react when a violation fires.
        </p>
      </div>

      <div className="rounded-2xl border border-rose-700/40 bg-rose-900/20 p-3">
        <div className="flex items-start gap-2">
          <Filter size={14} className="text-rose-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-300">Policy summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Input checks"  ok={inputOn > 0}  hint={`${inputOn}/${INPUT_CHECKS.length}`}   Icon={Shield} />
              <StatPill label="Output checks" ok={outputOn > 0} hint={`${outputOn}/${OUTPUT_CHECKS.length}`} Icon={Eye} />
              <StatPill label="Action"        ok                hint={payload.violationAction}               Icon={AlertOctagon} />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-rose-900/80">
              Inputs: <span className="font-mono font-semibold">text</span>  outputs{' '}
              <span className="font-mono font-semibold">text</span> +{' '}
              <span className="font-mono font-semibold">passed</span>.
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Shield size={12} className="text-rose-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Input checks</h4>
          <span className="ml-auto rounded-full bg-rose-900/40 px-1.5 py-px text-[9px] font-bold text-rose-400">{inputOn} on</span>
        </header>
        <div className="flex flex-wrap gap-1.5">
          {INPUT_CHECKS.map((c) => (
            <ToggleChip
              key={c.id}
              checked={payload[c.id]}
              onChange={(v) => setField(c.id, v)}
              label={c.label}
              help={c.hint}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Eye size={12} className="text-rose-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Output checks</h4>
          <span className="ml-auto rounded-full bg-rose-900/40 px-1.5 py-px text-[9px] font-bold text-rose-400">{outputOn} on</span>
        </header>
        <div className="flex flex-wrap gap-1.5">
          {OUTPUT_CHECKS.map((c) => (
            <ToggleChip
              key={c.id}
              checked={payload[c.id]}
              onChange={(v) => setField(c.id, v)}
              label={c.label}
              help={c.hint}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <AlertOctagon size={12} className="text-rose-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Violation action</h4>
        </header>
        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map((a) => (
            <ToggleChip
              key={a.value}
              checked={payload.violationAction === a.value}
              onChange={() => setField('violationAction', a.value)}
              label={a.label}
              help={a.hint}
            />
          ))}
        </div>
        <div>
          <FieldLabel title="Rejection message" help="Used when action is block." />
          <input
            type="text"
            value={value.rejectionMessage ?? 'This request cannot be processed due to policy restrictions.'}
            onChange={(e) => setField('rejectionMessage', e.target.value)}
            className={inputClass}
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
        <div className="flex items-center gap-1.5 rounded-lg border border-rose-700/40 bg-rose-900/20 px-2.5 py-1.5 text-[10.5px] font-semibold text-rose-300">
          <CheckCircle2 size={11} /> Policy configuration valid.
        </div>
      )}

      <details className="rounded-2xl border border-slate-700/50 bg-slate-800/40/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-rose-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Zap size={11} className="text-rose-400" />
        Output: <span className="font-mono text-rose-400">text + passed</span>
      </div>
    </div>
  );
}
