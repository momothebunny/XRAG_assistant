/**
 * QueryRewriterSettingsPanel — cyan-themed query reformulation inspector.
 *
 * Backend contract (`process-query-rewriter` in
 * `backend/app/canvas/nodes.py::_exec_query_rewriter`):
 *   { strategy, expansionTerms, variants, model, temperature,
 *     preserveOriginal }
 *
 * Inputs: `text` (Question or upstream). Outputs: `text`, `query`,
 * `original`. Backend currently appends synthetic expansion tokens — the
 * additional keys travel so a richer LLM-driven implementation can use them.
 */

import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Pencil,
  Search,
  Sparkles,
  Wand2,
  Zap,
} from 'lucide-react';

const STRATEGIES = [
  { value: 'intent-aware', label: 'Intent-aware', hint: 'Detect intent, reformulate' },
  { value: 'multi-query',  label: 'Multi-query',  hint: 'N parallel variants' },
  { value: 'step-back',    label: 'Step-back',    hint: 'Abstract to broader concept' },
  { value: 'decompose',    label: 'Decompose',    hint: 'Split into sub-questions' },
  { value: 'expansion',    label: 'Expansion',    hint: 'Add synonym / related terms' },
];

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50';

const FieldLabel = ({ title, help }) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</label>
    {help && (
      <span title={help} className="cursor-help text-slate-300 hover:text-cyan-500">
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
        ? 'border-cyan-300 bg-cyan-50 text-cyan-800 shadow-sm shadow-cyan-200/40'
        : 'border-slate-200 bg-white text-slate-500 hover:border-cyan-200 hover:text-cyan-700'
    }`}
  >
    <span aria-hidden className={`inline-block h-2 w-2 rounded-full transition ${checked ? 'bg-cyan-500' : 'bg-slate-300'}`} />
    {label}
  </button>
);

function StatPill({ label, hint, ok = true, Icon }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-[10px] ${ok ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-200 bg-white text-slate-500'}`}>
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
    strategy:         String(value?.strategy ?? 'intent-aware'),
    expansionTerms:   Math.max(0, Math.min(10, Number(value?.expansionTerms ?? 3))),
    variants:         Math.max(1, Math.min(10, Number(value?.variants ?? 3))),
    model:            String(value?.model ?? 'openai/gpt-4o-mini'),
    temperature:      Number(value?.temperature ?? 0.3),
    preserveOriginal: Boolean(value?.preserveOriginal ?? true),
  };
}

export default function QueryRewriterSettingsPanel({ value = {}, onChange }) {
  const setField = (k, v) => onChange?.(k, v);
  const payload = useMemo(() => buildPayload(value), [value]);
  const activeStrategy = STRATEGIES.find((s) => s.value === payload.strategy) ?? STRATEGIES[0];

  const warnings = [];
  if (payload.temperature > 1) warnings.push('Temperature > 1 yields wild rewrites — keep ≤ 0.5 for stability.');
  if (payload.strategy === 'multi-query' && payload.variants < 2) {
    warnings.push('Multi-query with only 1 variant is identical to a single rewrite.');
  }
  if (payload.strategy === 'expansion' && payload.expansionTerms === 0) {
    warnings.push('Expansion strategy with 0 expansion terms is a no-op.');
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-300 via-cyan-400 to-sky-300" />
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-50 to-sky-50 text-cyan-600 ring-1 ring-cyan-200/60">
            <Wand2 size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800">Query Rewriter</p>
            <p className="truncate font-mono text-[10.5px] text-slate-500">
              <span className="text-cyan-700">{activeStrategy.label}</span> · {payload.model}
            </p>
          </div>
          <div className="hidden @[280px]:flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-[10.5px] font-bold text-cyan-700">retrieval</span>
            <span className="font-mono text-[10px] text-slate-500">temp {payload.temperature.toFixed(2)}</span>
          </div>
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-slate-500">
          Reformulates the user query before retrieval. <span className="font-semibold text-slate-700">{activeStrategy.label}</span>{' '}
          — {activeStrategy.hint.toLowerCase()}.
        </p>
      </div>

      <div className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-3">
        <div className="flex items-start gap-2">
          <Search size={14} className="text-cyan-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-800">Rewrite summary</p>
            <div className="mt-2 grid grid-cols-2 @[280px]:grid-cols-3 gap-1.5">
              <StatPill label="Strategy"  ok hint={activeStrategy.label}   Icon={Pencil} />
              <StatPill label="Variants"  ok hint={String(payload.variants)} Icon={Sparkles} />
              <StatPill label="Expansion" ok hint={String(payload.expansionTerms)} Icon={Wand2} />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-cyan-900/80">
              Inputs: <span className="font-mono font-semibold">text</span> → outputs{' '}
              <span className="font-mono font-semibold">text</span> +{' '}
              <span className="font-mono font-semibold">query</span>.
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Pencil size={12} className="text-cyan-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Strategy</h4>
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
        <div className="grid grid-cols-1 @[280px]:grid-cols-2 gap-2 pt-1">
          <div>
            <FieldLabel title="Variants" help="Multi-query: parallel reformulations." />
            <input
              type="number"
              min={1}
              max={10}
              value={payload.variants}
              onChange={(e) => setField('variants', Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel title="Expansion terms" help="Number of related/synonym terms." />
            <input
              type="number"
              min={0}
              max={10}
              value={payload.expansionTerms}
              onChange={(e) => setField('expansionTerms', Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
        <header className="flex items-center gap-2">
          <Sparkles size={12} className="text-cyan-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">LLM</h4>
        </header>
        <div>
          <FieldLabel title="Model" help="OpenRouter model id." />
          <input
            type="text"
            value={value.model ?? 'openai/gpt-4o-mini'}
            onChange={(e) => setField('model', e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </div>
        <div>
          <FieldLabel title={`Temperature — ${payload.temperature.toFixed(2)}`} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={payload.temperature}
            onChange={(e) => setField('temperature', Number(e.target.value))}
            className="w-full accent-cyan-500"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>deterministic</span>
            <span>creative</span>
          </div>
        </div>
        <div className="pt-1">
          <ToggleChip
            checked={payload.preserveOriginal}
            onChange={(v) => setField('preserveOriginal', v)}
            label="Include original query in output"
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
        <div className="flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-cyan-800">
          <CheckCircle2 size={11} /> Rewrite configuration valid.
        </div>
      )}

      <details className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Output payload (read-only)
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-cyan-200">
{JSON.stringify(payload, null, 2)}
        </pre>
      </details>

      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Zap size={11} className="text-cyan-400" />
        Output: <span className="font-mono text-cyan-700">text + query</span>
      </div>
    </div>
  );
}
