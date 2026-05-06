/**
 * HallucinationGuardSettingsPanel  rose-themed safety inspector.
 *
 * Backend contract (`process-hallucination-guard` in
 * `backend/app/canvas/nodes.py::_exec_hallucination_guard`):
 *   { minGroundingScore, fallbackMode, rejectionMessage,
 *     alwaysPassIfNoEvidence, appendScore }
 *
 * Inputs: `text` + `chunks`. Outputs: `answer`, `grounding_score`, `passed`,
 * `unsupported_terms`. The guard never mutates the answer text  it surfaces
 * a structured score so downstream nodes (Reflection Loop, Output) can act.
 */

import { useMemo } from 'react';
import SliderRow from './SliderRow';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Eye,
  Gauge,
  Shield,
  ShieldAlert,
  Zap,
} from 'lucide-react';

const FALLBACK_MODES = [
  { value: 'flag',    label: 'Flag',    hint: 'Prepend score, forward answer' },
  { value: 'reject',  label: 'Reject',  hint: 'Return rejection message' },
  { value: 'abstain', label: 'Abstain', hint: 'Return empty answer' },
  { value: 'pass',    label: 'Pass',    hint: 'Always forward unchanged' },
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
    minGroundingScore:      Number(value?.minGroundingScore ?? 0.75),
    fallbackMode:           String(value?.fallbackMode ?? 'flag'),
    rejectionMessage:       String(value?.rejectionMessage ?? 'I cannot answer this based on the available evidence.'),
    alwaysPassIfNoEvidence: Boolean(value?.alwaysPassIfNoEvidence ?? true),
    appendScore:            Boolean(value?.appendScore ?? false),
  };
}

export default function HallucinationGuardSettingsPanel({ value = {}, onChange }) {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildPayload(value), [value]);
  const scorePct = (payload.minGroundingScore * 100).toFixed(0);

  const warnings = [];
  if (payload.minGroundingScore < 0.4) warnings.push('Threshold is very lenient  most answers will pass.');
  if (payload.minGroundingScore > 0.95) warnings.push('Threshold is extremely strict  even good answers may be rejected.');
  if (payload.fallbackMode === 'reject' && !payload.rejectionMessage.trim()) warnings.push('Rejection message is empty.');

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-800/50 to-rose-900/70 text-rose-200 ring-1 ring-rose-600/30">
            <ShieldAlert size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-100">Hallucination Guard</p>
            <p className="truncate font-mono text-[10.5px] text-slate-400">
              min score <span className="text-rose-400">{scorePct}%</span>  {payload.fallbackMode}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-rose-400">grounding</span>
            <span className="font-mono text-[10px] text-slate-400">
              {payload.alwaysPassIfNoEvidence ? 'open if empty' : 'strict'}
            </span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-400">
          Scores answer tokens against retrieved evidence. Surfaces a{' '}
          <span className="font-semibold text-slate-200">grounding_score</span> instead of mutating
          text  downstream nodes decide what to do.
        </p>
      </div>

      <div className="rounded-2xl border border-rose-700/40 bg-rose-900/20 p-3">
        <div className="flex items-start gap-2">
          <Shield size={14} className="text-rose-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-300">Guard summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Threshold" ok hint={`${scorePct}%`} Icon={Gauge} />
              <StatPill label="Fallback"  ok hint={payload.fallbackMode} Icon={AlertTriangle} />
              <StatPill label="No-evidence" ok={payload.alwaysPassIfNoEvidence} hint={payload.alwaysPassIfNoEvidence ? 'pass' : 'block'} Icon={Eye} />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-rose-900/80">
              Inputs: <span className="font-mono font-semibold">text</span> +{' '}
              <span className="font-mono font-semibold">chunks</span>  outputs{' '}
              <span className="font-mono font-semibold">grounding_score</span>,{' '}
              <span className="font-mono font-semibold">passed</span>.
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Gauge size={12} className="text-rose-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Grounding threshold</h4>
          <span className="ml-auto rounded-full bg-rose-900/40 px-1.5 py-px text-[9px] font-bold text-rose-400">{scorePct}%</span>
        </header>
        <SliderRow
          label="Min grounding score"
          value={payload.minGroundingScore}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => setField('minGroundingScore', v)}
          format={(v) => v.toFixed(2)}
          accentColor="#f43f5e"
          minLabel="any (0%)"
          maxLabel="strict (100%)"
        />
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <AlertTriangle size={12} className="text-rose-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Fallback behaviour</h4>
        </header>
        <div className="flex flex-wrap gap-1.5">
          {FALLBACK_MODES.map((m) => (
            <ToggleChip
              key={m.value}
              checked={payload.fallbackMode === m.value}
              onChange={() => setField('fallbackMode', m.value)}
              label={m.label}
              help={m.hint}
            />
          ))}
        </div>
        <div>
          <FieldLabel title="Rejection message" help="Returned when fallback is reject." />
          <input
            type="text"
            value={value.rejectionMessage ?? 'I cannot answer this based on the available evidence.'}
            onChange={(e) => setField('rejectionMessage', e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <ToggleChip
            checked={payload.alwaysPassIfNoEvidence}
            onChange={(v) => setField('alwaysPassIfNoEvidence', v)}
            label="Pass when no evidence"
            help="Forward the answer if there are zero retrieved chunks."
          />
          <ToggleChip
            checked={payload.appendScore}
            onChange={(v) => setField('appendScore', v)}
            label="Append score to trace"
            help="Include grounding_score in the trace payload."
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
          <CheckCircle2 size={11} /> Guard configuration valid.
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
        Output: <span className="font-mono text-rose-400">answer + grounding_score</span>
      </div>
    </div>
  );
}
