/**
 * GuardrailsSettingsPanel — rose-themed policy filter for LLM input/output.
 *
 * Backend contract (`brain-guardrails` in
 * `backend/app/canvas/nodes.py::_exec_guardrails`):
 *   { checkJailbreak, checkPromptInjection, checkToxicity,
 *     checkOutputPII, checkOutputToxicity, checkOutputRelevance,
 *     violationAction, rejectionMessage }
 *
 * Inputs: `text`. Outputs: `text`, `passed`. Backend currently returns a
 * permissive stub — the configured policy keys travel with the node so a
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
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</label>
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
        ? 'border-rose-300 bg-rose-50 text-rose-800 shadow-sm shadow-rose-200/40'
        : 'border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-700'
    }`}
  >
    <span aria-hidden className={`inline-block h-2 w-2 rounded-full transition ${checked ? 'bg-rose-500' : 'bg-slate-300'}`} />
    {label}
  </button>
);

function StatPill({ label, hint, ok = true, Icon }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-[10px] ${ok ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-500'}`}>
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
  if (totalOn === 0) warnings.push('No checks enabled — guardrails will pass everything.');
  if (payload.violationAction === 'block' && !payload.rejectionMessage.trim()) {
    warnings.push('Rejection message is empty for block action.');
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-300 via-rose-400 to-pink-300" />
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-50 to-pink-50 text-rose-600 ring-1 ring-rose-200/60">
            <Shield size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800">Guardrails</p>
            <p className="truncate font-mono text-[10.5px] text-slate-500">
              <span className="text-rose-700">{totalOn}</span>/{INPUT_CHECKS.length + OUTPUT_CHECKS.length} checks · {payload.violationAction}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-rose-700">policy</span>
            <span className="font-mono text-[10px] text-slate-500">in {inputOn} · out {outputOn}</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-500">
          Policy filter for both <span className="font-semibold text-slate-700">inputs</span> and{' '}
          <span className="font-semibold text-slate-700">outputs</span>. Choose what to detect and
          how to react when a violation fires.
        </p>
      </div>

      <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-3">
        <div className="flex items-start gap-2">
          <Filter size={14} className="text-rose-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-800">Policy summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Input checks"  ok={inputOn > 0}  hint={`${inputOn}/${INPUT_CHECKS.length}`}   Icon={Shield} />
              <StatPill label="Output checks" ok={outputOn > 0} hint={`${outputOn}/${OUTPUT_CHECKS.length}`} Icon={Eye} />
              <StatPill label="Action"        ok                hint={payload.violationAction}               Icon={AlertOctagon} />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-rose-900/80">
              Inputs: <span className="font-mono font-semibold">text</span> → outputs{' '}
              <span className="font-mono font-semibold">text</span> +{' '}
              <span className="font-mono font-semibold">passed</span>.
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Shield size={12} className="text-rose-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Input checks</h4>
          <span className="ml-auto rounded-full bg-rose-100 px-1.5 py-px text-[9px] font-bold text-rose-700">{inputOn} on</span>
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

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Eye size={12} className="text-rose-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Output checks</h4>
          <span className="ml-auto rounded-full bg-rose-100 px-1.5 py-px text-[9px] font-bold text-rose-700">{outputOn} on</span>
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

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <AlertOctagon size={12} className="text-rose-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Violation action</h4>
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
            <li key={w} className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-800">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-rose-800">
          <CheckCircle2 size={11} /> Policy configuration valid.
        </div>
      )}

      <details className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-rose-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-rose-400" />
        Output: <span className="font-mono text-rose-700">text + passed</span>
      </div>
    </div>
  );
}
