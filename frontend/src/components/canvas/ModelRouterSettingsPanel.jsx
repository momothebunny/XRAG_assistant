/**
 * ModelRouterSettingsPanel  amber-themed intent router for LLM selection.
 *
 * Backend contract (`process-model-router` in `nodes.py::_exec_model_router`):
 *   { strategy, fallbackModel, simpleModel, complexModel, codeModel,
 *     simpleQueryMaxLength }
 * Inputs: text/query. Outputs: text, selected_model.
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  CircleHelp,
  GitBranch,
  Sliders,
  Zap,
} from 'lucide-react';

const STRATEGIES = [
  { value: 'intent-first',  label: 'Intent',  hint: 'Classify intent, route to specialist' },
  { value: 'cost-first',    label: 'Cost',    hint: 'Cheapest capable model' },
  { value: 'quality-first', label: 'Quality', hint: 'Highest quality model' },
  { value: 'latency-first', label: 'Latency', hint: 'Fastest responding model' },
  { value: 'round-robin',   label: 'RR',      hint: 'Distribute load across models' },
];

const inputClass =
  'w-full rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-amber-600/60 focus:ring-2 focus:ring-amber-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-amber-500">
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
        ? 'border-amber-600/60 bg-amber-900/20 text-amber-300 shadow-sm shadow-amber-200/40'
        : 'border-slate-700/50 bg-[#0d1117] text-slate-400 hover:border-amber-700/40 hover:text-amber-400'
    }`}
  >
    <span aria-hidden className={`inline-block h-2 w-2 rounded-full transition ${checked ? 'bg-amber-500' : 'bg-slate-300'}`} />
    {label}
  </button>
);

function StatPill({ label, hint, ok = true, Icon }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-[10px] ${ok ? 'border-amber-700/40 bg-amber-900/20 text-amber-300' : 'border-slate-700/50 bg-[#0d1117] text-slate-400'}`}>
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
    strategy:             String(value?.strategy ?? 'intent-first'),
    fallbackModel:        String(value?.fallbackModel ?? 'openai/gpt-4o-mini'),
    simpleModel:          String(value?.simpleModel ?? 'openai/gpt-4o-mini'),
    complexModel:         String(value?.complexModel ?? 'openai/gpt-4o'),
    codeModel:            String(value?.codeModel ?? ''),
    simpleQueryMaxLength: Math.max(10, Math.min(2000, Number(value?.simpleQueryMaxLength ?? 120))),
  };
}

export default function ModelRouterSettingsPanel({ value = {}, onChange }) {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildPayload(value), [value]);
  const activeStrategy = STRATEGIES.find((s) => s.value === payload.strategy) ?? STRATEGIES[0];

  const warnings = [];
  if (payload.fallbackModel === payload.simpleModel && payload.fallbackModel === payload.complexModel) {
    warnings.push('Simple, complex and fallback all point to the same model  routing has no effect.');
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-800/50 to-amber-900/70 text-amber-200 ring-1 ring-amber-600/30">
            <GitBranch size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-100">Model Router</p>
            <p className="truncate font-mono text-[10.5px] text-slate-400">
              <span className="text-amber-400">{activeStrategy.label}</span>  {payload.complexModel.split('/').pop()}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-amber-400">router</span>
            <span className="font-mono text-[10px] text-slate-400">{payload.simpleQueryMaxLength}c thr.</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-400">
          Routes each query to a specialised model. Short factual queries  simple/cheap;
          long or code-flavoured queries  complex.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-700/40 bg-amber-900/20 p-3">
        <div className="flex items-start gap-2">
          <Brain size={14} className="text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">Routing summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Strategy" ok hint={activeStrategy.label}                Icon={GitBranch} />
              <StatPill label="Simple"   ok hint={payload.simpleModel.split('/').pop()}  Icon={Brain} />
              <StatPill label="Complex"  ok hint={payload.complexModel.split('/').pop()} Icon={Brain} />
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Sliders size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Routing strategy</h4>
        </header>
        <div className="flex flex-wrap gap-1.5">
          {STRATEGIES.map((s) => (
            <ToggleChip
              key={s.value}
              checked={payload.strategy === s.value}
              onChange={() => setField('strategy', s.value)}
              label={s.label}
              help={s.hint}
            />
          ))}
        </div>
        <div className="pt-1">
          <FieldLabel title="Simple-query max length (chars)" help="Below this length  simple model." />
          <input
            type="number"
            min={10}
            max={2000}
            value={payload.simpleQueryMaxLength}
            onChange={(e) => setField('simpleQueryMaxLength', Number(e.target.value))}
            className={inputClass}
          />
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-700/50 bg-[#0d1117] p-3">
        <header className="flex items-center gap-2">
          <Brain size={12} className="text-amber-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Model pool</h4>
        </header>
        <div>
          <FieldLabel title="Fallback model" help="Used when no rule matches." />
          <input type="text" value={payload.fallbackModel} onChange={(e) => setField('fallbackModel', e.target.value)} className={inputClass} />
        </div>
        <div>
          <FieldLabel title="Simple queries" />
          <input type="text" value={payload.simpleModel} onChange={(e) => setField('simpleModel', e.target.value)} className={inputClass} />
        </div>
        <div>
          <FieldLabel title="Complex queries" />
          <input type="text" value={payload.complexModel} onChange={(e) => setField('complexModel', e.target.value)} className={inputClass} />
        </div>
        <div>
          <FieldLabel title="Code queries (optional)" />
          <input
            type="text"
            value={payload.codeModel}
            placeholder="e.g. anthropic/claude-3.5-sonnet"
            onChange={(e) => setField('codeModel', e.target.value)}
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
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-700/40 bg-amber-900/20 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-300">
          <CheckCircle2 size={11} /> Router configured.
        </div>
      )}

      <details className="rounded-2xl border border-slate-700/50 bg-slate-800/40/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-amber-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-[#0d1117] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Zap size={11} className="text-amber-400" />
        Output: <span className="font-mono text-amber-400">text  selected_model</span>
      </div>
    </div>
  );
}
